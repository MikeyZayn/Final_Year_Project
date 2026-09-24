from django.urls import path
from . import views

urlpatterns = [
    # Public
    path("ranks/", views.api_list_ranks),
    path("destinations/", views.api_list_destinations),
    path("routes/", views.api_list_routes),
    path("trips/", views.api_list_trips),
    path("trips/<int:trip_id>/", views.api_trip_detail),

    # Passenger
    path("bookings/", views.api_create_booking),
    path("bookings/mine/", views.api_my_bookings),

    # Operator
    path("my-trips/", views.api_my_trips),
    path("my-memberships/", views.api_my_memberships),
    path("request-rank/", views.api_request_rank),
    path("my-trips/<int:trip_id>/manifest/", views.api_trip_manifest),
    path("my-trips/<int:trip_id>/walk-in/", views.api_register_walk_in),
    path("my-trips/<int:trip_id>/engage/", views.api_engage_trip),
    path("my-trips/<int:trip_id>/release/", views.api_release_trip),
    path("my-trips/<int:trip_id>/flag/", views.api_flag_trip),
    path(
        "my-trips/<int:trip_id>/bookings/<int:booking_id>/verify/",
        views.api_verify_booking,
    ),

    # Driver / GPS
    path("vehicles/mine/", views.api_my_vehicle),
    path("vehicles/<int:vehicle_id>/location/", views.api_vehicle_location),
    path("vehicles/<int:vehicle_id>/location/latest/", views.api_vehicle_latest_location),
    path("fleet/", views.api_fleet_snapshot),

    # Driver-specific
    path("driver/trips/", views.api_driver_my_trips),
    path("driver/confirm-trip/", views.api_driver_confirm_trip),   # NEW
    path("driver/profile/", views.api_driver_profile),             # NEW

    # Routing
    path("routing/directions/", views.api_ad_hoc_directions),
    path("routing/calculate/", views.api_calculate_route_fare),

    # Panic
    path("panic-alerts/", views.api_panic_alert),
]