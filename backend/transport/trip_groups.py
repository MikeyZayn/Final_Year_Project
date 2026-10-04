"""A group belongs to bookings on one trip, never to passenger profiles."""
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Booking, Trip
from .feature_serializers import CompanionSerializer
from .trip_management import scoped_trip, reject

class GroupRequest(serializers.Serializer):
    leader_id = serializers.IntegerField(min_value=1)
    booking_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), default=list, max_length=100)
    companions = CompanionSerializer(many=True, required=False, max_length=50)
    next_of_kin_name = serializers.CharField(max_length=150)
    next_of_kin_phone = serializers.RegexField(r"^\+?[0-9 ()-]{7,20}$", max_length=15)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def save_group(request, trip_id):
    if request.user.role != "operator":
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Only the trip operator can group its passengers.")
    trip = scoped_trip(request.user, trip_id, lock=True)
    if trip.status not in ("scheduled", "boarding"):
        reject("Groups can only be changed before departure.")
    form = GroupRequest(data=request.data)
    form.is_valid(raise_exception=True)
    data = form.validated_data
    leader = get_object_or_404(Booking, pk=data["leader_id"], trip=trip, group_leader__isnull=True)
    if leader.status not in ("reserved", "boarded"): reject("Choose an active lead booking.")
    ids = set(data["booking_ids"]) - {leader.pk}
    members = list(Booking.objects.filter(pk__in=ids, trip=trip))
    if len(members) != len(ids): reject("Every selected passenger must be booked on this trip.")
    if any(b.status not in ("reserved", "boarded") or b.group_leader_id not in (None, leader.pk) or b.companions.exists() for b in members):
        reject("Choose active passengers who do not belong to another group.")
    companions = data.get("companions", [])
    if not members and not companions and not leader.companions.exists():
        reject("Select at least one companion for this group.")
    if len(companions) > trip.seats_available: reject("Not enough seats for the additional companions.")
    leader.group_next_of_kin_name = data["next_of_kin_name"]
    leader.group_next_of_kin_phone = data["next_of_kin_phone"]
    leader.save(update_fields=["group_next_of_kin_name", "group_next_of_kin_phone"])
    for b in members:
        b.group_leader = leader
        b.save(update_fields=["group_leader"])
    for c in companions:
        Booking.objects.create(trip=trip, group_leader=leader, companion_first_name=c["first_name"], companion_last_name=c["last_name"])
    return Response({"detail": "Trip group saved.", "leader_id": leader.pk, "group_size": 1 + leader.companions.count()})
