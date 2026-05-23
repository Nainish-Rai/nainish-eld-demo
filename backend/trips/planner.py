from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from math import cos, radians

from .eld_renderer import render_daily_log_svg


PRE_TRIP_MINUTES = 15
PICKUP_MINUTES = 60
DROP_OFF_MINUTES = 60
POST_TRIP_MINUTES = 15
BREAK_MINUTES = 30
FUEL_STOP_MINUTES = 30
TEN_HOUR_REST_MINUTES = 600
THIRTY_FOUR_HOUR_RESTART_MINUTES = 2040
MAX_DRIVING_MINUTES_PER_SHIFT = 11 * 60
MAX_DRIVING_WINDOW_MINUTES = 14 * 60
MAX_DRIVING_BEFORE_BREAK_MINUTES = 8 * 60
MAX_CYCLE_HOURS = Decimal("70.0")
MAX_MILES_BETWEEN_FUEL = Decimal("1000.0")


@dataclass(frozen=True)
class TripPlanningInput:
    current_location: str
    pickup_location: str
    dropoff_location: str
    departure_at_iso: str
    current_cycle_used_hours: Decimal


@dataclass(frozen=True)
class RouteLeg:
    label: str
    start_location: str
    end_location: str
    duration_minutes: int
    distance_miles: Decimal
    geometry_coordinates: tuple[tuple[float, float], ...] = ()


@dataclass(frozen=True)
class RouteTemplate:
    provider: str
    notes: str
    legs: tuple[RouteLeg, ...]
    geometry_coordinates: tuple[tuple[float, float], ...] = ()
    waypoints: tuple[dict, ...] = ()

    @property
    def total_distance_miles(self) -> Decimal:
        return sum((leg.distance_miles for leg in self.legs), start=Decimal("0.0"))

    @property
    def total_drive_minutes(self) -> int:
        return sum(leg.duration_minutes for leg in self.legs)


