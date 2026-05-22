from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
import re
from urllib.parse import urlencode

import requests
from django.conf import settings

from .models import PlaceCache, RouteCache
from .planner import RouteLeg, RouteTemplate


REQUEST_TIMEOUT_SECONDS = 15
MAPBOX_GEOCODING_URL = "https://api.mapbox.com/search/geocode/v6/forward"
MAPBOX_DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox/driving-traffic"


class RoutingServiceError(RuntimeError):
    pass


@dataclass(frozen=True)
class ResolvedPlace:
    query: str
    formatted_address: str
    latitude: Decimal
    longitude: Decimal
    provider: str = "mapbox"

    def route_coordinate(self) -> str:
        return f"{self.longitude},{self.latitude}"

    def route_label(self) -> dict:
        return {
            "query": self.query,
            "formatted_address": self.formatted_address,
            "latitude": float(self.latitude),
            "longitude": float(self.longitude),
            "provider": self.provider,
        }


@dataclass(frozen=True)
class TruckRoutingProfile:
    height_meters: Decimal | None = None
    width_meters: Decimal | None = None
    weight_tons: Decimal | None = None

    def as_direction_params(self) -> dict[str, str]:
        params: dict[str, str] = {}
        if self.height_meters is not None:
            params["max_height"] = _decimal_param(self.height_meters)
        if self.width_meters is not None:
            params["max_width"] = _decimal_param(self.width_meters)
        if self.weight_tons is not None:
            params["max_weight"] = _decimal_param(self.weight_tons)
        return params

    def as_summary(self) -> dict[str, float]:
        summary = {}
        if self.height_meters is not None:
            summary["max_height_meters"] = float(self.height_meters)
        if self.width_meters is not None:
            summary["max_width_meters"] = float(self.width_meters)
        if self.weight_tons is not None:
            summary["max_weight_tons"] = float(self.weight_tons)
        return summary


def build_live_route_template(
    current_location: str,
    pickup_location: str,
    dropoff_location: str,
    departure_at_iso: str | None = None,
    current_location_point: tuple[Decimal, Decimal] | None = None,
    pickup_location_point: tuple[Decimal, Decimal] | None = None,
    dropoff_location_point: tuple[Decimal, Decimal] | None = None,
    truck_profile: TruckRoutingProfile | None = None,
) -> RouteTemplate:
    _require_mapbox_token()

    truck_profile = truck_profile or TruckRoutingProfile()
    current_place = get_or_fetch_place(current_location, current_location_point)
    pickup_place = get_or_fetch_place(pickup_location, pickup_location_point)
    dropoff_place = get_or_fetch_place(dropoff_location, dropoff_location_point)

    first_leg, first_notifications = get_or_fetch_route(
        current_place,
        pickup_place,
        "Drive to pickup",
        departure_at_iso,
        truck_profile,
    )
    second_leg, second_notifications = get_or_fetch_route(
        pickup_place,
        dropoff_place,
        "Drive to dropoff",
        departure_at_iso,
        truck_profile,
    )

    notifications = tuple(first_notifications + second_notifications)
    return RouteTemplate(
        provider="mapbox/driving-traffic",
        traffic_profile="live_traffic",
        notes=_build_route_notes(truck_profile, notifications),
        truck_constraints=truck_profile.as_summary(),
        notifications=notifications,
        legs=(first_leg, second_leg),
        geometry_coordinates=tuple(
            _merge_geometry(first_leg.geometry_coordinates, second_leg.geometry_coordinates),
        ),
        waypoints=(
            {"kind": "current", **current_place.route_label()},
            {"kind": "pickup", **pickup_place.route_label()},
            {"kind": "dropoff", **dropoff_place.route_label()},
        ),
    )


