from decimal import Decimal

from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .planner import TripPlanningInput, build_trip_plan
from .routing import RoutingServiceError, build_live_route_template
from .serializers import TripPlanRequestSerializer


def health(request):
    planner_ready = bool(settings.GEOAPIFY_API_KEY and settings.OSRM_BASE_URL)
    status_code = status.HTTP_200_OK if planner_ready else status.HTTP_503_SERVICE_UNAVAILABLE
    return JsonResponse(
        {
            "status": "ok" if planner_ready else "degraded",
            "mode": "stateless",
            "planner_ready": planner_ready,
            "dependencies": {
                "geoapify_api_key_configured": bool(settings.GEOAPIFY_API_KEY),
                "osrm_base_url_configured": bool(settings.OSRM_BASE_URL),
            },
        },
        status=status_code,
    )


@api_view(["POST"])
def plan_trip(request):
    serializer = TripPlanRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    validated = serializer.validated_data
    trip_input = TripPlanningInput(
        current_location=validated["current_location"],
        pickup_location=validated["pickup_location"],
        dropoff_location=validated["dropoff_location"],
        departure_at_iso=validated["departure_at"].isoformat(),
        current_cycle_used_hours=Decimal(validated["current_cycle_used_hours"]),
    )

    try:
        route_template = build_live_route_template(
            current_location=trip_input.current_location,
            pickup_location=trip_input.pickup_location,
            dropoff_location=trip_input.dropoff_location,
            current_location_point=_build_point(validated, "current_location"),
            pickup_location_point=_build_point(validated, "pickup_location"),
            dropoff_location_point=_build_point(validated, "dropoff_location"),
        )
    except RoutingServiceError as error:
        return Response({"detail": str(error)}, status=status.HTTP_502_BAD_GATEWAY)

    plan_data = build_trip_plan(trip_input, route_template=route_template)

    return Response(
        {
            "mode": "stateless",
            "status": "planned",
            "generated_at": timezone.now().isoformat(),
            "plan": plan_data,
        },
        status=status.HTTP_201_CREATED,
    )


def _build_point(validated: dict, prefix: str) -> tuple[Decimal, Decimal] | None:
    latitude = validated.get(f"{prefix}_latitude")
    longitude = validated.get(f"{prefix}_longitude")
    if latitude is None or longitude is None:
        return None

    return (latitude, longitude)
