from django.urls import path
from . import views

urlpatterns = [
    # Public
    path("api/routes/",         views.api_list_routes,        name="api_list_routes"),
    path("api/ranks/",          views.api_list_ranks,         name="api_list_ranks"),
    path("api/destinations/",   views.api_list_destinations,  name="api_list_destinations"),
    path("api/trips/",          views.api_list_trips,         name="api_list_trips"),

    # Operator
    path("api/my-memberships/",             views.api_my_memberships,   name="api_my_memberships"),
    path("api/request-rank/",               views.api_request_rank,     name="api_request_rank"),
    path("api/my-trips/",                   views.api_my_trips,         name="api_my_trips"),
    path("api/my-trips/<int:trip_id>/manifest/", views.api_trip_manifest, name="api_trip_manifest"),
    path("api/my-trips/<int:trip_id>/walk-in/",  views.api_register_walk_in, name="api_register_walk_in"),
    path("api/my-trips/<int:trip_id>/flag/",     views.api_flag_trip,    name="api_flag_trip"),

    # Admin
    path("api/admin/routes/",   views.api_admin_routes,       name="api_admin_routes"),
    path("api/admin/trips/",    views.api_admin_trips,        name="api_admin_trips"),
    path("api/admin/flags/",    views.api_admin_flags,        name="api_admin_flags"),

    path("api/available-assets/",                       views.api_available_drivers_vehicles, name="api_available_assets"),
    path("api/my-trips/<int:trip_id>/reassign/",        views.api_reassign_trip,              name="api_reassign_trip"),
    path("api/my-trips/<int:trip_id>/asset-changes/",   views.api_trip_asset_changes,         name="api_trip_asset_changes"),
    path("api/my-trips/<int:trip_id>/engage/",                           views.api_engage_trip,    name="api_engage_trip"),
    path("api/my-trips/<int:trip_id>/release/",                          views.api_release_trip,   name="api_release_trip"),
    path("api/my-trips/<int:trip_id>/bookings/<int:booking_id>/verify/", views.api_verify_booking, name="api_verify_booking"),
]