def get_or_fetch_place(query: str, point: tuple[Decimal, Decimal] | None = None) -> ResolvedPlace:
    if point is not None:
        return ResolvedPlace(
            query=query,
            formatted_address=query,
            latitude=_quantize_decimal(point[0]),
            longitude=_quantize_decimal(point[1]),
            provider="mapbox-client-selection",
        )

    normalized_query = normalize_query(query)
    if settings.MAPBOX_GEOCODING_PERMANENT:
        cached_place = PlaceCache.objects.filter(normalized_query=normalized_query).first()
        if cached_place is not None:
            return _to_resolved_place(cached_place)

    params = urlencode(
        {
            "q": query,
            "access_token": settings.MAPBOX_ACCESS_TOKEN,
            "limit": 1,
            "country": "US",
            "autocomplete": "false",
            "types": "address,street,place,locality,district,postcode,region",
            "permanent": str(settings.MAPBOX_GEOCODING_PERMANENT).lower(),
        }
    )
    url = f"{MAPBOX_GEOCODING_URL}?{params}"

    try:
        response = requests.get(url, headers={"Accept": "application/json"}, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as error:
        raise RoutingServiceError(f"Unable to geocode location: {query}") from error

    features = payload.get("features", [])
    if not features:
        raise RoutingServiceError(f"Unable to resolve location: {query}")

    first_feature = features[0]
    coordinates = first_feature.get("geometry", {}).get("coordinates", [])
    if len(coordinates) < 2:
        raise RoutingServiceError(f"Location returned no coordinates: {query}")

    formatted_address = _extract_formatted_address(first_feature, query)
    resolved_place = ResolvedPlace(
        query=query,
        formatted_address=formatted_address[:255],
        latitude=_quantize_coordinate(coordinates[1]),
        longitude=_quantize_coordinate(coordinates[0]),
        provider="mapbox-geocoding-v6",
    )

    if settings.MAPBOX_GEOCODING_PERMANENT:
        PlaceCache.objects.update_or_create(
            normalized_query=normalized_query,
            defaults={
                "query": query,
                "formatted_address": resolved_place.formatted_address,
                "latitude": resolved_place.latitude,
                "longitude": resolved_place.longitude,
                "provider": "mapbox-geocoding-v6",
                "raw_data": first_feature,
            },
        )

    return resolved_place


def get_or_fetch_route(
    origin: ResolvedPlace,
    destination: ResolvedPlace,
    label: str,
    departure_at_iso: str | None,
    truck_profile: TruckRoutingProfile,
) -> tuple[RouteLeg, list[dict]]:
    cache_key = build_route_cache_key(origin, destination, departure_at_iso, truck_profile)
    cached_route = RouteCache.objects.filter(cache_key=cache_key).select_related("origin", "destination").first()
    if cached_route is not None:
        return _to_route_leg(cached_route, label), _extract_route_notifications(cached_route.raw_data)

    route_path = f"{origin.route_coordinate()};{destination.route_coordinate()}"
    params = {
        "access_token": settings.MAPBOX_ACCESS_TOKEN,
        "alternatives": "false",
        "annotations": "distance,duration,speed,congestion_numeric",
        "geometries": "geojson",
        "overview": "full",
        "steps": "true",
    }
    if departure_at_iso:
        params["depart_at"] = departure_at_iso
    params.update(truck_profile.as_direction_params())
    url = f"{MAPBOX_DIRECTIONS_URL}/{route_path}?{urlencode(params)}"

    try:
        response = requests.get(url, headers={"Accept": "application/json"}, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as error:
        raise RoutingServiceError(f"Unable to route between {origin.query} and {destination.query}") from error

    routes = payload.get("routes", [])
    if not routes:
        raise RoutingServiceError(f"Unable to build a route for {origin.query} -> {destination.query}")

    first_route = routes[0]
    origin_cache = _ensure_place_cache(origin)
    destination_cache = _ensure_place_cache(destination)
    route_cache = RouteCache.objects.create(
        cache_key=cache_key,
        provider="mapbox/driving-traffic",
        origin=origin_cache,
        destination=destination_cache,
        distance_miles=_meters_to_miles(first_route["distance"]),
        duration_minutes=_seconds_to_minutes(first_route["duration"]),
        geometry=first_route["geometry"],
        raw_data=first_route,
    )
    return _to_route_leg(route_cache, label), _extract_route_notifications(first_route)


def normalize_query(query: str) -> str:
    ascii_query = re.sub(r"[^a-z0-9]+", " ", query.strip().lower())
    return " ".join(ascii_query.split())


def build_route_cache_key(
    origin: ResolvedPlace,
    destination: ResolvedPlace,
    departure_at_iso: str | None,
    truck_profile: TruckRoutingProfile,
) -> str:
    departure_bucket = (departure_at_iso or "")[:13]
    truck_signature = ",".join(
        [
            _decimal_param(truck_profile.height_meters) if truck_profile.height_meters is not None else "-",
            _decimal_param(truck_profile.width_meters) if truck_profile.width_meters is not None else "-",
            _decimal_param(truck_profile.weight_tons) if truck_profile.weight_tons is not None else "-",
        ]
    )
    return (
        f"{origin.latitude}:{origin.longitude}->{destination.latitude}:{destination.longitude}"
        f"|depart={departure_bucket}|truck={truck_signature}"
    )


def _require_mapbox_token() -> None:
    if settings.MAPBOX_ACCESS_TOKEN:
        return

    raise RoutingServiceError("MAPBOX_ACCESS_TOKEN is not configured.")


def _to_resolved_place(place: PlaceCache) -> ResolvedPlace:
    return ResolvedPlace(
        query=place.query,
        formatted_address=place.formatted_address,
        latitude=place.latitude,
        longitude=place.longitude,
        provider=place.provider,
    )


def _ensure_place_cache(place: ResolvedPlace) -> PlaceCache:
    normalized_query = normalize_query(place.query)
    cache_defaults = {
        "query": place.query,
        "formatted_address": place.formatted_address,
        "latitude": place.latitude,
        "longitude": place.longitude,
        "provider": place.provider,
        "raw_data": {},
    }
    cache_place, _ = PlaceCache.objects.update_or_create(normalized_query=normalized_query, defaults=cache_defaults)
    return cache_place


def _extract_formatted_address(feature: dict, fallback_query: str) -> str:
    properties = feature.get("properties", {})
    return (
        properties.get("full_address")
        or properties.get("name_preferred")
        or properties.get("name")
        or feature.get("place_name")
        or fallback_query
    )


def _extract_route_notifications(route_payload: dict) -> list[dict]:
    notifications = []
    for notification in route_payload.get("notifications", []):
        details = notification.get("details", {})
        message = details.get("message") or notification.get("message") or notification.get("reason") or "Route notice"
        notifications.append(
            {
                "type": notification.get("type", "notice"),
                "subtype": notification.get("subtype", ""),
                "reason": notification.get("reason", ""),
                "message": message,
                "details": details,
            }
        )
    return notifications


def _build_route_notes(truck_profile: TruckRoutingProfile, notifications: tuple[dict, ...]) -> str:
    note_parts = ["Route geometry and travel estimates come from Mapbox driving-traffic."]
    if truck_profile.as_summary():
        note_parts.append("Truck height, width, and weight limits were included in routing.")
    if notifications:
        note_parts.append(f"{len(notifications)} route notice{'s' if len(notifications) != 1 else ''} returned by Mapbox.")
    return " ".join(note_parts)


def _to_route_leg(route_cache: RouteCache, label: str) -> RouteLeg:
    coordinates = route_cache.geometry.get("coordinates", [])
    return RouteLeg(
        label=label,
        start_location=route_cache.origin.query,
        end_location=route_cache.destination.query,
        duration_minutes=route_cache.duration_minutes,
        distance_miles=route_cache.distance_miles,
        geometry_coordinates=tuple((coordinate[1], coordinate[0]) for coordinate in coordinates),
    )


def _meters_to_miles(distance_meters: float) -> Decimal:
    miles = Decimal(str(distance_meters)) / Decimal("1609.344")
    return miles.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _seconds_to_minutes(duration_seconds: float) -> int:
    duration_minutes = Decimal(str(duration_seconds)) / Decimal("60")
    return int(duration_minutes.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _quantize_coordinate(value: float | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


def _quantize_decimal(value: Decimal | float | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


def _decimal_param(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP).normalize(), "f")


def _merge_geometry(
    first_coordinates: tuple[tuple[float, float], ...],
    second_coordinates: tuple[tuple[float, float], ...],
) -> list[tuple[float, float]]:
    if not first_coordinates:
        return list(second_coordinates)
    if not second_coordinates:
        return list(first_coordinates)

    merged = list(first_coordinates)
    merged.extend(second_coordinates[1:])
    return merged
