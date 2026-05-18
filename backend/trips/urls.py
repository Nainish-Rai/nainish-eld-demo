from django.urls import path

from . import views


urlpatterns = [
    path("plan/", views.plan_trip, name="plan-trip"),
    path("<uuid:trip_id>/", views.get_trip, name="get-trip"),
    path("<uuid:trip_id>/pdf/", views.trip_pdf, name="trip-pdf"),
]
