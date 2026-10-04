"""Rank-scoped editing; history is read-only through the API."""
from datetime import datetime, timedelta, time
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from accounts.models import DriverProfile, OperatorProfile
from .models import Trip, TripChange, TripAssetChange, Route, Vehicle, DriverAtRank, OperatorAtRank
from .serializers import TripSerializer, VehicleSerializer

FIELDS = ("route_id", "operator_id", "driver_id", "vehicle_id", "departure_date", "expected_departure_time", "seat_capacity", "notes")
def scoped_trip(user, pk, lock=False, admin_only=False):
    qs = Trip.objects.select_for_update() if lock else Trip.objects.all()
    admin, op = getattr(user, "admin_profile", None), getattr(user, "operator_profile", None)
    if user.role == "admin" and admin and admin.rank_id:
        return get_object_or_404(qs, pk=pk, route__departure_id=admin.rank_id)
    if not admin_only and user.role == "operator" and op:
        return get_object_or_404(qs, pk=pk, operator=op)
    raise PermissionDenied("A trip operator or its rank administrator is required.")

def snapshot(t):
    data = {k: str(getattr(t, k)) if getattr(t, k) is not None else None for k in FIELDS}
    data.update(status=t.status, driver=(t.driver.user.get_full_name() or t.driver.user.phone) if t.driver else None,
        vehicle=t.vehicle.plate_number if t.vehicle else None, route=str(t.route),
        operator=t.operator.user.get_full_name() or t.operator.user.phone)
    return data

def record(t, user, reason, before):
    after = snapshot(t)
    if before != after:
        TripChange.objects.create(trip=t, changed_by=user, actor_name=user.get_full_name() or user.phone,
            actor_role=user.role, reason=reason, before=before, after=after)

class EditRequest(serializers.Serializer):
    reason = serializers.CharField(max_length=2000)
    driver_reason = serializers.CharField(max_length=1000, required=False)
    vehicle_reason = serializers.CharField(max_length=1000, required=False)
    route_id = serializers.PrimaryKeyRelatedField(queryset=Route.objects.filter(active=True), source="route", required=False)
    operator_id = serializers.PrimaryKeyRelatedField(queryset=OperatorProfile.objects.all(), source="operator", required=False)
    driver_id = serializers.PrimaryKeyRelatedField(queryset=DriverProfile.objects.all(), source="driver", required=False, allow_null=True)
    vehicle_id = serializers.PrimaryKeyRelatedField(queryset=Vehicle.objects.all(), source="vehicle", required=False, allow_null=True)
    departure_date = serializers.DateField(required=False)
    expected_departure_time = serializers.TimeField(required=False, allow_null=True)
    seat_capacity = serializers.IntegerField(min_value=1, max_value=100, required=False)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=4000)

def reject(message):
    raise serializers.ValidationError({"detail": message})

def validate_assignment(t):
    if t.driver:
        DriverProfile.objects.select_for_update().get(pk=t.driver_id)
        if t.driver.status != "verified" or t.driver.external_verification_status in ("failed", "suspended"):
            reject("Choose an approved driver with no failed or suspended DOT result.")
        if not DriverAtRank.objects.filter(driver=t.driver, rank=t.route.departure, status="active").exists():
            reject("Driver must be approved at the departure rank.")
    if t.vehicle:
        Vehicle.objects.select_for_update().get(pk=t.vehicle_id)
        if not t.vehicle.roadworthy:
            reject("Choose a roadworthy vehicle.")
        if t.seat_capacity > t.vehicle.seat_capacity:
            reject("Trip capacity exceeds the selected vehicle's seats.")
    if t.seat_capacity < t.seats_taken:
        reject("Capacity cannot be less than the number of reserved and boarded passengers.")
    filters = Q(pk__in=[])
    if t.driver_id: filters |= Q(driver_id=t.driver_id)
    if t.vehicle_id: filters |= Q(vehicle_id=t.vehicle_id)
    def interval(trip):
        start = datetime.combine(trip.departure_date, trip.expected_departure_time or time.min)
        duration = timedelta(minutes=trip.route.typical_duration_minutes or 60) if trip.expected_departure_time else timedelta(days=1)
        return start, start + duration
    start, end = interval(t)
    for other in Trip.objects.exclude(pk=t.pk).filter(filters, status__in=["scheduled", "boarding", "in_progress"]).select_related("route"):
        a, b = interval(other)
        if start < b and a < end:
            reject("Driver or vehicle overlaps another active departure: " + other.trip_code)

