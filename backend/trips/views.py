from decimal import Decimal
from io import BytesIO

from django.db import connection
from django.http import FileResponse, JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .eld_renderer import build_trip_pdf
from .models import TripRequest
from .planner import TripPlanningInput, build_trip_plan
from .routing import RoutingServiceError, build_live_route_template
from .serializers import TripPlanRequestSerializer, TripRequestSerializer


def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()

    return JsonResponse({"status": "ok", "database": "ok"})


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

    trip_request = TripRequest.objects.create(
        current_location=trip_input.current_location,
        pickup_location=trip_input.pickup_location,
        dropoff_location=trip_input.dropoff_location,
        departure_at=validated["departure_at"],
        current_cycle_used_hours=validated["current_cycle_used_hours"],
        plan_data=plan_data,
    )

    return Response(
        {
            "trip_id": str(trip_request.id),
            "status": trip_request.status,
            "plan": plan_data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
def get_trip(request, trip_id):
    trip_request = get_object_or_404(TripRequest, id=trip_id)
    serializer = TripRequestSerializer(trip_request)
    return Response(serializer.data)


@api_view(["GET"])
def trip_pdf(request, trip_id):
    trip_request = get_object_or_404(TripRequest, id=trip_id)
    pdf_bytes = build_trip_pdf(trip_request.plan_data, str(trip_request.id))

    return FileResponse(
        BytesIO(pdf_bytes),
        as_attachment=True,
        filename=f"trip-{trip_request.id}-eld-logs.pdf",
        content_type="application/pdf",
    )


def _build_point(validated: dict, prefix: str) -> tuple[Decimal, Decimal] | None:
    latitude = validated.get(f"{prefix}_latitude")
    longitude = validated.get(f"{prefix}_longitude")
    if latitude is None or longitude is None:
        return None

    return (Decimal(latitude), Decimal(longitude))
