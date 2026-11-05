"""Automatically start departures that have completed operator boarding checks.

Run ``python manage.py start_due_trips`` once a minute in deployment.
The driver/operator trip feeds call the same idempotent function as a fallback.
A scheduled trip without a verified vehicle/driver MUST NOT bypass boarding.
"""
from datetime import datetime

from django.db import transaction
from django.utils import timezone
from transport.models import Trip


def scheduled_at(trip):
    if not trip.expected_departure_time:
        return None
    naive = datetime.combine(trip.departure_date, trip.expected_departure_time)
    return timezone.make_aware(naive, timezone.get_current_timezone())


def start_due_trips(now=None):
    """Change eligible BOARDING trips to IN_PROGRESS; safe on repeated calls.

    Do not mark reserved passengers as no-show here: retain them for the
    operator's driver-no-show refund decision (GPS has 15 minutes grace).
    """
    now = now or timezone.now()
    changed = []
    qs = Trip.objects.filter(
        status=Trip.Status.BOARDING,
        assets_verified_at__isnull=False,
        expected_departure_time__isnull=False,
        departure_date__lte=timezone.localtime(now).date(),
    ).values_list('pk', flat=True)
    for pk in qs:
        with transaction.atomic():
            trip = Trip.objects.select_for_update().get(pk=pk)
            departure = scheduled_at(trip)
            if (trip.status != Trip.Status.BOARDING or not trip.assets_verified_at
                    or departure is None or departure > now):
                continue
            trip.status = Trip.Status.IN_PROGRESS
            trip.actual_departure_time = now  # server transition time, not GPS proof of physical departure
            trip.engaged_by = None
            trip.engaged_at = None
            trip.save(update_fields=['status', 'actual_departure_time', 'engaged_by', 'engaged_at', 'updated_at'])
            changed.append(trip.pk)
    # Check the 15-minute GPS grace period on each scheduler run.
    # These checks run even if no dashboard is open when the command is scheduled.
    from .auto_no_show import refund_overdue_driver_no_shows
    refund_overdue_driver_no_shows(now=now)
    return changed
