from django.urls import path
from . import views

urlpatterns = [
    path("api/routes/", views.api_list_routes, name="api_list_routes"),
]