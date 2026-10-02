from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from transport.models import QueueEntry, Trip, Booking


def expire_queues(now=None):
    now = now or timezone.now()
    cutoff = now - timedelta(days=1)

    # Avoid taking a write lock when nothing needs to expire.
    entries_due = QueueEntry.objects.filter(
        active=True,
        added_at__lte=cutoff,
    ).exists()

    trips_due = any(
        trip.queue_expires_at <= now
        for trip in Trip.objects.filter(
            status__in=[
                Trip.Status.SCHEDULED,
                Trip.Status.BOARDING,
            ],
            created_at__lte=cutoff,
        ).exclude(bookings__status=Booking.Status.BOARDED)
    )

    if not entries_due and not trips_due:
        return {"queue_entries": 0, "trips": 0}

    return _expire_due_queues(now)


@transaction.atomic
def _expire_due_queues(now):
    cutoff = now - timedelta(days=1)

    entries = QueueEntry.objects.filter(
        active=True,
        added_at__lte=cutoff,
    )

    ranks = list(
        entries.values_list("rank_id", flat=True).distinct()
    )

    entry_count = entries.update(active=False) if ranks else 0

    for rank_id in ranks:
        remaining = (
            QueueEntry.objects.select_for_update()
            .filter(rank_id=rank_id, active=True)
            .order_by("position", "added_at", "id")
        )

        for position, entry in enumerate(remaining, start=1):
            if entry.position != position:
                entry.position = position
                entry.save(update_fields=["position"])

    trip_count = 0

    trips = Trip.objects.select_for_update().filter(
        status__in=[
            Trip.Status.SCHEDULED,
            Trip.Status.BOARDING,
        ],
        created_at__lte=cutoff,
    )

    for trip in trips:
        # Preserve future departures and trips carrying passengers.
        if trip.queue_expires_at > now:
            continue

        if trip.bookings.filter(
            status=Booking.Status.BOARDED
        ).exists():
            continue

        trip.status = Trip.Status.EXPIRED
        trip.engaged_by = None
        trip.engaged_at = None
        trip.save(update_fields=[
            "status",
            "engaged_by",
            "engaged_at",
            "updated_at",
        ])

        trip.bookings.filter(
            status=Booking.Status.RESERVED
        ).update(status=Booking.Status.NO_SHOW)

        trip_count += 1

    return {
        "queue_entries": entry_count,
        "trips": trip_count,
    }