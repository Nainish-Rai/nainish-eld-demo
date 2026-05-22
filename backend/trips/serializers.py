from rest_framework import serializers

from .models import TripRequest


class TripPlanRequestSerializer(serializers.Serializer):
    current_location = serializers.CharField(max_length=255)
    pickup_location = serializers.CharField(max_length=255)
    dropoff_location = serializers.CharField(max_length=255)
    current_location_latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)
    current_location_longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)
    pickup_location_latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)
    pickup_location_longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)
    dropoff_location_latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)
    dropoff_location_longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)
    departure_at = serializers.DateTimeField()
    current_cycle_used_hours = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=70)
    truck_height_meters = serializers.DecimalField(max_digits=4, decimal_places=2, min_value=0, max_value=10, required=False)
    truck_width_meters = serializers.DecimalField(max_digits=4, decimal_places=2, min_value=0, max_value=10, required=False)
    truck_weight_tons = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, required=False)


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
