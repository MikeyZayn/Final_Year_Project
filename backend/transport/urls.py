from django.urls import path
from . import views

urlpatterns = [
    # Public
    path("api/routes/",         views.api_list_routes,        name="api_list_routes"),
    path("api/ranks/",          views.api_list_ranks,         name="api_list_ranks"),
    path("api/destinations/",   views.api_list_destinations,  name="api_list_destinations"),

    # Operator-scoped
    path("api/my-departure-points/",          views.api_my_departure_points,   name="api_my_departure_points"),
    path("api/request-rank/",                 views.api_request_rank,          name="api_request_rank"),
    path("api/my-routes/",                    views.api_my_routes,             name="api_my_routes"),
    path("api/my-routes/<int:route_id>/",     views.api_my_route_detail,       name="api_my_route_detail"),
]