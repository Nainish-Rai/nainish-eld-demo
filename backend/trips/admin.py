from django.contrib import admin

from .models import PlaceCache, RouteCache, TripRequest


@admin.register(PlaceCache)
class PlaceCacheAdmin(admin.ModelAdmin):
    list_display = ("query", "formatted_address", "provider", "updated_at")
    search_fields = ("query", "formatted_address", "normalized_query")


@admin.register(RouteCache)
class RouteCacheAdmin(admin.ModelAdmin):
    list_display = ("origin", "destination", "provider", "distance_miles", "duration_minutes", "updated_at")
    search_fields = ("cache_key", "origin__query", "destination__query")


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
