"""Live driver GPS tracking for THEMBA.

The driver app pushes pings every few seconds while the trip is active. A ping
inside ``RANK_RADIUS_KM`` of the departure rank records ``driver_at_rank_at`` on
the Trip. That timestamp is the evidence used by the passenger-protection rule:

    "If the driver is not at the stated rank when the trip starts, paid
     passengers are refunded in full."

No ping at all also counts as "not at the rank", so a driver who never turns
their location on cannot block refunds.
"""
from __future__ import annotations

import math
from decimal import Decimal, InvalidOperation

from django.utils import timezone

from transport.services.geo import haversine_km

# ~350 m: close enough to be standing at the rank.
RANK_RADIUS_KM = 0.35

# How long before/after departure a ping still counts as "at the rank at start".
CHECK_IN_GRACE_BEFORE = 45 * 60  # seconds
CHECK_IN_GRACE_AFTER = 15 * 60  # seconds


def rank_point(trip):
    """Return ``(lat, lng)`` for the trip's departure rank, or ``None``."""
    rank = getattr(getattr(trip, "route", None), "departure", None)
    if rank is None or rank.latitude is None or rank.longitude is None:
        return None
    return float(rank.latitude), float(rank.longitude)


def parse_coordinate(value, name: str):
    """Validate a GPS coordinate coming from the client.

    Returns ``(float, None)`` on success or ``(None, error_message)``.
    """
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None, f"{name} must be a number."
    if not math.isfinite(number):
        return None, f"{name} must be a finite number."
    if name == "lat" and not -90 <= number <= 90:
        return None, "lat must be between -90 and 90."
    if name == "lng" and not -180 <= number <= 180:
        return None, "lng must be between -180 and 180."
    return number, None


def record_driver_location(trip, lat: float, lng: float) -> dict:
    """Record a GPS ping while locking the trip against the refund scheduler."""
    from datetime import timedelta
    from django.db import transaction
    from transport.models import Trip
    from .payment import trip_departure_dt

    with transaction.atomic():
        fresh = Trip.objects.select_for_update().select_related('route__departure').get(pk=trip.pk)
        if fresh.status not in (Trip.Status.SCHEDULED, Trip.Status.BOARDING, Trip.Status.IN_PROGRESS):
            raise ValueError('Location tracking is closed for this trip.')
        departure = trip_departure_dt(fresh)
        if departure and timezone.now() > departure + timedelta(minutes=15) and not driver_was_at_rank(fresh):
            raise ValueError('Rank A check-in closed 15 minutes after departure.')
        return _record_locked(fresh, lat, lng)


def _record_locked(trip, lat: float, lng: float) -> dict:
    """Save a driver position after acquiring the row lock."""
    if not isinstance(lat, float):
        lat = float(lat)
    if not isinstance(lng, float):
        lng = float(lng)

    if trip.driver_location_status == 'no_show':
        raise ValueError('Driver no-show has already been processed for this trip.')

    point = rank_point(trip)
    distance_km = None
    at_rank = False

    if point is not None:
        distance_km = haversine_km(lat, lng, point[0], point[1])
        at_rank = distance_km <= RANK_RADIUS_KM

    now = timezone.now()
    trip.driver_last_lat = Decimal(str(round(lat, 6)))
    trip.driver_last_lng = Decimal(str(round(lng, 6)))
    trip.driver_last_seen_at = now

    if at_rank:
        # Keep the first arrival time — that is the proof we need later.
        if trip.driver_at_rank_at is None:
            trip.driver_at_rank_at = now
        trip.driver_location_status = "at_rank"
    else:
        trip.driver_location_status = "off_rank"

    trip.save(
        update_fields=[
            "driver_last_lat",
            "driver_last_lng",
            "driver_last_seen_at",
            "driver_at_rank_at",
            "driver_location_status",
        ]
    )

    return {
        "at_rank": at_rank,
        "route_status": "at_rank" if at_rank else "off_route",
        "distance_from_rank_m": None if distance_km is None else round(distance_km * 1000),
        # Kept for the existing driver UI which reads distance_from_route_m.
        "distance_from_route_m": None if distance_km is None else round(distance_km * 1000),
        "rank_radius_m": int(RANK_RADIUS_KM * 1000),
        "at_rank_at": trip.driver_at_rank_at,
        "last_seen_at": trip.driver_last_seen_at,
        "coordinates_available": point is not None,
    }


def driver_was_at_rank(trip, *, grace_before=CHECK_IN_GRACE_BEFORE, grace_after=CHECK_IN_GRACE_AFTER) -> bool:
    """True when a ping put the driver at the rank around the trip's start time.

    A check-in outside the grace window still counts if it happened before the
    trip departed: a driver waiting at the rank for an hour is not a no-show.
    """
    if trip.driver_at_rank_at is None:
        return False

    # Trips without a scheduled time board "at the rank": any check-in counts.
    if trip.expected_departure_time is None:
        return True

    from transport.services.payment import trip_departure_dt

    departure = trip_departure_dt(trip)
    if departure is None:
        return True

    check_in = trip.driver_at_rank_at
    if check_in <= departure:
        # Arrived any time before departure (even hours early) — that is fine.
        return True
    return (check_in - departure).total_seconds() <= grace_after


def driver_no_show(trip) -> bool:
    """The trip has started and the driver was never at the rank."""
    if driver_was_at_rank(trip):
        return False
    return trip.status in ("in_progress", "completed", "cancelled")
