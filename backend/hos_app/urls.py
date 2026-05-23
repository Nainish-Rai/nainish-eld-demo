from django.urls import include, path

from trips.views import health


urlpatterns = [
    path("api/health/", health, name="health"),
    path("api/trips/", include("trips.urls")),
]
