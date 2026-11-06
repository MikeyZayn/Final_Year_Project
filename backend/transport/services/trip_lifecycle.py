"""Automatically close trips that did not start or were never completed.

The driver no-show refund check runs first (at departure + 15 minutes).
This service handles remaining missed starts and trips that exceed their
expected journey duration; it never invents a passenger refund.
"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from transport.models import Trip, Booking
from .payment import trip_departure_dt

DEPARTURE_GRACE = timedelta(minutes=15)
COMPLETION_GRACE = timedelta(minutes=15)
# No reliable route duration: allow a whole day before concluding an
# unfinished trip was not marked completed. Avoid cancelling a real journey
# immediately at its departure time.
UNKNOWN_ROUTE_DURATION = timedelta(hours=24)


def overdue_reason(trip, now):
    departure = trip_departure_dt(trip)
    if departure is None:
        return None
    if trip.status in (Trip.Status.SCHEDULED, Trip.Status.BOARDING):
        if now >= departure + DEPARTURE_GRACE:
            return 'Scheduled departure passed without a started trip.'
        return None
    if trip.status == Trip.Status.IN_PROGRESS:
        minutes = getattr(trip.route, 'typical_duration_minutes', None)
        expected_duration = (timedelta(minutes=minutes) if minutes and minutes > 0
                             else UNKNOWN_ROUTE_DURATION)
        if now >= departure + expected_duration + COMPLETION_GRACE:
            return 'Trip was not marked completed by its expected completion deadline.'
    return None


def cancel_overdue_trips(now=None):
    """Close overdue trips, unlock the operator, and preserve refund records.

    Must run *after* the T+15 driver no-show refund process. If the driver
    never checked in, that process marks the trip cancelled and records full
    refunds; we do not process it again.
    """
    now = now or timezone.now()
    candidate_ids = Trip.objects.filter(
        status__in=[Trip.Status.SCHEDULED, Trip.Status.BOARDING, Trip.Status.IN_PROGRESS],
        departure_date__lte=timezone.localtime(now).date(),
        expected_departure_time__isnull=False,
    ).values_list('pk', flat=True)
    cancelled = []
    for pk in candidate_ids:
        with transaction.atomic():
            trip = Trip.objects.select_for_update().select_related('route').get(pk=pk)
            reason = overdue_reason(trip, now)
            if reason is None:
                continue
            trip.status = Trip.Status.CANCELLED
            trip.engaged_by = None
            trip.engaged_at = None
            trip.save(update_fields=['status', 'engaged_by', 'engaged_at', 'updated_at'])
            # The journey did not finish successfully; no passenger should
            # retain a live seat in a terminal cancelled trip.
            trip.bookings.filter(status__in=[
                Booking.Status.RESERVED, Booking.Status.BOARDED,
            ]).update(status=Booking.Status.CANCELLED)
            # Do not invent a cash/card refund here: only the existing driver
            # no-show workflow is authorised to refund automatically.
            cancelled.append(trip.pk)
    return cancelled
