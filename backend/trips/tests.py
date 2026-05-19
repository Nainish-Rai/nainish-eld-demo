from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .models import PlaceCache, RouteCache, TripRequest
from .planner import RouteLeg, RouteTemplate, TripPlanningInput, build_trip_plan
from .routing import build_live_route_template, normalize_query


class TripPlanApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("trips.views.build_live_route_template")
    def test_plan_trip_creates_persisted_request_and_returns_live_hos_plan(self, mock_route_template):
        mock_route_template.return_value = _default_route_template()

        response = self.client.post(
            reverse("plan-trip"),
            {
                "current_location": "Chicago, IL",
                "pickup_location": "Indianapolis, IN",
                "dropoff_location": "Atlanta, GA",
                "departure_at": "2026-05-19T08:00:00Z",
                "current_cycle_used_hours": "12.50",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TripRequest.objects.count(), 1)
        self.assertFalse(response.data["plan"]["compliance_summary"]["is_placeholder"])
        self.assertEqual(response.data["plan"]["compliance_summary"]["inserted_breaks"], 1)

    @patch("trips.views.build_live_route_template")
    def test_plan_trip_rejects_cycle_hours_above_limit(self, mock_route_template):
        mock_route_template.return_value = _default_route_template()

        response = self.client.post(
            reverse("plan-trip"),
            {
                "current_location": "Chicago, IL",
                "pickup_location": "Indianapolis, IN",
                "dropoff_location": "Atlanta, GA",
                "departure_at": "2026-05-19T08:00:00Z",
                "current_cycle_used_hours": "71.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(TripRequest.objects.count(), 0)

    @patch("trips.views.build_live_route_template")
    def test_get_trip_returns_saved_record(self, mock_route_template):
        mock_route_template.return_value = _default_route_template()

        create_response = self.client.post(
            reverse("plan-trip"),
            {
                "current_location": "Chicago, IL",
                "pickup_location": "Indianapolis, IN",
                "dropoff_location": "Atlanta, GA",
                "departure_at": "2026-05-19T08:00:00Z",
                "current_cycle_used_hours": "8.00",
            },
            format="json",
        )

        trip_id = create_response.data["trip_id"]
        response = self.client.get(reverse("get-trip", kwargs={"trip_id": trip_id}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["current_location"], "Chicago, IL")
        self.assertIn("route", response.data["plan_data"])


class HosPlannerTests(TestCase):
    def test_standard_route_inserts_30_minute_break_after_eight_hours_of_driving(self):
        plan = build_trip_plan(_trip_input(), route_template=_default_route_template())

        break_events = [
            event
            for event in plan["duty_events"]
            if event["status"] == "off_duty" and "30-minute break" in event["remarks"]
        ]

        self.assertEqual(len(break_events), 1)
        self.assertEqual(break_events[0]["duration_minutes"], 30)
        self.assertEqual(plan["daily_logs"][0]["totals_minutes"]["driving"], 540)
        self.assertEqual(plan["daily_logs"][0]["totals_minutes"]["on_duty"], 150)

    def test_long_drive_spills_into_second_shift_after_ten_hour_rest(self):
        long_route = RouteTemplate(
            provider="test",
            notes="test route",
            legs=(
                RouteLeg("Drive to pickup", "Chicago, IL", "Indianapolis, IN", 60, Decimal("80.0")),
                RouteLeg("Drive to dropoff", "Indianapolis, IN", "Atlanta, GA", 720, Decimal("640.0")),
            ),
        )

        plan = build_trip_plan(_trip_input(), route_template=long_route)

        rest_events = [
            event
            for event in plan["duty_events"]
            if event["status"] == "sleeper_berth" and "10-hour rest required" in event["remarks"]
        ]

        self.assertEqual(len(rest_events), 1)
        self.assertGreaterEqual(len(plan["daily_logs"]), 2)
        self.assertEqual(plan["compliance_summary"]["inserted_rest_periods"], 1)

    def test_cycle_exhaustion_triggers_restart_warning_and_restart_event(self):
        plan = build_trip_plan(_trip_input(current_cycle_used_hours=Decimal("69.00")), route_template=_default_route_template())

        restart_events = [
            event
            for event in plan["duty_events"]
            if event["status"] == "off_duty" and "34-hour restart" in event["remarks"]
        ]

        self.assertEqual(len(restart_events), 1)
        self.assertEqual(plan["compliance_summary"]["inserted_restarts"], 1)
        self.assertTrue(
            any("34-hour restart" in warning for warning in plan["compliance_summary"]["warnings"])
        )


class RoutingCacheTests(TestCase):
    @patch("trips.routing.requests.get")
    def test_build_live_route_template_populates_place_and_route_cache(self, mock_get):
        mock_get.side_effect = [
            _mock_response([_geocode_result("Chicago, IL", "Chicago, IL", "41.8781", "-87.6298")]),
            _mock_response([_geocode_result("Indianapolis, IN", "Indianapolis, IN", "39.7684", "-86.1581")]),
            _mock_response([_geocode_result("Atlanta, GA", "Atlanta, GA", "33.7490", "-84.3880")]),
            _mock_response(_route_result(193121.0, 5400.0, [[-87.6298, 41.8781], [-86.1581, 39.7684]])),
            _mock_response(_route_result(676000.0, 27000.0, [[-86.1581, 39.7684], [-84.3880, 33.7490]])),
        ]

        route_template = build_live_route_template("Chicago, IL", "Indianapolis, IN", "Atlanta, GA")

        self.assertEqual(PlaceCache.objects.count(), 3)
        self.assertEqual(RouteCache.objects.count(), 2)
        self.assertEqual(route_template.provider, "osrm")
        self.assertEqual(route_template.total_drive_minutes, 5400 // 60 + 27000 // 60)

    @patch("trips.routing.requests.get")
    def test_second_route_request_uses_cache(self, mock_get):
        mock_get.side_effect = [
            _mock_response([_geocode_result("Chicago, IL", "Chicago, IL", "41.8781", "-87.6298")]),
            _mock_response([_geocode_result("Indianapolis, IN", "Indianapolis, IN", "39.7684", "-86.1581")]),
            _mock_response([_geocode_result("Atlanta, GA", "Atlanta, GA", "33.7490", "-84.3880")]),
            _mock_response(_route_result(193121.0, 5400.0, [[-87.6298, 41.8781], [-86.1581, 39.7684]])),
            _mock_response(_route_result(676000.0, 27000.0, [[-86.1581, 39.7684], [-84.3880, 33.7490]])),
        ]

        build_live_route_template("Chicago, IL", "Indianapolis, IN", "Atlanta, GA")
        build_live_route_template("Chicago, IL", "Indianapolis, IN", "Atlanta, GA")

        self.assertEqual(mock_get.call_count, 5)
        self.assertEqual(normalize_query("  Chicago   IL "), "chicago il")


def _trip_input(current_cycle_used_hours: Decimal = Decimal("12.50")) -> TripPlanningInput:
    return TripPlanningInput(
        current_location="Chicago, IL",
        pickup_location="Indianapolis, IN",
        dropoff_location="Atlanta, GA",
        departure_at_iso="2026-05-19T08:00:00+00:00",
        current_cycle_used_hours=current_cycle_used_hours,
    )


def _default_route_template() -> RouteTemplate:
    return RouteTemplate(
        provider="test",
        notes="test route",
        legs=(
            RouteLeg("Drive to pickup", "Chicago, IL", "Indianapolis, IN", 90, Decimal("120.0")),
            RouteLeg("Drive to dropoff", "Indianapolis, IN", "Atlanta, GA", 450, Decimal("420.0")),
        ),
        geometry_coordinates=((41.8781, -87.6298), (39.7684, -86.1581), (33.7490, -84.3880)),
        waypoints=(
            {"kind": "current", "query": "Chicago, IL", "formatted_address": "Chicago, IL", "latitude": 41.8781, "longitude": -87.6298},
            {"kind": "pickup", "query": "Indianapolis, IN", "formatted_address": "Indianapolis, IN", "latitude": 39.7684, "longitude": -86.1581},
            {"kind": "dropoff", "query": "Atlanta, GA", "formatted_address": "Atlanta, GA", "latitude": 33.7490, "longitude": -84.3880},
        ),
    )


def _mock_response(payload):
    response = MagicMock()
    response.json.return_value = payload
    response.raise_for_status.return_value = None
    return response


def _geocode_result(query: str, formatted_address: str, latitude: str, longitude: str) -> dict:
    return {
        "display_name": formatted_address,
        "lat": latitude,
        "lon": longitude,
        "name": query,
    }


def _route_result(distance: float, duration: float, coordinates: list[list[float]]) -> dict:
    return {
        "routes": [
            {
                "distance": distance,
                "duration": duration,
                "geometry": {
                    "type": "LineString",
                    "coordinates": coordinates,
                },
            }
        ]
    }
