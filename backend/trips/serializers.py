from rest_framework import serializers

from .models import TripRequest


class TripPlanRequestSerializer(serializers.Serializer):
    current_location = serializers.CharField(max_length=255)
    pickup_location = serializers.CharField(max_length=255)
    dropoff_location = serializers.CharField(max_length=255)
    departure_at = serializers.DateTimeField()
    current_cycle_used_hours = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=70)


class TripRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripRequest
        fields = (
            "id",
            "current_location",
            "pickup_location",
            "dropoff_location",
            "departure_at",
            "current_cycle_used_hours",
            "status",
            "plan_data",
            "created_at",
            "updated_at",
        )
