"""Passenger notifications derived from booking + payment state.

THEMBA does not store a separate notification inbox yet: every notification the
brief describes (payment confirmed, cash booking pending, boarding receipt,
refund) is a fact already recorded on the Booking. Deriving the feed here keeps a
single source of truth and means a notification can never disagree with the
booking that produced it.
"""
from __future__ import annotations

from decimal import Decimal

from transport.models import Booking


def _money(value):
    if value is None:
        return None
    return str(Decimal(value).quantize(Decimal("0.01")))


def _time(value):
    return value.strftime("%H:%M") if value else None


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


def notifications_for_user(user, limit=40):
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
    items.sort(key=lambda item: item["created_at"], reverse=True)
    trimmed = items[:limit]
    for item in trimmed:
        item["created_at"] = item["created_at"].isoformat()
    return trimmed
