from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .planner import RouteLeg, RouteTemplate, TripPlanningInput, build_trip_plan
from .routing import build_live_route_template


class TripPlanApiTests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("trips.views.build_live_route_template")
    def test_plan_trip_returns_live_hos_plan_without_persisting(self, mock_route_template):
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
        self.assertEqual(response.data["mode"], "stateless")
        self.assertEqual(response.data["status"], "planned")
        self.assertIn("generated_at", response.data)
        self.assertFalse(response.data["plan"]["compliance_summary"]["is_placeholder"])
        self.assertEqual(response.data["plan"]["compliance_summary"]["inserted_breaks"], 1)
        self.assertEqual(response.data["plan"]["compliance_summary"]["rule_set"]["driver_type"], "property_carrying")
        self.assertEqual(response.data["plan"]["compliance_summary"]["rule_set"]["cycle"], "70_hours_8_days")

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

    @patch("trips.views.build_live_route_template")
    def test_plan_trip_rejects_partial_coordinate_pairs(self, mock_route_template):
        mock_route_template.return_value = _default_route_template()

        response = self.client.post(
            reverse("plan-trip"),
            {
                "current_location": "Chicago, IL",
                "pickup_location": "Indianapolis, IN",
                "dropoff_location": "Atlanta, GA",
                "current_location_latitude": "41.878100",
                "departure_at": "2026-05-19T08:00:00Z",
                "current_cycle_used_hours": "12.50",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current_location_latitude", response.data)
        self.assertIn("current_location_longitude", response.data)

    @override_settings(GEOAPIFY_API_KEY="")
    def test_health_reports_degraded_when_geocoding_is_not_configured(self):
        response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.json()["status"], "degraded")

    @override_settings(GEOAPIFY_API_KEY="test-geoapify-key")
    def test_health_reports_ready_when_required_dependencies_are_configured(self):
        response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["mode"], "stateless")
        self.assertTrue(payload["planner_ready"])


class HosPlannerTests(SimpleTestCase):
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
        self.assertIn("<svg", plan["daily_logs"][0]["sheet_svg"])
        self.assertIn("Original - File at home terminal.", plan["daily_logs"][0]["sheet_svg"])
        self.assertIn("Shipping", plan["daily_logs"][0]["sheet_svg"])
        self.assertIn("Recap:", plan["daily_logs"][0]["sheet_svg"])
        self.assertIn("70 Hour / 8 Day", plan["daily_logs"][0]["sheet_svg"])
        self.assertIn("Off duty / released from work", plan["daily_logs"][0]["sheet_svg"])
        self.assertEqual(plan["duty_events"][-1]["remarks"], "Off duty / released from work")

    def test_generated_stops_include_coordinates_for_route_map_markers(self):
        plan = build_trip_plan(_trip_input(), route_template=_default_route_template())

        mapped_stops = [
            stop
            for stop in plan["stops"]
            if stop["kind"] in {"pre_trip", "pickup", "dropoff", "break", "post_trip"}
        ]
        break_stop = next(stop for stop in mapped_stops if stop["kind"] == "break")

        self.assertTrue(mapped_stops)
        self.assertTrue(all(stop["latitude"] is not None and stop["longitude"] is not None for stop in mapped_stops))
        self.assertEqual(break_stop["status"], "off_duty")
        self.assertIn("start_at", break_stop)
        self.assertIn("end_at", break_stop)

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

    def test_long_route_inserts_on_duty_fuel_stops_every_thousand_miles(self):
        long_route = RouteTemplate(
            provider="test",
            notes="test route",
            legs=(
                RouteLeg(
                    "Drive to pickup",
                    "Chicago, IL",
                    "Indianapolis, IN",
                    60,
                    Decimal("80.0"),
                    ((41.8781, -87.6298), (39.7684, -86.1581)),
                ),
                RouteLeg(
                    "Drive to dropoff",
                    "Indianapolis, IN",
                    "Phoenix, AZ",
                    1800,
                    Decimal("2100.0"),
                    ((39.7684, -86.1581), (35.4676, -97.5164), (33.4484, -112.0740)),
                ),
            ),
            geometry_coordinates=((41.8781, -87.6298), (39.7684, -86.1581), (35.4676, -97.5164), (33.4484, -112.0740)),
            waypoints=(
                {"kind": "current", "query": "Chicago, IL", "formatted_address": "Chicago, IL", "latitude": 41.8781, "longitude": -87.6298},
                {"kind": "pickup", "query": "Indianapolis, IN", "formatted_address": "Indianapolis, IN", "latitude": 39.7684, "longitude": -86.1581},
                {"kind": "dropoff", "query": "Phoenix, AZ", "formatted_address": "Phoenix, AZ", "latitude": 33.4484, "longitude": -112.0740},
            ),
        )

        plan = build_trip_plan(_trip_input(dropoff_location="Phoenix, AZ"), route_template=long_route)
        fuel_events = [
            event
            for event in plan["duty_events"]
            if event["status"] == "on_duty" and "Fuel stop" in event["remarks"]
        ]
        fuel_stops = [stop for stop in plan["stops"] if stop["kind"] == "fuel"]

        self.assertGreaterEqual(len(fuel_events), 2)
        self.assertEqual(plan["compliance_summary"]["inserted_fuel_stops"], len(fuel_events))
        self.assertTrue(all(event["duration_minutes"] == 30 for event in fuel_events))
        self.assertTrue(all(stop["latitude"] is not None and stop["longitude"] is not None for stop in fuel_stops))


