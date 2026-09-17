from django.contrib import admin
from .models import Destination, DeparturePoint, Route


@admin.register(Destination)
class DestinationAdmin(admin.ModelAdmin):
    list_display = ("name", "area")
    search_fields = ("name", "area")


@admin.register(DeparturePoint)
class DeparturePointAdmin(admin.ModelAdmin):
    list_display = ("name", "area", "operator")
    list_filter = ("operator",)


@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ("departure_point", "destination", "fare", "service_category", "active")
    list_filter = ("service_category", "active", "operator")