@dataclass
class DutyEvent:
    status: str
    start_at: datetime
    end_at: datetime
    location: str
    remarks: str
    miles_delta: Decimal = Decimal("0.0")
    latitude: float | None = None
    longitude: float | None = None

    @property
    def duration_minutes(self) -> int:
        return int((self.end_at - self.start_at).total_seconds() // 60)


DEFAULT_ROUTE_TEMPLATE = RouteTemplate(
    provider="static_route_template",
    notes="Fallback static route template used because live routing data is unavailable. The HOS schedule is still calculated from live rule logic.",
    legs=(
        RouteLeg(
            label="Drive to pickup",
            start_location="Chicago, IL",
            end_location="Indianapolis, IN",
            duration_minutes=90,
            distance_miles=Decimal("120.0"),
        ),
        RouteLeg(
            label="Drive to dropoff",
            start_location="Indianapolis, IN",
            end_location="Atlanta, GA",
            duration_minutes=450,
            distance_miles=Decimal("420.0"),
        ),
    ),
    geometry_coordinates=(
        (41.8781, -87.6298),
        (39.7684, -86.1581),
        (33.7490, -84.3880),
    ),
    waypoints=(
        {"kind": "current", "query": "Chicago, IL", "formatted_address": "Chicago, IL", "latitude": 41.8781, "longitude": -87.6298},
        {"kind": "pickup", "query": "Indianapolis, IN", "formatted_address": "Indianapolis, IN", "latitude": 39.7684, "longitude": -86.1581},
        {"kind": "dropoff", "query": "Atlanta, GA", "formatted_address": "Atlanta, GA", "latitude": 33.7490, "longitude": -84.3880},
    ),
)


def build_trip_plan(
    trip_input: TripPlanningInput,
    route_template: RouteTemplate = DEFAULT_ROUTE_TEMPLATE,
) -> dict:
    builder = HosPlanBuilder(trip_input=trip_input, route_template=route_template)
    return builder.build()


class HosPlanBuilder:
    def __init__(self, trip_input: TripPlanningInput, route_template: RouteTemplate) -> None:
        self.trip_input = trip_input
        self.route_template = route_template
        self.departure_at = _parse_departure(trip_input.departure_at_iso)
        self.current_time = self.departure_at
        self.events: list[DutyEvent] = []
        self.warnings: list[str] = [route_template.notes]
        self.inserted_breaks = 0
        self.inserted_fuel_stops = 0
        self.inserted_restarts = 0
        self.inserted_rest_periods = 0
        self.shift_driving_minutes = 0
        self.shift_elapsed_minutes = 0
        self.driving_since_break_minutes = 0
        self.miles_since_fuel = Decimal("0.0")
        self.remaining_cycle_minutes = int((MAX_CYCLE_HOURS - trip_input.current_cycle_used_hours) * Decimal("60"))
        self.location_points = _build_location_points(route_template)
        self.current_point = self.location_points.get(trip_input.current_location) or _first_route_point(route_template)

        self._validate_cycle_hours()

    def build(self) -> dict:
        self._schedule_on_duty(PRE_TRIP_MINUTES, self.trip_input.current_location, "Pre-trip inspection")

        drive_to_pickup, drive_to_dropoff = self.route_template.legs
        self._schedule_driving_leg(drive_to_pickup)
        self._schedule_on_duty(PICKUP_MINUTES, self.trip_input.pickup_location, "Pickup")
        self._schedule_driving_leg(drive_to_dropoff)
        self._schedule_on_duty(DROP_OFF_MINUTES, self.trip_input.dropoff_location, "Dropoff")
        self._schedule_on_duty(POST_TRIP_MINUTES, self.trip_input.dropoff_location, "Post-trip inspection")

        daily_logs = _build_daily_logs(
            self.events,
            self.departure_at.date(),
            {
                "input_summary": {
                    "current_location": self.trip_input.current_location,
                    "pickup_location": self.trip_input.pickup_location,
                    "dropoff_location": self.trip_input.dropoff_location,
                    "current_cycle_used_hours": _decimal_string(self.trip_input.current_cycle_used_hours),
                }
            },
        )

        return {
            "input_summary": {
                "current_location": self.trip_input.current_location,
                "pickup_location": self.trip_input.pickup_location,
                "dropoff_location": self.trip_input.dropoff_location,
                "departure_at": self.trip_input.departure_at_iso,
                "current_cycle_used_hours": _decimal_string(self.trip_input.current_cycle_used_hours),
            },
            "route": {
                "provider": self.route_template.provider,
                "distance_miles": float(self.route_template.total_distance_miles),
                "drive_hours": _decimal_string(Decimal(self.route_template.total_drive_minutes) / Decimal("60")),
                "notes": self.route_template.notes,
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[lon, lat] for lat, lon in self.route_template.geometry_coordinates],
                },
                "waypoints": list(self.route_template.waypoints),
                "legs": [
                    {
                        "label": leg.label,
                        "start_location": leg.start_location,
                        "end_location": leg.end_location,
                        "duration_minutes": leg.duration_minutes,
                        "distance_miles": float(leg.distance_miles),
                    }
                    for leg in self.route_template.legs
                ],
            },
            "stops": _build_stops(self.events),
            "duty_events": _build_display_duty_events(self.events),
            "daily_logs": daily_logs,
            "compliance_summary": {
                "is_placeholder": False,
                "remaining_cycle_hours": _decimal_string(Decimal(self.remaining_cycle_minutes) / Decimal("60")),
                "can_complete_today": self._completed_same_day(),
                "inserted_breaks": self.inserted_breaks,
                "inserted_fuel_stops": self.inserted_fuel_stops,
                "inserted_rest_periods": self.inserted_rest_periods,
                "inserted_restarts": self.inserted_restarts,
                "rule_set": {
                    "driver_type": "property_carrying",
                    "cycle": "70_hours_8_days",
                    "start_assumption": "10_hours_off_duty_completed",
                    "daily_driving_limit_hours": 11,
                    "driving_window_hours": 14,
                    "break_after_driving_hours": 8,
                    "fuel_interval_miles": float(MAX_MILES_BETWEEN_FUEL),
                    "adverse_conditions": "disabled",
                },
                "warnings": self.warnings,
            },
        }

    def _validate_cycle_hours(self) -> None:
        assert self.trip_input.current_cycle_used_hours >= 0, "cycle hours must be non-negative"
        assert self.trip_input.current_cycle_used_hours <= MAX_CYCLE_HOURS, "cycle hours cannot exceed 70"

    def _schedule_on_duty(
        self,
        duration_minutes: int,
        location: str,
        remarks: str,
        point: tuple[float, float] | None = None,
    ) -> None:
        minutes_remaining = duration_minutes

        while minutes_remaining > 0:
            self._insert_restart_if_cycle_exhausted()
            chunk_minutes = min(minutes_remaining, self.remaining_cycle_minutes)
            self._append_event("on_duty", chunk_minutes, location, remarks, point=point or self._point_for_location(location))
            self._consume_shift_time(chunk_minutes)
            self.remaining_cycle_minutes -= chunk_minutes
            minutes_remaining -= chunk_minutes

    def _schedule_driving_leg(self, leg: RouteLeg) -> None:
        minutes_remaining = leg.duration_minutes
        miles_remaining = leg.distance_miles
        elapsed_leg_minutes = 0

        while minutes_remaining > 0:
            self._insert_restart_if_cycle_exhausted()
            self._insert_ten_hour_rest_if_shift_blocks_driving()
            self._insert_break_if_required()
            self._insert_fuel_if_required()

            chunk_minutes = self._available_driving_chunk(minutes_remaining)
            if chunk_minutes <= 0:
                self._insert_ten_hour_rest_if_shift_blocks_driving()
                continue

            chunk_minutes = self._limit_chunk_to_next_fuel_stop(leg, chunk_minutes)

            chunk_miles = _allocate_miles(leg.distance_miles, leg.duration_minutes, miles_remaining, chunk_minutes)
            start_point = _coordinate_at_leg_minute(leg, elapsed_leg_minutes) or self._point_for_location(leg.start_location)
            end_point = _coordinate_at_leg_minute(leg, elapsed_leg_minutes + chunk_minutes) or self._point_for_location(leg.end_location)
            self._append_event("driving", chunk_minutes, leg.start_location, leg.label, chunk_miles, point=start_point)
            self.current_point = end_point
            self._consume_shift_time(chunk_minutes)
            self.shift_driving_minutes += chunk_minutes
            self.driving_since_break_minutes += chunk_minutes
            self.remaining_cycle_minutes -= chunk_minutes
            self.miles_since_fuel += chunk_miles
            minutes_remaining -= chunk_minutes
            miles_remaining -= chunk_miles
            elapsed_leg_minutes += chunk_minutes

    def _insert_break_if_required(self) -> None:
        if self.driving_since_break_minutes < MAX_DRIVING_BEFORE_BREAK_MINUTES:
            return

        self.inserted_breaks += 1
        self._append_event(
            "off_duty",
            BREAK_MINUTES,
            self._current_location(),
            "30-minute break required before more driving",
            point=self.current_point,
        )
        self.shift_elapsed_minutes += BREAK_MINUTES
        self.driving_since_break_minutes = 0

    def _insert_fuel_if_required(self) -> None:
        if self.miles_since_fuel < MAX_MILES_BETWEEN_FUEL:
            return

        self.inserted_fuel_stops += 1
        self._schedule_on_duty(
            FUEL_STOP_MINUTES,
            self._current_location(),
            "Fuel stop required by 1,000-mile planning rule",
            point=self.current_point,
        )
        self.miles_since_fuel = Decimal("0.0")

    def _insert_ten_hour_rest_if_shift_blocks_driving(self) -> None:
        if self.shift_driving_minutes < MAX_DRIVING_MINUTES_PER_SHIFT and self.shift_elapsed_minutes < MAX_DRIVING_WINDOW_MINUTES:
            return

        self.inserted_rest_periods += 1
        self._append_event(
            "sleeper_berth",
            TEN_HOUR_REST_MINUTES,
            self._current_location(),
            "10-hour rest required before more driving",
            point=self.current_point,
        )
        self.shift_driving_minutes = 0
        self.shift_elapsed_minutes = 0
        self.driving_since_break_minutes = 0

    def _insert_restart_if_cycle_exhausted(self) -> None:
        if self.remaining_cycle_minutes > 0:
            return

        self.inserted_restarts += 1
        if "Cycle hours exhausted. Scheduler assumes a 34-hour restart because only aggregate cycle hours were provided." not in self.warnings:
            self.warnings.append(
                "Cycle hours exhausted. Scheduler assumes a 34-hour restart because only aggregate cycle hours were provided."
            )
        self._append_event(
            "off_duty",
            THIRTY_FOUR_HOUR_RESTART_MINUTES,
            self._current_location(),
            "34-hour restart to recover available cycle hours",
            point=self.current_point,
        )
        self.remaining_cycle_minutes = int(MAX_CYCLE_HOURS * Decimal("60"))
        self.shift_driving_minutes = 0
        self.shift_elapsed_minutes = 0
        self.driving_since_break_minutes = 0

    def _available_driving_chunk(self, requested_minutes: int) -> int:
        limits = [
            requested_minutes,
            self.remaining_cycle_minutes,
            MAX_DRIVING_MINUTES_PER_SHIFT - self.shift_driving_minutes,
            MAX_DRIVING_WINDOW_MINUTES - self.shift_elapsed_minutes,
            MAX_DRIVING_BEFORE_BREAK_MINUTES - self.driving_since_break_minutes,
        ]
        return max(0, min(limits))

    def _limit_chunk_to_next_fuel_stop(self, leg: RouteLeg, chunk_minutes: int) -> int:
        distance_until_fuel = MAX_MILES_BETWEEN_FUEL - self.miles_since_fuel
        if distance_until_fuel <= 0 or leg.distance_miles <= 0 or leg.duration_minutes <= 0:
            return chunk_minutes

        fuel_limit_minutes = int((distance_until_fuel * Decimal(leg.duration_minutes)) / leg.distance_miles)
        if fuel_limit_minutes <= 0:
            return min(chunk_minutes, 1)
        return min(chunk_minutes, fuel_limit_minutes)

    def _append_event(
        self,
        status: str,
        duration_minutes: int,
        location: str,
        remarks: str,
        miles_delta: Decimal = Decimal("0.0"),
        point: tuple[float, float] | None = None,
    ) -> None:
        if duration_minutes <= 0:
            return

        event_point = point or self.current_point
        event = DutyEvent(
            status=status,
            start_at=self.current_time,
            end_at=self.current_time + timedelta(minutes=duration_minutes),
            location=location,
            remarks=remarks,
            miles_delta=miles_delta,
            latitude=event_point[0] if event_point else None,
            longitude=event_point[1] if event_point else None,
        )
        self.events.append(event)
        self.current_time = event.end_at
        self.current_point = event_point

    def _consume_shift_time(self, duration_minutes: int) -> None:
        self.shift_elapsed_minutes += duration_minutes

    def _current_location(self) -> str:
        if not self.events:
            return self.trip_input.current_location
        return self.events[-1].location

    def _point_for_location(self, location: str) -> tuple[float, float] | None:
        return self.location_points.get(location) or self.current_point

    def _completed_same_day(self) -> bool:
        if not self.events:
            return True
        return self.events[-1].end_at.date() == _parse_departure(self.trip_input.departure_at_iso).date()


