from decimal import Decimal

from django.db import connection
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import TripRequest
from .planner import TripPlanningInput, build_trip_plan
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
    plan_data = build_trip_plan(trip_input)

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
    return Response(
        {
            "detail": "PDF export is not implemented yet.",
            "trip_id": str(trip_id),
        },
        status=status.HTTP_501_NOT_IMPLEMENTED,
    )
