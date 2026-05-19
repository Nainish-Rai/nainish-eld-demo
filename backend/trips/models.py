import uuid

from django.db import models


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