def _build_stops(events: list[DutyEvent]) -> list[dict]:
    stops = []

    for event in events:
        if event.status == "driving":
            continue

        stops.append(
            {
                "kind": _classify_stop_kind(event),
                "duration_minutes": event.duration_minutes,
                "location": event.location,
                "reason": event.remarks,
                "latitude": event.latitude,
                "longitude": event.longitude,
                "status": event.status,
                "start_at": event.start_at.isoformat(),
                "end_at": event.end_at.isoformat(),
            }
        )

    return stops


def _classify_stop_kind(event: DutyEvent) -> str:
    remarks = event.remarks.lower()
    if "pre-trip" in remarks:
        return "pre_trip"
    if "pickup" in remarks:
        return "pickup"
    if "dropoff" in remarks:
        return "dropoff"
    if "post-trip" in remarks:
        return "post_trip"
    if "fuel stop" in remarks:
        return "fuel"
    if "30-minute break" in remarks:
        return "break"
    if "34-hour restart" in remarks:
        return "restart"
    if event.status == "sleeper_berth":
        return "rest"
    return event.status


def _build_daily_logs(events: list[DutyEvent], departure_date, plan_context: dict) -> list[dict]:
    if not events:
        return []

    first_day = datetime.combine(departure_date, time.min, tzinfo=events[0].start_at.tzinfo)
    final_end = events[-1].end_at
    daily_logs = []
    day_start = first_day

    while day_start < final_end:
        day_end = day_start + timedelta(days=1)
        clipped_events = []
        cursor = day_start
        totals = {
            "off_duty": 0,
            "sleeper_berth": 0,
            "driving": 0,
            "on_duty": 0,
        }

        for event in events:
            if event.end_at <= day_start or event.start_at >= day_end:
                continue

            clip_start = max(event.start_at, day_start)
            clip_end = min(event.end_at, day_end)

            if clip_start > cursor:
                filler_minutes = int((clip_start - cursor).total_seconds() // 60)
                totals["off_duty"] += filler_minutes
                clipped_events.append(
                    _serialize_clipped_event("off_duty", cursor, clip_start, event.location, "Off duty", Decimal("0.0"))
                )

            clipped_miles = _clip_event_miles(event, clip_start, clip_end)
            clipped_events.append(
                _serialize_clipped_event(event.status, clip_start, clip_end, event.location, event.remarks, clipped_miles)
            )
            totals[event.status] += int((clip_end - clip_start).total_seconds() // 60)
            cursor = clip_end

        if cursor < day_end:
            filler_minutes = int((day_end - cursor).total_seconds() // 60)
            totals["off_duty"] += filler_minutes
            final_release = cursor == final_end
            clipped_events.append(
                _serialize_clipped_event(
                    "off_duty",
                    cursor,
                    day_end,
                    events[-1].location,
                    "Off duty / released from work" if final_release else "Off duty",
                    Decimal("0.0"),
                )
            )

        assert sum(totals.values()) == 1440, "daily log totals must equal 24 hours"
        daily_log = {
            "date": day_start.date().isoformat(),
            "totals_minutes": totals,
            "events": clipped_events,
            "notes": "Generated by the HOS rules engine.",
        }
        daily_log["sheet_svg"] = render_daily_log_svg(daily_log, plan_context)
        daily_logs.append(daily_log)
        day_start = day_end

    return daily_logs


def _build_display_duty_events(events: list[DutyEvent]) -> list[dict]:
    serialized_events = [_serialize_event(event) for event in events]
    if not events:
        return serialized_events

    final_event = events[-1]
    release_start = final_event.end_at
    release_end = datetime.combine(
        release_start.date() + timedelta(days=1),
        time.min,
        tzinfo=release_start.tzinfo,
    )
    if release_start >= release_end:
        return serialized_events

    serialized_events.append(
        _serialize_clipped_event(
            "off_duty",
            release_start,
            release_end,
            final_event.location,
            "Off duty / released from work",
            Decimal("0.0"),
        )
    )
    return serialized_events


def _serialize_event(event: DutyEvent) -> dict:
    return {
        "status": event.status,
        "start_at": event.start_at.isoformat(),
        "end_at": event.end_at.isoformat(),
        "duration_minutes": event.duration_minutes,
        "location": event.location,
        "remarks": event.remarks,
        "duration_hours": _decimal_string(Decimal(event.duration_minutes) / Decimal("60")),
        "duration": str(event.end_at - event.start_at),
        "miles_delta": float(event.miles_delta.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)),
        "latitude": event.latitude,
        "longitude": event.longitude,
    }


def _serialize_clipped_event(
    status: str,
    start_at: datetime,
    end_at: datetime,
    location: str,
    remarks: str,
    miles_delta: Decimal,
) -> dict:
    duration_minutes = int((end_at - start_at).total_seconds() // 60)
    return {
        "status": status,
        "start_at": start_at.isoformat(),
        "end_at": end_at.isoformat(),
        "duration_minutes": duration_minutes,
        "location": location,
        "remarks": remarks,
        "miles_delta": float(miles_delta.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)),
    }


def _build_location_points(route_template: RouteTemplate) -> dict[str, tuple[float, float]]:
    points = {}
    for waypoint in route_template.waypoints:
        latitude = waypoint.get("latitude")
        longitude = waypoint.get("longitude")
        if latitude is None or longitude is None:
            continue

        point = (float(latitude), float(longitude))
        query = waypoint.get("query")
        formatted_address = waypoint.get("formatted_address")
        if query:
            points[str(query)] = point
        if formatted_address:
            points[str(formatted_address)] = point

    return points


def _first_route_point(route_template: RouteTemplate) -> tuple[float, float] | None:
    if route_template.geometry_coordinates:
        latitude, longitude = route_template.geometry_coordinates[0]
        return (float(latitude), float(longitude))
    return None


def _coordinate_at_leg_minute(leg: RouteLeg, minute: int) -> tuple[float, float] | None:
    if not leg.geometry_coordinates:
        return None
    if leg.duration_minutes <= 0:
        latitude, longitude = leg.geometry_coordinates[0]
        return (float(latitude), float(longitude))

    progress = max(0.0, min(1.0, minute / leg.duration_minutes))
    return _coordinate_at_progress(leg.geometry_coordinates, progress)


def _coordinate_at_progress(
    coordinates: tuple[tuple[float, float], ...],
    progress: float,
) -> tuple[float, float] | None:
    if not coordinates:
        return None
    if len(coordinates) == 1 or progress <= 0:
        latitude, longitude = coordinates[0]
        return (float(latitude), float(longitude))
    if progress >= 1:
        latitude, longitude = coordinates[-1]
        return (float(latitude), float(longitude))

    segment_lengths = [
        _coordinate_distance_miles(start, end)
        for start, end in zip(coordinates, coordinates[1:])
    ]
    total_length = sum(segment_lengths)
    if total_length <= 0:
        index = min(len(coordinates) - 1, round(progress * (len(coordinates) - 1)))
        latitude, longitude = coordinates[index]
        return (float(latitude), float(longitude))

    target_length = total_length * progress
    traversed = 0.0
    for index, segment_length in enumerate(segment_lengths):
        if traversed + segment_length < target_length:
            traversed += segment_length
            continue

        segment_progress = 0.0 if segment_length == 0 else (target_length - traversed) / segment_length
        start_latitude, start_longitude = coordinates[index]
        end_latitude, end_longitude = coordinates[index + 1]
        return (
            float(start_latitude + (end_latitude - start_latitude) * segment_progress),
            float(start_longitude + (end_longitude - start_longitude) * segment_progress),
        )

    latitude, longitude = coordinates[-1]
    return (float(latitude), float(longitude))


def _coordinate_distance_miles(start: tuple[float, float], end: tuple[float, float]) -> float:
    start_latitude, start_longitude = start
    end_latitude, end_longitude = end
    latitude_delta = end_latitude - start_latitude
    longitude_delta = (end_longitude - start_longitude) * cos(radians((start_latitude + end_latitude) / 2))
    return (latitude_delta**2 + longitude_delta**2) ** 0.5


def _clip_event_miles(event: DutyEvent, clip_start: datetime, clip_end: datetime) -> Decimal:
    if event.miles_delta <= 0:
        return Decimal("0.0")

    clipped_minutes = int((clip_end - clip_start).total_seconds() // 60)
    return _allocate_miles(event.miles_delta, event.duration_minutes, event.miles_delta, clipped_minutes)


def _allocate_miles(
    total_miles: Decimal,
    total_minutes: int,
    miles_remaining: Decimal,
    chunk_minutes: int,
) -> Decimal:
    if chunk_minutes == total_minutes:
        return miles_remaining

    raw_miles = (total_miles * Decimal(chunk_minutes)) / Decimal(total_minutes)
    quantized_miles = raw_miles.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return min(quantized_miles, miles_remaining)


def _decimal_string(value: Decimal) -> str:
    normalized = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP).normalize()
    return format(normalized, "f")


def _parse_departure(departure_at_iso: str) -> datetime:
    return datetime.fromisoformat(departure_at_iso.replace("Z", "+00:00"))
