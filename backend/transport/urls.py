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
    path("api/my-trips/<int:trip_id>/release/",                        views.api_release_trip,   name="api_release_trip"),
    path("api/my-trips/<int:trip_id>/complete/", views.api_complete_trip, name="api_complete_trip"),
    path("api/my-trips/<int:trip_id>/bookings/<int:booking_id>/verify/", views.api_verify_booking, name="api_verify_booking"),
    path("api/my-bookings/", views.api_my_bookings, name="api_my_bookings"),

    # Passenger
    path("api/my-bookings/<int:booking_id>/feedback/", views.api_submit_feedback, name="api_submit_feedback"),
    path("api/my-feedback/", views.api_my_feedback, name="api_my_feedback"),

    # Operator
    path("api/operator/feedback/", views.api_operator_feedback, name="api_operator_feedback"),
    path("api/operator/feedback/<int:feedback_id>/acknowledge/", views.api_operator_acknowledge, name="api_operator_acknowledge"),
    path("api/operator/feedback/<int:feedback_id>/respond/", views.api_operator_respond, name="api_operator_respond"),
    path("api/operator/feedback/<int:feedback_id>/escalate/", views.api_operator_escalate, name="api_operator_escalate"),

    # Admin
    path("api/admin/feedback/", views.api_admin_feedback, name="api_admin_feedback"),
    path("api/admin/feedback/<int:feedback_id>/confirm-incident/", views.api_admin_confirm_incident, name="api_admin_confirm_incident"),
    path("api/admin/feedback/<int:feedback_id>/dismiss/", views.api_admin_dismiss, name="api_admin_dismiss"),
    path("api/my-bookings/<int:booking_id>/cancel/", views.api_cancel_booking, name="api_cancel_booking"),
    path("api/my-bookings/<int:booking_id>/cancel/", views.api_cancel_booking, name="api_cancel_booking"),
    # Admin (rank-scoped)
    path("api/admin/me/",                          views.api_admin_me,                       name="api_admin_me"),
    path("api/admin/pending-memberships/",         views.api_admin_pending_memberships,      name="api_admin_pending_memberships"),
    path("api/admin/memberships/<int:membership_id>/approve/", views.api_admin_approve_membership, name="api_admin_approve_membership"),
    path("api/admin/memberships/<int:membership_id>/reject/",  views.api_admin_reject_membership,  name="api_admin_reject_membership"),
    path("api/admin/trip-flags/",                  views.api_admin_trip_flags,               name="api_admin_trip_flags"),
    path("api/admin/trip-flags/<int:flag_id>/acknowledge/", views.api_admin_acknowledge_flag, name="api_admin_acknowledge_flag"),
    path("api/admin/trip-flags/<int:flag_id>/resolve/",     views.api_admin_resolve_flag,     name="api_admin_resolve_flag"),
    path("api/admin/trips/<int:trip_id>/cancel/",  views.api_admin_cancel_trip,              name="api_admin_cancel_trip"),
    path("api/admin/memberships/<int:membership_id>/",         views.api_admin_membership_detail,   name="api_admin_membership_detail"),
    path("api/admin/rank-trips/",                              views.api_admin_rank_trips,          name="api_admin_rank_trips"),
    path("api/admin/schedule-trip/",                           views.api_admin_schedule_trip,       name="api_admin_schedule_trip"),
    path("api/admin/available-for-rank/",                      views.api_admin_available_for_rank,  name="api_admin_available_for_rank"),

    # Driver
    path("api/driver/profile/",                        views.api_driver_profile,          name="api_driver_profile"),
    path("api/driver/vehicle/",                        views.api_driver_vehicle,          name="api_driver_vehicle"),
    path("api/driver/trips/",                          views.api_driver_trips,            name="api_driver_trips"),
    path("api/driver/trips/confirm/",                  views.api_driver_confirm_trip,     name="api_driver_confirm_trip"),
    path("api/routing/directions/", views.api_routing_directions, name="api_routing_directions"),
    path("api/driver/vehicle/<int:vehicle_id>/location/", views.api_driver_post_location, name="api_driver_post_location"),
    # Announcements
    path("api/announcements/",                            views.api_list_announcements,    name="api_list_announcements"),
    path("api/my-announcements/",                         views.api_my_announcements,      name="api_my_announcements"),
    path("api/my-announcements/<int:announcement_id>/",   views.api_announcement_detail,   name="api_announcement_detail"),
    # Panic alerts
    path("api/my-bookings/<int:booking_id>/panic/",        views.api_trigger_panic,             name="api_trigger_panic"),
    path("api/panic/<int:alert_id>/cancel/",               views.api_cancel_panic,              name="api_cancel_panic"),
    path("api/my-panic/",                                  views.api_my_active_panic,           name="api_my_active_panic"),
    path("api/operator/alerts/",                           views.api_operator_alerts,           name="api_operator_alerts"),
    path("api/operator/alerts/<int:alert_id>/acknowledge/", views.api_operator_acknowledge_alert, name="api_operator_acknowledge_alert"),
    path("api/operator/alerts/<int:alert_id>/resolve/",     views.api_operator_resolve_alert,     name="api_operator_resolve_alert"),


    # Admin — edit trip
    path("api/admin/trips/<int:trip_id>/edit/", views.api_admin_edit_trip, name="api_admin_edit_trip"),

    # Admin — queue
    path("api/admin/queue/", views.api_admin_queue, name="api_admin_queue"),
    path("api/admin/queue/<int:entry_id>/remove/", views.api_admin_queue_remove, name="api_admin_queue_remove"),
    path("api/admin/queue/<int:entry_id>/move/", views.api_admin_queue_move, name="api_admin_queue_move"),

    # Admin — accounts
    path("api/admin/users/", views.api_admin_users, name="api_admin_users"),
    path("api/admin/users/<int:user_id>/disable/", views.api_admin_disable_user, name="api_admin_disable_user"),
    path("api/admin/users/<int:user_id>/enable/", views.api_admin_enable_user, name="api_admin_enable_user"),
    path("api/admin/users/<int:user_id>/archive/", views.api_admin_archive_user, name="api_admin_archive_user"),

    # Admin/operator — driver detail
    path("api/admin/drivers/<int:driver_id>/", views.api_admin_driver_detail, name="api_admin_driver_detail"),
]   
