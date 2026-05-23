from rest_framework import serializers


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

    def validate(self, attrs):
        _validate_coordinate_pair(attrs, "current_location")
        _validate_coordinate_pair(attrs, "pickup_location")
        _validate_coordinate_pair(attrs, "dropoff_location")
        return attrs


def _validate_coordinate_pair(attrs: dict, prefix: str) -> None:
    latitude_key = f"{prefix}_latitude"
    longitude_key = f"{prefix}_longitude"
    latitude = attrs.get(latitude_key)
    longitude = attrs.get(longitude_key)

    if (latitude is None) == (longitude is None):
        return

    raise serializers.ValidationError(
        {
            latitude_key: ["Latitude and longitude must be provided together."],
            longitude_key: ["Latitude and longitude must be provided together."],
        }
    )
