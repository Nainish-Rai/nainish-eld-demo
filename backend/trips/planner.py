from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP


PRE_TRIP_MINUTES = 15
PICKUP_MINUTES = 60
DROP_OFF_MINUTES = 60
POST_TRIP_MINUTES = 15
BREAK_MINUTES = 30
TEN_HOUR_REST_MINUTES = 600
THIRTY_FOUR_HOUR_RESTART_MINUTES = 2040
MAX_DRIVING_MINUTES_PER_SHIFT = 11 * 60
MAX_DRIVING_WINDOW_MINUTES = 14 * 60
MAX_DRIVING_BEFORE_BREAK_MINUTES = 8 * 60
MAX_CYCLE_HOURS = Decimal("70.0")


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


@dataclass(frozen=True)
class RouteTemplate:
    provider: str
    notes: str
    legs: tuple[RouteLeg, ...]

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

    @property
    def duration_minutes(self) -> int:
        return int((self.end_at - self.start_at).total_seconds() // 60)


DEFAULT_ROUTE_TEMPLATE = RouteTemplate(
    provider="static_route_template",
    notes="Route geometry is still using a static template. The HOS schedule is calculated from live rule logic.",
    legs=(
        RouteLeg(
            label="Drive to pickup",
            start_location="current_location",
            end_location="pickup_location",
            duration_minutes=90,
            distance_miles=Decimal("120.0"),
        ),
        RouteLeg(
            label="Drive to dropoff",
            start_location="pickup_location",
            end_location="dropoff_location",
            duration_minutes=450,
            distance_miles=Decimal("420.0"),
        ),
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
        self.inserted_restarts = 0
        self.inserted_rest_periods = 0
        self.shift_driving_minutes = 0
        self.shift_elapsed_minutes = 0
        self.driving_since_break_minutes = 0
        self.remaining_cycle_minutes = int((MAX_CYCLE_HOURS - trip_input.current_cycle_used_hours) * Decimal("60"))

        self._validate_cycle_hours()

    def build(self) -> dict:
        self._schedule_on_duty(PRE_TRIP_MINUTES, self.trip_input.current_location, "Pre-trip inspection")

        drive_to_pickup, drive_to_dropoff = self.route_template.legs
        self._schedule_driving_leg(drive_to_pickup)
        self._schedule_on_duty(PICKUP_MINUTES, self.trip_input.pickup_location, "Pickup")
        self._schedule_driving_leg(drive_to_dropoff)
        self._schedule_on_duty(DROP_OFF_MINUTES, self.trip_input.dropoff_location, "Dropoff")
        self._schedule_on_duty(POST_TRIP_MINUTES, self.trip_input.dropoff_location, "Post-trip inspection")

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
            },
            "stops": _build_stops(self.events),
            "duty_events": [_serialize_event(event) for event in self.events],
            "daily_logs": _build_daily_logs(self.events, self.departure_at.date()),
            "compliance_summary": {
                "is_placeholder": False,
                "remaining_cycle_hours": _decimal_string(Decimal(self.remaining_cycle_minutes) / Decimal("60")),
                "can_complete_today": self._completed_same_day(),
                "inserted_breaks": self.inserted_breaks,
                "inserted_rest_periods": self.inserted_rest_periods,
                "inserted_restarts": self.inserted_restarts,
                "warnings": self.warnings,
            },
        }

    def _validate_cycle_hours(self) -> None:
        assert self.trip_input.current_cycle_used_hours >= 0, "cycle hours must be non-negative"
        assert self.trip_input.current_cycle_used_hours <= MAX_CYCLE_HOURS, "cycle hours cannot exceed 70"

    def _schedule_on_duty(self, duration_minutes: int, location: str, remarks: str) -> None:
        minutes_remaining = duration_minutes

        while minutes_remaining > 0:
            self._insert_restart_if_cycle_exhausted()
            chunk_minutes = min(minutes_remaining, self.remaining_cycle_minutes)
            self._append_event("on_duty", chunk_minutes, location, remarks)
            self._consume_shift_time(chunk_minutes)
            self.remaining_cycle_minutes -= chunk_minutes
            minutes_remaining -= chunk_minutes

    def _schedule_driving_leg(self, leg: RouteLeg) -> None:
        minutes_remaining = leg.duration_minutes
        miles_remaining = leg.distance_miles

        while minutes_remaining > 0:
            self._insert_restart_if_cycle_exhausted()
            self._insert_ten_hour_rest_if_shift_blocks_driving()
            self._insert_break_if_required()

            chunk_minutes = self._available_driving_chunk(minutes_remaining)
            if chunk_minutes <= 0:
                self._insert_ten_hour_rest_if_shift_blocks_driving()
                continue

            chunk_miles = _allocate_miles(leg.distance_miles, leg.duration_minutes, miles_remaining, chunk_minutes)
            self._append_event("driving", chunk_minutes, self._resolve_location(leg.start_location), leg.label, chunk_miles)
            self._consume_shift_time(chunk_minutes)
            self.shift_driving_minutes += chunk_minutes
            self.driving_since_break_minutes += chunk_minutes
            self.remaining_cycle_minutes -= chunk_minutes
            minutes_remaining -= chunk_minutes
            miles_remaining -= chunk_miles

    def _insert_break_if_required(self) -> None:
        if self.driving_since_break_minutes < MAX_DRIVING_BEFORE_BREAK_MINUTES:
            return

        self.inserted_breaks += 1
        self._append_event("off_duty", BREAK_MINUTES, self._current_location(), "30-minute break required before more driving")
        self.shift_elapsed_minutes += BREAK_MINUTES
        self.driving_since_break_minutes = 0

    def _insert_ten_hour_rest_if_shift_blocks_driving(self) -> None:
        if self.shift_driving_minutes < MAX_DRIVING_MINUTES_PER_SHIFT and self.shift_elapsed_minutes < MAX_DRIVING_WINDOW_MINUTES:
            return

        self.inserted_rest_periods += 1
        self._append_event(
            "sleeper_berth",
            TEN_HOUR_REST_MINUTES,
            self._current_location(),
            "10-hour rest required before more driving",
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

    def _append_event(
        self,
        status: str,
        duration_minutes: int,
        location: str,
        remarks: str,
        miles_delta: Decimal = Decimal("0.0"),
    ) -> None:
        if duration_minutes <= 0:
            return

        event = DutyEvent(
            status=status,
            start_at=self.current_time,
            end_at=self.current_time + timedelta(minutes=duration_minutes),
            location=location,
            remarks=remarks,
            miles_delta=miles_delta,
        )
        self.events.append(event)
        self.current_time = event.end_at

    def _consume_shift_time(self, duration_minutes: int) -> None:
        self.shift_elapsed_minutes += duration_minutes

    def _resolve_location(self, alias: str) -> str:
        return getattr(self.trip_input, alias)

    def _current_location(self) -> str:
        if not self.events:
            return self.trip_input.current_location
        return self.events[-1].location

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
    if "30-minute break" in remarks:
        return "break"
    if "34-hour restart" in remarks:
        return "restart"
    if event.status == "sleeper_berth":
        return "rest"
    return event.status


def _build_daily_logs(events: list[DutyEvent], departure_date) -> list[dict]:
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
                clipped_events.append(_serialize_clipped_event("off_duty", cursor, clip_start, event.location, "Off duty"))

            clipped_events.append(_serialize_clipped_event(event.status, clip_start, clip_end, event.location, event.remarks))
            totals[event.status] += int((clip_end - clip_start).total_seconds() // 60)
            cursor = clip_end

        if cursor < day_end:
            filler_minutes = int((day_end - cursor).total_seconds() // 60)
            totals["off_duty"] += filler_minutes
            clipped_events.append(_serialize_clipped_event("off_duty", cursor, day_end, events[-1].location, "Off duty"))

        assert sum(totals.values()) == 1440, "daily log totals must equal 24 hours"
        daily_logs.append(
            {
                "date": day_start.date().isoformat(),
                "totals_minutes": totals,
                "events": clipped_events,
                "notes": "Generated by the HOS rules engine.",
            }
        )
        day_start = day_end

    return daily_logs


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
    }


def _serialize_clipped_event(status: str, start_at: datetime, end_at: datetime, location: str, remarks: str) -> dict:
    duration_minutes = int((end_at - start_at).total_seconds() // 60)
    return {
        "status": status,
        "start_at": start_at.isoformat(),
        "end_at": end_at.isoformat(),
        "duration_minutes": duration_minutes,
        "location": location,
        "remarks": remarks,
    }


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
