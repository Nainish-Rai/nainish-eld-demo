from django.contrib import admin

from .models import TripRequest


@admin.register(TripRequest)
class TripRequestAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "current_location",
        "pickup_location",
        "dropoff_location",
        "current_cycle_used_hours",
        "status",
        "created_at",
    )
    search_fields = ("current_location", "pickup_location", "dropoff_location")
    list_filter = ("status", "created_at")
