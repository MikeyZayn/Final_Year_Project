"""Demo payment helpers for THEMBA trip bookings.

Card payments are simulated (no real gateway). Cash stays pending until an
operator verifies the passenger ~30 minutes before departure.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from transport.models import Booking, Trip


CANCELLATION_FEE_RATIO = Decimal("0.30")
CASH_VERIFY_WINDOW = timedelta(minutes=30)
CANCEL_FULL_REFUND_WINDOW = timedelta(hours=1)
RANK_RADIUS_KM = 0.35  # ~350 m considered "at rank"


def trip_departure_dt(trip: Trip) -> datetime | None:
    if not trip.departure_date or not trip.expected_departure_time:
        return None
    naive = datetime.combine(trip.departure_date, trip.expected_departure_time)
    if timezone.is_naive(naive):
        return timezone.make_aware(naive, timezone.get_current_timezone())
    return naive


def fare_for_trip(trip: Trip, seats: int = 1) -> Decimal:
    fare = getattr(trip.route, "fare", None) or Decimal("0")
    return (Decimal(fare) * Decimal(seats)).quantize(Decimal("0.01"))


def apply_card_payment(booking: Booking, card_token: str) -> Booking:
    last_four = {"demo_visa": "4242", "demo_mastercard": "4444"}[card_token]
    booking.payment_method = Booking.PaymentMethod.CARD
    booking.payment_status = Booking.PaymentStatus.PAID
    booking.amount_paid = booking.fare_amount
    booking.paid_at = timezone.now()
    booking.payment_verified_at = booking.paid_at
    booking.card_holder_name = ""
    booking.card_last_four = last_four
    booking.payment_verified_by = None
    booking.save()
    return booking


def apply_rank_payment_pending(booking: Booking, method: str) -> Booking:
    booking.payment_method = method
    booking.payment_status = Booking.PaymentStatus.PENDING
    booking.amount_paid = None
    booking.paid_at = None
    booking.card_holder_name = ""
    booking.card_last_four = ""
    booking.payment_verified_at = None
    booking.payment_verified_by = None
    booking.save()
    return booking


def operator_verify_rank_payment(booking: Booking, operator_user) -> Booking:
    if booking.payment_method not in (Booking.PaymentMethod.CASH, Booking.PaymentMethod.COMMUTER_PASS):
        raise ValueError("This payment method does not need on-site payment verification.")
    if booking.payment_status == Booking.PaymentStatus.PAID:
        return booking
    booking.payment_status = Booking.PaymentStatus.PAID
    booking.amount_paid = (
        Decimal("0") if booking.payment_method == Booking.PaymentMethod.COMMUTER_PASS else booking.fare_amount
    )
    booking.paid_at = timezone.now()
    booking.payment_verified_at = booking.paid_at
    booking.payment_verified_by = operator_user
    booking.save()
    return booking


def cancel_with_policy(booking: Booking) -> dict:
    """Apply cancel + refund policy.

    - More than 1 hour before departure: full refund (if paid)
    - Within 1 hour: 30% fee kept, 70% refunded (if paid)
    - After departure time / in progress: no refund
    """
    now = timezone.now()
    dep = trip_departure_dt(booking.trip)
    paid = booking.payment_status == Booking.PaymentStatus.PAID
    amount = booking.amount_paid if booking.amount_paid is not None else booking.fare_amount or Decimal("0")

    result = {
        "cancellation_fee": Decimal("0.00"),
        "refund_amount": Decimal("0.00"),
        "refund_reason": "",
        "payment_status": booking.payment_status,
    }
    if booking.payment_method == Booking.PaymentMethod.COMMUTER_PASS:
        booking.payment_status = ""
        booking.refund_reason = "Commuter pass booking cancelled. No fare was charged by THEMBA."
        booking.save(update_fields=["payment_status", "refund_reason"])
        return {**result, "payment_status": "", "refund_reason": booking.refund_reason}

    if booking.trip.status in (Trip.Status.IN_PROGRESS, Trip.Status.COMPLETED):
        result["refund_reason"] = "Trip already departed or completed — no refund."
        if paid:
            booking.payment_status = Booking.PaymentStatus.FORFEITED
            booking.refund_amount = Decimal("0.00")
            booking.refund_reason = result["refund_reason"]
            booking.save(update_fields=["payment_status", "refund_amount", "refund_reason"])
            result["payment_status"] = booking.payment_status
        return result

    if dep and now >= dep:
        result["refund_reason"] = "Cancelled after scheduled departure — no refund."
        if paid:
            booking.payment_status = Booking.PaymentStatus.FORFEITED
            booking.refund_amount = Decimal("0.00")
            booking.refund_reason = result["refund_reason"]
            booking.save(update_fields=["payment_status", "refund_amount", "refund_reason"])
            result["payment_status"] = booking.payment_status
        return result

    if not paid:
        result["refund_reason"] = "Payment was still pending. The seat was released and nothing was charged."
        booking.payment_status = ""
        booking.refund_reason = result["refund_reason"]
        booking.save(update_fields=["payment_status", "refund_reason"])
        return result

    if dep is None or (dep - now) >= CANCEL_FULL_REFUND_WINDOW:
        fee = Decimal("0.00")
        refund = amount
        reason = "Cancelled before an untimed departure — full refund." if dep is None else "Cancelled at least 1 hour before departure — full refund."
        status = Booking.PaymentStatus.REFUNDED
    else:
        fee = (amount * CANCELLATION_FEE_RATIO).quantize(Decimal("0.01"))
        refund = (amount - fee).quantize(Decimal("0.01"))
        reason = "Cancelled within 1 hour of departure — 30% cancellation fee applied."
        status = Booking.PaymentStatus.PARTIAL_REFUND

    booking.cancellation_fee = fee
    booking.refund_amount = refund
    booking.refund_reason = reason
    booking.payment_status = status
    booking.save(
        update_fields=[
            "cancellation_fee",
            "refund_amount",
            "refund_reason",
            "payment_status",
        ]
    )
    result.update(
        {
            "cancellation_fee": fee,
            "refund_amount": refund,
            "refund_reason": reason,
            "payment_status": status,
        }
    )
    return result


def refund_unserved_booking(booking: Booking, reason: str):
    """Close a seat after service cancellation and reverse any simulated payment."""
    if booking.payment_method == Booking.PaymentMethod.COMMUTER_PASS:
        booking.payment_status = ""
    elif booking.payment_status == Booking.PaymentStatus.PAID:
        booking.payment_status = Booking.PaymentStatus.REFUNDED
        booking.refund_amount = booking.amount_paid if booking.amount_paid is not None else booking.fare_amount or Decimal("0")
        booking.cancellation_fee = Decimal("0")
    elif booking.payment_status == Booking.PaymentStatus.PENDING:
        booking.payment_status = ""
    booking.refund_reason = reason
    booking.save(update_fields=["status", "payment_status", "refund_amount", "cancellation_fee", "refund_reason"])


def refund_driver_no_show(booking: Booking) -> Booking:
    """Full refund when driver is not at the rank at trip start."""
    if booking.payment_status != Booking.PaymentStatus.PAID:
        return booking
    amount = booking.amount_paid if booking.amount_paid is not None else booking.fare_amount or Decimal("0")
    booking.payment_status = Booking.PaymentStatus.REFUNDED
    booking.refund_amount = amount
    booking.cancellation_fee = Decimal("0.00")
    booking.refund_reason = (
        "Driver was not at the departure rank at the scheduled trip time — full refund."
    )
    booking.save(
        update_fields=[
            "payment_status",
            "refund_amount",
            "cancellation_fee",
            "refund_reason",
        ]
    )
    return booking


# Town labels shown to passengers → how we match ranks / destinations in DB
TOWN_ALIASES = {
    "empangeni": ["empangeni"],
    "richards bay": ["richards bay", "richardsbay"],
    "esikhawini": ["esikhawini", "e sikhawini"],
    "e sikhawini": ["esikhawini", "e sikhawini"],
    "ongoye": ["ongoye", "kwa-dlangezwa", "kwadlangezwa", "kwa dlangezwa"],
}


def normalize_town(value: str) -> str:
    return " ".join((value or "").strip().lower().replace("-", " ").split())


def town_search_terms(value: str) -> list[str]:
    key = normalize_town(value)
    if not key:
        return []
    return TOWN_ALIASES.get(key, [key])
