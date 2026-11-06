"""Refund passengers when a driver never checked in at departure rank A.

Policy: a valid GPS check-in within 350 m of the rank by T+15 minutes
is sufficient. At T+15, if no check-in was recorded, cancel the trip and
fully refund every paid, non-cancelled booking (including grouped bookings).
This is a demo recording of refunds, not a payment-provider transfer.
"""
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from transport.models import Booking, Trip
from transport.services.payment import refund_driver_no_show, trip_departure_dt
from transport.services.driver_location import driver_was_at_rank

GRACE_AFTER_DEPARTURE = timedelta(minutes=15)
OPEN_STATUSES = (Trip.Status.SCHEDULED, Trip.Status.BOARDING, Trip.Status.IN_PROGRESS)


def refund_overdue_trip(trip_id, now=None, *, override=False):
    """Process a single departure; returns IDs of refunded paid booking records.

    The trip row is locked so repeated scheduler runs and manual attempts
    cannot issue duplicate refunds. No-show is final once processed.
    """
    now = now or timezone.now()
    with transaction.atomic():
        trip = Trip.objects.select_for_update().select_related('route__departure').get(pk=trip_id)
        departure = trip_departure_dt(trip)
        if departure is None or now < departure + GRACE_AFTER_DEPARTURE:
            return {"status": "too_early", "refunded": []}
        if trip.driver_location_status == 'no_show':
            return {"status": "already_processed", "refunded": []}
        if trip.status not in OPEN_STATUSES:
            return {"status": "not_active", "refunded": []}
        if driver_was_at_rank(trip) and not override:
            return {"status": "checked_in", "refunded": []}

        refunded = []
        # Companions have no separate payment in the group-booking model.
        # The group leader's paid amount covers the whole group.
        bookings = list(Booking.objects.select_for_update().filter(trip=trip)
                        .exclude(status=Booking.Status.CANCELLED).order_by('pk'))
        for booking in bookings:
            if booking.payment_status == Booking.PaymentStatus.PAID:
                refund_driver_no_show(booking)
                refunded.append(booking.pk)
            elif booking.payment_status == Booking.PaymentStatus.PENDING:
                booking.payment_status = ''
                booking.refund_reason = 'Driver did not check in at the departure rank; unpaid seat released.'
                booking.save(update_fields=['payment_status', 'refund_reason'])
            booking.status = Booking.Status.CANCELLED
            booking.save(update_fields=['status'])

        trip.driver_location_status = 'no_show'
        # Driver no-show is a final cancellation with a separate refund reason.
        trip.status = Trip.Status.CANCELLED
        trip.engaged_by = None
        trip.engaged_at = None
        trip.save(update_fields=['driver_location_status', 'status', 'engaged_by', 'engaged_at', 'updated_at'])
        return {"status": "refunded", "refunded": refunded}


def refund_overdue_driver_no_shows(now=None):
    """Scan due trips. Safe to call every minute, or on driver/operator feeds."""
    now = now or timezone.now()
    cutoff = timezone.localtime(now - GRACE_AFTER_DEPARTURE)
    eligible = Trip.objects.filter(status__in=OPEN_STATUSES,
        expected_departure_time__isnull=False, departure_date__lte=cutoff.date())
    outcome = {}
    for pk in eligible.values_list('pk', flat=True):
        result = refund_overdue_trip(pk, now=now)
        if result['status'] == 'refunded':
            outcome[pk] = result['refunded']
    return outcome