def apply_edit(request, t, operator=False):
    allowed = {"driver_id", "vehicle_id", "reason", "driver_reason", "vehicle_reason"} if operator else set(FIELDS) | {"reason", "driver_reason", "vehicle_reason"}
    if set(request.data) - allowed: reject("This edit includes fields you cannot change.")
    form = EditRequest(data=request.data)
    form.is_valid(raise_exception=True)
    data = dict(form.validated_data)
    reason = data.pop("reason")
    dr, vr = data.pop("driver_reason", ""), data.pop("vehicle_reason", "")
    before, old_driver, old_vehicle = snapshot(t), t.driver, t.vehicle
    changed = {k for k, v in data.items() if getattr(t, k) != v}
    if not changed: reject("No changes were selected.")
    if t.status not in ("scheduled", "boarding") and (operator or changed - {"notes"}):
        reject("Only notes can be edited after departure or after a trip has closed.")
    if operator and "driver" in changed and (not data["driver"] or not dr):
        reject("An approved replacement driver and a reason for the driver change are required.")
    if operator and "vehicle" in changed and (not data["vehicle"] or not vr):
        reject("A replacement vehicle and a reason for the vehicle change are required.")
    for k, v in data.items(): setattr(t, k, v)
    admin = getattr(request.user, "admin_profile", None)
    if admin and t.route.departure_id != admin.rank_id: reject("Choose a route from your rank.")
    if changed & {"route", "operator"}:
        if t.seats_taken: reject("Route and operator cannot change while passengers have bookings.")
        if not OperatorAtRank.objects.filter(operator=t.operator, rank=t.route.departure, status="active").exists():
            reject("Operator must be approved at the departure rank.")
        t.engaged_by, t.engaged_at, t.status = None, None, "scheduled"
    if "vehicle" in changed and "seat_capacity" not in data and t.vehicle:
        t.seat_capacity = t.vehicle.seat_capacity
    if changed - {"notes"}: validate_assignment(t)
    if changed & {"driver", "vehicle", "route", "operator"}:
        t.assets_verified_at, t.assets_verified_by = None, None
    t.save()
    reason += ("\nDriver: " + dr if dr else "") + ("\nVehicle: " + vr if vr else "")
    record(t, request.user, reason, before)
    if changed & {"driver", "vehicle"}:
        TripAssetChange.objects.create(trip=t, changed_by=request.user, old_driver=old_driver, new_driver=t.driver,
            old_vehicle=old_vehicle, new_vehicle=t.vehicle, reason="other", notes=reason)
    return TripSerializer(t).data

@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def admin_edit(request, trip_id):
    return Response(apply_edit(request, scoped_trip(request.user, trip_id, lock=True, admin_only=True)))

@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def operator_edit(request, trip_id):
    if request.user.role != "operator": raise PermissionDenied("Not an operator account.")
    return Response({"trip": apply_edit(request, scoped_trip(request.user, trip_id, lock=True), operator=True)})

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def history(request, trip_id):
    t = scoped_trip(request.user, trip_id)
    rows = list(t.changes.values("id", "actor_name", "actor_role", "changed_at", "reason", "before", "after"))
    legacy = t.asset_changes.select_related("changed_by", "old_driver__user", "new_driver__user", "old_vehicle", "new_vehicle")
    first = t.changes.order_by("changed_at").first()
    if first: legacy = legacy.filter(changed_at__lt=first.changed_at)
    for c in legacy:
        rows.append({"id": "legacy-" + str(c.pk),
            "actor_name": (c.changed_by.get_full_name() or c.changed_by.phone) if c.changed_by else "Unknown",
            "actor_role": c.changed_by.role if c.changed_by else "unknown", "changed_at": c.changed_at,
            "reason": c.get_reason_display() + ": " + c.notes,
            "before": {"driver": str(c.old_driver) if c.old_driver else None, "vehicle": str(c.old_vehicle) if c.old_vehicle else None},
            "after": {"driver": str(c.new_driver) if c.new_driver else None, "vehicle": str(c.new_vehicle) if c.new_vehicle else None}})
    return Response(sorted(rows, key=lambda row: row["changed_at"], reverse=True))

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def options(request, trip_id):
    t = scoped_trip(request.user, trip_id)
    drivers = DriverProfile.objects.filter(status="verified", rank_memberships__rank=t.route.departure,
        rank_memberships__status="active").exclude(external_verification_status__in=["failed", "suspended"]).select_related("user").distinct()
    return Response({"drivers": [{"id": d.pk, "name": d.user.get_full_name() or d.user.phone} for d in drivers],
        "vehicles": VehicleSerializer(Vehicle.objects.filter(roadworthy=True), many=True).data})

@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def admin_cancel(request, trip_id):
    t = scoped_trip(request.user, trip_id, lock=True, admin_only=True)
    reason = serializers.CharField(max_length=2000).run_validation(request.data.get("reason"))
    if t.status not in ("scheduled", "boarding") or t.bookings.filter(status="boarded").exists():
        reject("Only unstarted trips with no boarded passengers can be cancelled.")
    before = snapshot(t)
    t.status = "cancelled"
    t.save()
    t.bookings.filter(status="reserved").update(status="cancelled")
    record(t, request.user, reason, before)
    return Response(TripSerializer(t).data)