@override_settings(GEOAPIFY_API_KEY="test-geoapify-key")
class RoutingServiceTests(SimpleTestCase):
    @patch("trips.routing.requests.get")
    def test_build_live_route_template_fetches_places_and_routes(self, mock_get):
        mock_get.side_effect = [
            _mock_response(_geocode_result("Chicago, IL", "Chicago, IL", "41.8781", "-87.6298")),
            _mock_response(_geocode_result("Indianapolis, IN", "Indianapolis, IN", "39.7684", "-86.1581")),
            _mock_response(_geocode_result("Atlanta, GA", "Atlanta, GA", "33.7490", "-84.3880")),
            _mock_response(_route_result(193121.0, 5400.0, [[-87.6298, 41.8781], [-86.1581, 39.7684]])),
            _mock_response(_route_result(676000.0, 27000.0, [[-86.1581, 39.7684], [-84.3880, 33.7490]])),
        ]

        route_template = build_live_route_template("Chicago, IL", "Indianapolis, IN", "Atlanta, GA")

        self.assertEqual(route_template.provider, "osrm")
        self.assertEqual(route_template.total_drive_minutes, 5400 // 60 + 27000 // 60)

    @patch("trips.routing.requests.get")
    def test_second_route_request_fetches_again_in_stateless_mode(self, mock_get):
        mock_get.side_effect = [
            _mock_response(_geocode_result("Chicago, IL", "Chicago, IL", "41.8781", "-87.6298")),
            _mock_response(_geocode_result("Indianapolis, IN", "Indianapolis, IN", "39.7684", "-86.1581")),
            _mock_response(_geocode_result("Atlanta, GA", "Atlanta, GA", "33.7490", "-84.3880")),
            _mock_response(_route_result(193121.0, 5400.0, [[-87.6298, 41.8781], [-86.1581, 39.7684]])),
            _mock_response(_route_result(676000.0, 27000.0, [[-86.1581, 39.7684], [-84.3880, 33.7490]])),
            _mock_response(_geocode_result("Chicago, IL", "Chicago, IL", "41.8781", "-87.6298")),
            _mock_response(_geocode_result("Indianapolis, IN", "Indianapolis, IN", "39.7684", "-86.1581")),
            _mock_response(_geocode_result("Atlanta, GA", "Atlanta, GA", "33.7490", "-84.3880")),
            _mock_response(_route_result(193121.0, 5400.0, [[-87.6298, 41.8781], [-86.1581, 39.7684]])),
            _mock_response(_route_result(676000.0, 27000.0, [[-86.1581, 39.7684], [-84.3880, 33.7490]])),
        ]

        build_live_route_template("Chicago, IL", "Indianapolis, IN", "Atlanta, GA")
        build_live_route_template("Chicago, IL", "Indianapolis, IN", "Atlanta, GA")

        self.assertEqual(mock_get.call_count, 10)


def _trip_input(
    current_cycle_used_hours: Decimal = Decimal("12.50"),
    dropoff_location: str = "Atlanta, GA",
) -> TripPlanningInput:
    return TripPlanningInput(
        current_location="Chicago, IL",
        pickup_location="Indianapolis, IN",
        dropoff_location=dropoff_location,
        departure_at_iso="2026-05-19T08:00:00+00:00",
        current_cycle_used_hours=current_cycle_used_hours,
    )


def _default_route_template() -> RouteTemplate:
    return RouteTemplate(
        provider="test",
        notes="test route",
        legs=(
            RouteLeg(
                "Drive to pickup",
                "Chicago, IL",
                "Indianapolis, IN",
                90,
                Decimal("120.0"),
                ((41.8781, -87.6298), (39.7684, -86.1581)),
            ),
            RouteLeg(
                "Drive to dropoff",
                "Indianapolis, IN",
                "Atlanta, GA",
                450,
                Decimal("420.0"),
                ((39.7684, -86.1581), (37.9716, -85.6936), (33.7490, -84.3880)),
            ),
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
        "results": [
            {
                "formatted": formatted_address,
                "name": query,
                "lat": latitude,
                "lon": longitude,
            }
        ]
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
