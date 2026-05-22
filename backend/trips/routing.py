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
GEOAPIFY_GEOCODING_URL = "https://api.geoapify.com/v1/geocode/search"


class RoutingServiceError(RuntimeError):
    pass


@dataclass(frozen=True)
class ResolvedPlace:
    query: str
    formatted_address: str
    latitude: Decimal
    longitude: Decimal
    provider: str = "geoapify"

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


def build_live_route_template(
    current_location: str,
    pickup_location: str,
    dropoff_location: str,
    current_location_point: tuple[Decimal, Decimal] | None = None,
    pickup_location_point: tuple[Decimal, Decimal] | None = None,
    dropoff_location_point: tuple[Decimal, Decimal] | None = None,
) -> RouteTemplate:
    current_place = get_or_fetch_place(current_location, current_location_point)
    pickup_place = get_or_fetch_place(pickup_location, pickup_location_point)
    dropoff_place = get_or_fetch_place(dropoff_location, dropoff_location_point)

    first_leg = get_or_fetch_route(current_place, pickup_place, "Drive to pickup")
    second_leg = get_or_fetch_route(pickup_place, dropoff_place, "Drive to dropoff")

    return RouteTemplate(
        provider="osrm",
        notes="Route geometry and travel estimates come from Geoapify geocoding and OSRM routing.",
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
            provider="geoapify-client-selection",
        )

    normalized_query = normalize_query(query)
    cached_place = PlaceCache.objects.filter(normalized_query=normalized_query).first()
    if cached_place is not None:
        return _to_resolved_place(cached_place)

    if not settings.GEOAPIFY_API_KEY:
        raise RoutingServiceError("GEOAPIFY_API_KEY is not configured.")

    params = urlencode(
        {
            "text": query,
            "apiKey": settings.GEOAPIFY_API_KEY,
            "format": "json",
            "filter": "countrycode:us",
            "limit": 1,
        }
    )
    url = f"{GEOAPIFY_GEOCODING_URL}?{params}"

    try:
        response = requests.get(url, headers={"Accept": "application/json"}, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as error:
        raise RoutingServiceError(f"Unable to geocode location: {query}") from error

    results = payload.get("results", [])
    if not results:
        raise RoutingServiceError(f"Unable to resolve location: {query}")

    first_result = results[0]
    place = PlaceCache.objects.create(
        normalized_query=normalized_query,
        query=query,
        formatted_address=(first_result.get("formatted") or query)[:255],
        latitude=_quantize_coordinate(first_result["lat"]),
        longitude=_quantize_coordinate(first_result["lon"]),
        provider="geoapify-geocoding",
        raw_data=first_result,
    )
    return _to_resolved_place(place)


def get_or_fetch_route(origin: ResolvedPlace, destination: ResolvedPlace, label: str) -> RouteLeg:
    cache_key = build_route_cache_key(origin, destination)
    cached_route = RouteCache.objects.filter(cache_key=cache_key).select_related("origin", "destination").first()
    if cached_route is not None:
        return _to_route_leg(cached_route, label)

    route_path = f"{origin.route_coordinate()};{destination.route_coordinate()}"
    params = urlencode({"overview": "full", "geometries": "geojson", "steps": "true"})
    url = f"{settings.OSRM_BASE_URL}/route/v1/driving/{route_path}?{params}"

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
        provider="osrm",
        origin=origin_cache,
        destination=destination_cache,
        distance_miles=_meters_to_miles(first_route["distance"]),
        duration_minutes=_seconds_to_minutes(first_route["duration"]),
        geometry=first_route["geometry"],
        raw_data=first_route,
    )
    return _to_route_leg(route_cache, label)


def normalize_query(query: str) -> str:
    ascii_query = re.sub(r"[^a-z0-9]+", " ", query.strip().lower())
    return " ".join(ascii_query.split())


def build_route_cache_key(origin: ResolvedPlace, destination: ResolvedPlace) -> str:
    return f"{origin.latitude}:{origin.longitude}->{destination.latitude}:{destination.longitude}"


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
    cached_place, _ = PlaceCache.objects.update_or_create(
        normalized_query=normalized_query,
        defaults={
            "query": place.query,
            "formatted_address": place.formatted_address,
            "latitude": place.latitude,
            "longitude": place.longitude,
            "provider": place.provider,
            "raw_data": {},
        },
    )
    return cached_place


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
