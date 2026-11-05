"""Passenger notifications derived from booking + payment state.

THEMBA does not store a separate notification inbox yet: every notification the
brief describes (payment confirmed, cash booking pending, boarding receipt,
refund) is a fact already recorded on the Booking. Deriving the feed here keeps a
single source of truth and means a notification can never disagree with the
booking that produced it.
"""
from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal

from django.utils import timezone

from transport.models import Booking

# Lower number = more urgent. A pending cash payment needs action before the
# seat is released, so it leads the feed; a refund is the next fact the
# passenger must know; "ready to travel" and boarding statements follow.
URGENCY = {
    "cash_pending": 0,
    "refund": 1,
    "booking_verified": 2,
    "boarding_confirmed": 3,
}


def _money(value):
    if value is None:
        return None
    return str(Decimal(value).quantize(Decimal("0.01")))


def _time(value):
    return value.strftime("%H:%M") if value else None


def _departure_at(trip):
    """Departure timestamp used to order the most urgent, soonest bookings."""
    naive = datetime.combine(trip.departure_date, trip.expected_departure_time or time.min)
    return timezone.make_aware(naive, timezone.get_current_timezone())


def _route_label(booking):
    route = booking.trip.route
    return f"{route.departure.name} \u2192 {route.destination.name}"


def _base(booking):
    trip = booking.trip
    return {
        "booking_id": booking.id,
        "trip_id": trip.id,
        "trip_code": trip.trip_code,
        "route_label": _route_label(booking),
        "departure_date": str(trip.departure_date),
        "departure_time": _time(trip.expected_departure_time),
        "departure_at": _departure_at(trip).isoformat(),
        "departure_rank": trip.route.departure.name,
        "destination_rank": trip.route.destination.name,
        "passenger_display_status": booking.passenger_display_status(),
        "payment_method": booking.payment_method,
        "payment_status": booking.payment_status,
    }


def booking_notifications(booking):
    """Every notification implied by one booking, newest first."""
    base = _base(booking)
    events = []

    if booking.payment_status == Booking.PaymentStatus.PAID:
        events.append(
            {
                **base,
                "id": f"booking-{booking.id}-verified",
                "kind": "booking_verified",
                "title": "You're ready to travel",
                "body": (
                    "Payment received. You are a verified passenger on this trip. "
                    "Show this notification when you board — arrive on time at the "
                    "departure rank. Late arrivals are not refunded."
                ),
                "proof": True,
                "amount": _money(booking.amount_paid or booking.fare_amount),
                "created_at": booking.paid_at or booking.booked_at,
            }
        )
    elif booking.payment_status == Booking.PaymentStatus.PENDING:
        events.append(
            {
                **base,
                "id": f"booking-{booking.id}-pending",
                "kind": "cash_pending",
                "title": "Cash booking pending",
                "body": (
                    "You are a pending passenger. Arrive at least 30 minutes early "
                    "with cash. The operator must verify your payment before "
                    "departure or your seat may be released."
                ),
                "proof": True,
                "amount": _money(booking.fare_amount),
                "created_at": booking.booked_at,
            }
        )

    if booking.payment_status in (
        Booking.PaymentStatus.REFUNDED,
        Booking.PaymentStatus.PARTIAL_REFUND,
        Booking.PaymentStatus.FORFEITED,
    ):
        events.append(
            {
                **base,
                "id": f"booking-{booking.id}-refund",
                "kind": "refund",
                "title": (
                    "Refund issued"
                    if booking.refund_amount and booking.refund_amount > 0
                    else "No refund due"
                ),
                "body": booking.refund_reason or "Your booking payment was updated.",
                "proof": False,
                "amount": _money(booking.refund_amount),
                "cancellation_fee": _money(booking.cancellation_fee),
                "created_at": booking.paid_at or booking.booked_at,
            }
        )

    if booking.status in (Booking.Status.BOARDED, Booking.Status.COMPLETED):
        receipt = getattr(booking, "verification_code", None)
        events.append(
            {
                **base,
                "id": f"booking-{booking.id}-boarding",
                "kind": "boarding_confirmed",
                "title": "Boarding confirmed",
                "body": (
                    "Your seat was confirmed by the operator. "
                    + (
                        f"Receipt code: {receipt.code}."
                        if receipt
                        else "This notification is your proof of travel."
                    )
                ),
                "proof": True,
                "code": receipt.code if receipt else None,
                "created_at": booking.boarded_at or booking.booked_at,
            }
        )

    return events


def notifications_for_user(user, limit=40, offset=0):
    """The passenger's feed, most urgent first.

    Urgency comes from the notification kind (a cash booking that needs
    verification outranks a receipt), and urgent items are ordered by the
    soonest departure so the passenger always sees the three that matter now.
    ``limit`` and ``offset`` let the client page through three at a time.
    """
    bookings = (
        Booking.objects.filter(passenger=user)
        .select_related(
            "trip__route__departure",
            "trip__route__destination",
            "verification_code",
        )
        .order_by("-booked_at")[:50]
    )
    items = []
    for booking in bookings:
        items.extend(booking_notifications(booking))

    # Recency first, then a stable sort by urgency and departure time.
    items.sort(key=lambda item: item["created_at"], reverse=True)
    items.sort(key=lambda item: (URGENCY.get(item["kind"], 9), item["departure_at"]))

    for item in items:
        item["priority"] = URGENCY.get(item["kind"], 9)

    start = max(0, offset)
    end = start + max(1, limit)
    page = items[start:end]

    for item in page:
        item["created_at"] = item["created_at"].isoformat()
    return page

