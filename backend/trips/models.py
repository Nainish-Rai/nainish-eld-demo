import uuid

from django.db import models


class PlaceCache(models.Model):
    normalized_query = models.CharField(max_length=255, unique=True)
    query = models.CharField(max_length=255)
    formatted_address = models.CharField(max_length=255)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    provider = models.CharField(max_length=64, default="nominatim")
    raw_data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["query"]

    def __str__(self) -> str:
        return f"{self.query} ({self.latitude}, {self.longitude})"


class RouteCache(models.Model):
    cache_key = models.CharField(max_length=255, unique=True)
    provider = models.CharField(max_length=64, default="osrm")
    origin = models.ForeignKey(PlaceCache, related_name="origin_routes", on_delete=models.CASCADE)
    destination = models.ForeignKey(PlaceCache, related_name="destination_routes", on_delete=models.CASCADE)
    distance_miles = models.DecimalField(max_digits=8, decimal_places=2)
    duration_minutes = models.PositiveIntegerField()
    geometry = models.JSONField(default=dict)
    raw_data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["cache_key"]

    def __str__(self) -> str:
        return f"{self.origin.query} -> {self.destination.query}"


class TripRequest(models.Model):
    class Status(models.TextChoices):
        PLANNED = "planned", "Planned"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    current_location = models.CharField(max_length=255)
    pickup_location = models.CharField(max_length=255)
    dropoff_location = models.CharField(max_length=255)
    departure_at = models.DateTimeField()
    current_cycle_used_hours = models.DecimalField(max_digits=5, decimal_places=2)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PLANNED)
    plan_data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.current_location} -> {self.dropoff_location} ({self.id})"
