from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import serializers
from .models import Trip, Booking, VerificationCode
from .serializers import BookingSerializer
from .services.queue_expiry import expire_queues


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def passenger_confirm_boarding(request, booking_id):
    """The signed-in browser supplies the delivered receipt, without user input.

    This acknowledges delivery only; the operator remains authoritative for
    physical boarding. Feedback consumes verified_at later, independently.
    """
    booking = get_object_or_404(Booking, pk=booking_id, passenger=request.user)
    receipt = VerificationCode.objects.select_for_update().filter(booking=booking).first()
    if not receipt or not booking.boarded_at or booking.status not in [Booking.Status.BOARDED, Booking.Status.COMPLETED]:
        return Response({"detail": "No boarding receipt has been issued yet."}, status=400)
    supplied = request.data.get('code', '')
    import secrets
    if not isinstance(supplied, str) or not secrets.compare_digest(supplied, receipt.code):
        return Response({"detail": "The receipt does not match this booking."}, status=400)
    if not receipt.passenger_confirmed_at:
        receipt.passenger_confirmed_at = timezone.now()
        receipt.save(update_fields=['passenger_confirmed_at'])
    return Response(BookingSerializer(booking).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def board_group(request, trip_id, booking_id):
    expire_queues()
    op = getattr(request.user, 'operator_profile', None)
    if not op:
        return Response({"detail": "Not an operator account."}, status=403)
    trip = get_object_or_404(Trip.objects.select_for_update(), pk=trip_id, operator=op, engaged_by=op)
    if trip.status != Trip.Status.BOARDING or not trip.assets_verified_at:
        return Response({"detail": "Verify assets on a boarding trip first."}, status=400)
    leader = get_object_or_404(Booking, pk=booking_id, trip=trip, group_leader__isnull=True)
    # Explicitly select who is physically present; never auto-board absent members.
    ids = serializers.ListField(child=serializers.IntegerField(min_value=1), allow_empty=False, max_length=51).run_validation(request.data.get('booking_ids'))
    ids = set(ids)
    members = list(Booking.objects.filter(trip=trip).filter(Q(pk=leader.pk) | Q(group_leader=leader)))
    if not ids.issubset({b.id for b in members}):
        return Response({"detail": "Selected passenger is not in this trip group."}, status=400)
    selected = [b for b in members if b.id in ids]
    if any(b.status not in [Booking.Status.RESERVED, Booking.Status.BOARDED] for b in selected):
        return Response({"detail": "A selected booking cannot be boarded."}, status=400)
    if trip.bookings.filter(status=Booking.Status.BOARDED).count() + sum(b.status == Booking.Status.RESERVED for b in selected) > trip.seat_capacity:
        return Response({"detail": "The selected group exceeds the taxi capacity."}, status=400)
    count = 0
    for b in selected:
        if b.status == Booking.Status.BOARDED:
            continue
        b.status = Booking.Status.BOARDED
        b.boarded_at = timezone.now()
        b.boarded_by = request.user
        b.save(update_fields=['status', 'boarded_at', 'boarded_by'])
        code = get_random_string(12).upper()
        while VerificationCode.objects.filter(code=code).exists():
            code = get_random_string(12).upper()
        VerificationCode.objects.create(booking=b, code=code, issued_by=request.user)
        count += 1
    return Response({'boarded_count': count, 'booking': BookingSerializer(leader).data})
