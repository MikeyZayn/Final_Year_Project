from django.db import models
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from accounts.models import OperatorProfile
from .models import (
    Rank, Destination, OperatorAtRank, Route,
    Vehicle, Trip, Booking, VerificationCode, TripFlag, TripAssetChange,
    Feedback,
)
from .serializers import (
    RankSerializer, DestinationSerializer, OperatorAtRankSerializer,
    RouteSerializer, RouteWriteSerializer, VehicleSerializer,
    TripSerializer, TripWriteSerializer, BookingSerializer,
    VerificationCodeSerializer, TripFlagSerializer, TripAssetChangeSerializer,
    FeedbackSerializer, FeedbackRespondSerializer, FeedbackSubmitSerializer
)


# ---------- Helpers ----------

def _get_operator_or_none(request):
    try:
        return request.user.operator_profile
    except Exception:
        return None


def _get_admin_or_none(request):
    try:
        return request.user.admin_profile
    except Exception:
        return None


def _generate_trip_code(route):
    base = f"TRP-{route.id:03d}-{get_random_string(4).upper()}"
    while Trip.objects.filter(trip_code=base).exists():
        base = f"TRP-{route.id:03d}-{get_random_string(4).upper()}"
    return base


# ---------- Public ----------

@api_view(["GET"])
@permission_classes([AllowAny])
def api_list_routes(request):
    qs = Route.objects.filter(active=True).select_related(
        "departure", "destination"
    )
    from_q = request.query_params.get("from", "").strip()
    to_q = request.query_params.get("to", "").strip()
    if from_q:
        qs = qs.filter(
            models.Q(departure__name__icontains=from_q) |
            models.Q(departure__area__icontains=from_q)
        )
    if to_q:
        qs = qs.filter(destination__name__icontains=to_q)
    return Response(RouteSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def api_list_ranks(request):
    return Response(RankSerializer(Rank.objects.all(), many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def api_list_destinations(request):
    return Response(DestinationSerializer(Destination.objects.all(), many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def api_list_trips(request):
    """Upcoming trips. Filter by from-rank name, to-destination name, or route id."""
    today = timezone.now().date()
    qs = Trip.objects.filter(
        status__in=[Trip.Status.SCHEDULED, Trip.Status.BOARDING],
        departure_date__gte=today,
    ).select_related(
        "route__departure", "route__destination",
        "operator__association", "vehicle",
    ).order_by("departure_date", "expected_departure_time")

    from_q = request.query_params.get("from", "").strip()
    to_q = request.query_params.get("to", "").strip()
    route_id = request.query_params.get("route")

    if route_id:
        qs = qs.filter(route_id=route_id)
    if from_q:
        qs = qs.filter(
            models.Q(route__departure__name__icontains=from_q) |
            models.Q(route__departure__area__icontains=from_q)
        )
    if to_q:
        qs = qs.filter(route__destination__name__icontains=to_q)

    return Response(TripSerializer(qs, many=True).data)

# ---------- Operator ----------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_my_memberships(request):
    """Rank memberships for the logged-in operator."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    qs = OperatorAtRank.objects.filter(operator=op).select_related("rank")
    return Response(OperatorAtRankSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_request_rank(request):
    """Operator requests to operate at another rank."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)

    rank_id = request.data.get("rank_id")
    notes = request.data.get("notes", "").strip()
    if not rank_id:
        return Response({"detail": "rank_id is required."}, status=400)
    try:
        rank = Rank.objects.get(pk=rank_id)
    except Rank.DoesNotExist:
        return Response({"detail": "Rank not found."}, status=404)
    if OperatorAtRank.objects.filter(operator=op, rank=rank).exists():
        return Response({"detail": "You already have a membership at that rank."}, status=400)
    m = OperatorAtRank.objects.create(operator=op, rank=rank, notes=notes)
    return Response(OperatorAtRankSerializer(m).data, status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_my_trips(request):
    """Trips assigned to the logged-in operator."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    qs = Trip.objects.filter(operator=op).select_related(
        "route__departure", "route__destination", "vehicle"
    ).order_by("departure_date", "expected_departure_time")
    return Response(TripSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_trip_manifest(request, trip_id):
    """Operator gets the passenger manifest for one of their trips."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found or not yours."}, status=404)

    data = TripSerializer(trip).data
    bookings = trip.bookings.select_related("passenger", "verification_code")

    booked = []
    walk_ins = []
    for b in bookings:
        vc = getattr(b, "verification_code", None)
        entry = {
            "booking_id": b.id,
            "name": b.display_name(),
            "phone": b.passenger.phone if b.passenger else b.walk_in_phone,
            "next_of_kin_name": b.walk_in_next_of_kin_name if not b.passenger else None,
            "next_of_kin_phone": b.walk_in_next_of_kin_phone if not b.passenger else None,
            "status": b.status,
            "booked_at": b.booked_at,
            "walk_in": b.passenger is None,
            "verification_code": vc.code if vc else None,
            "code_verified": bool(vc and vc.verified_at),
        }
        if b.passenger is None:
            walk_ins.append(entry)
        else:
            booked.append(entry)

    data["booked_passengers"] = booked
    data["walk_in_passengers"] = walk_ins
    data["manifest"] = booked + walk_ins
    return Response(data)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_register_walk_in(request, trip_id):
    """Operator adds a walk-in passenger to a trip and issues a code."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found or not yours."}, status=404)

    if trip.seats_available <= 0:
        return Response({"detail": "Trip is full."}, status=400)

    name = request.data.get("name", "").strip()
    phone = request.data.get("phone", "").strip()
    if not name:
        return Response({"detail": "name is required."}, status=400)

    booking = Booking.objects.create(
        trip=trip,
        passenger=None,
        walk_in_name=name,
        walk_in_phone=phone,
        status=Booking.Status.BOARDED,
        boarded_at=timezone.now(),
        boarded_by=request.user,
    )
    code = get_random_string(6).upper()
    while VerificationCode.objects.filter(code=code).exists():
        code = get_random_string(6).upper()
    VerificationCode.objects.create(booking=booking, code=code, issued_by=request.user)

    return Response({
        "booking": BookingSerializer(booking).data,
        "verification_code": code,
    }, status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_flag_trip(request, trip_id):
    """Operator flags a trip for admin attention."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found or not yours."}, status=404)

    category = request.data.get("category")
    notes = request.data.get("notes", "").strip()
    valid = [c[0] for c in TripFlag.Category.choices]
    if category not in valid:
        return Response({"detail": "Invalid category."}, status=400)
    if not notes:
        return Response({"detail": "notes is required."}, status=400)

    flag = TripFlag.objects.create(
        trip=trip, category=category, notes=notes, flagged_by=request.user,
    )
    trip.status = Trip.Status.FLAGGED
    trip.save()
    return Response(TripFlagSerializer(flag).data, status=201)


# ---------- Admin ----------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def api_admin_routes(request):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)

    if request.method == "GET":
        return Response(RouteSerializer(Route.objects.all(), many=True).data)

    s = RouteWriteSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    route = s.save()
    return Response(RouteSerializer(route).data, status=201)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def api_admin_trips(request):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)

    if request.method == "GET":
        qs = Trip.objects.all().select_related(
            "route__departure", "route__destination",
            "operator__association", "vehicle",
        ).order_by("-departure_date")
        return Response(TripSerializer(qs, many=True).data)

    s = TripWriteSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    route = s.validated_data["route"]
    trip = s.save(trip_code=_generate_trip_code(route))
    return Response(TripSerializer(trip).data, status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_admin_flags(request):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    qs = TripFlag.objects.filter(status=TripFlag.Status.OPEN).select_related("trip")
    return Response(TripFlagSerializer(qs, many=True).data)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_available_drivers_vehicles(request):
    """Operator sees which drivers and vehicles can be assigned."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)

    from accounts.models import DriverProfile
    drivers = DriverProfile.objects.filter(
        status=DriverProfile.VerificationStatus.VERIFIED
    ).select_related("user")

    driver_list = [
        {
            "id": d.id,
            "name": f"{d.user.first_name} {d.user.last_name}".strip() or d.user.phone,
            "phone": d.user.phone,
            "license_number": d.license_number,
        }
        for d in drivers
    ]

    vehicles = Vehicle.objects.filter(roadworthy=True)
    vehicle_list = VehicleSerializer(vehicles, many=True).data

    return Response({"drivers": driver_list, "vehicles": vehicle_list})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_reassign_trip(request, trip_id):
    """Operator swaps driver and/or vehicle on their own trip."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found or not yours."}, status=404)

    if trip.status in [Trip.Status.COMPLETED, Trip.Status.CANCELLED]:
        return Response(
            {"detail": "Cannot reassign assets on a completed or cancelled trip."},
            status=400,
        )

    reason = request.data.get("reason")
    notes = request.data.get("notes", "").strip()
    valid_reasons = [c[0] for c in TripAssetChange.Reason.choices]
    if reason not in valid_reasons:
        return Response({"detail": "Invalid or missing reason."}, status=400)

    new_driver_id = request.data.get("driver_id")
    new_vehicle_id = request.data.get("vehicle_id")

    old_driver = trip.driver
    old_vehicle = trip.vehicle
    new_driver = None
    new_vehicle = None

    if new_driver_id:
        from accounts.models import DriverProfile
        try:
            new_driver = DriverProfile.objects.get(pk=new_driver_id)
        except DriverProfile.DoesNotExist:
            return Response({"detail": "Driver not found."}, status=404)
        if new_driver.status != DriverProfile.VerificationStatus.VERIFIED:
            return Response({"detail": "Driver is not verified."}, status=400)

    if new_vehicle_id:
        try:
            new_vehicle = Vehicle.objects.get(pk=new_vehicle_id)
        except Vehicle.DoesNotExist:
            return Response({"detail": "Vehicle not found."}, status=404)
        if not new_vehicle.roadworthy:
            return Response({"detail": "Vehicle is not roadworthy."}, status=400)

    if new_driver is None and new_vehicle is None:
        return Response(
            {"detail": "Supply driver_id and/or vehicle_id to reassign."}, status=400
        )

    change = TripAssetChange.objects.create(
        trip=trip,
        changed_by=request.user,
        old_driver=old_driver,
        new_driver=new_driver or old_driver,
        old_vehicle=old_vehicle,
        new_vehicle=new_vehicle or old_vehicle,
        reason=reason,
        notes=notes,
    )

    if new_driver:
        trip.driver = new_driver
    if new_vehicle:
        trip.vehicle = new_vehicle
        trip.seat_capacity = new_vehicle.seat_capacity
    trip.save()

    return Response({
        "trip": TripSerializer(trip).data,
        "change": TripAssetChangeSerializer(change).data,
    }, status=200)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_trip_asset_changes(request, trip_id):
    """Audit trail of driver/vehicle changes on a trip."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found or not yours."}, status=404)
    changes = trip.asset_changes.select_related(
        "old_driver__user", "new_driver__user",
        "old_vehicle", "new_vehicle", "changed_by",
    )
    return Response(TripAssetChangeSerializer(changes, many=True).data)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_engage_trip(request, trip_id):
    """Operator engages a trip — locks them to it until release."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)

    # one engagement at a time
    existing = Trip.objects.filter(engaged_by=op).exclude(pk=trip_id).first()
    if existing:
        return Response(
            {"detail": f"You are already engaged to trip {existing.trip_code}. Release it first."},
            status=400,
        )

    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found or not yours."}, status=404)

    if trip.status in [Trip.Status.COMPLETED, Trip.Status.CANCELLED]:
        return Response({"detail": "Cannot engage a completed or cancelled trip."}, status=400)

    trip.engaged_by = op
    trip.engaged_at = timezone.now()
    trip.status = Trip.Status.BOARDING
    trip.save()

    return Response(TripSerializer(trip).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_release_trip(request, trip_id):
    """Release the trip. Remaining unverified reservations become NO_SHOW."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op, engaged_by=op)
    except Trip.DoesNotExist:
        return Response({"detail": "You are not engaged to this trip."}, status=404)

    # bump unverified reservations
    bumped = trip.bookings.filter(status=Booking.Status.RESERVED).update(
        status=Booking.Status.NO_SHOW
    )

    trip.engaged_by = None
    trip.engaged_at = None
    if trip.status == Trip.Status.BOARDING:
        trip.status = Trip.Status.IN_PROGRESS
    trip.save()

    return Response({
        "trip": TripSerializer(trip).data,
        "bumped": bumped,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_verify_booking(request, trip_id, booking_id):
    """Operator confirms a booked passenger boarded. Issues a verification code."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op, engaged_by=op)
    except Trip.DoesNotExist:
        return Response({"detail": "You are not engaged to this trip."}, status=404)

    try:
        booking = Booking.objects.get(pk=booking_id, trip=trip)
    except Booking.DoesNotExist:
        return Response({"detail": "Booking not found on this trip."}, status=404)

    if booking.status != Booking.Status.RESERVED:
        return Response({"detail": f"Booking is already {booking.status}."}, status=400)

    booking.status = Booking.Status.BOARDED
    booking.boarded_at = timezone.now()
    booking.boarded_by = request.user
    booking.save()

    code = get_random_string(6).upper()
    while VerificationCode.objects.filter(code=code).exists():
        code = get_random_string(6).upper()
    VerificationCode.objects.create(booking=booking, code=code, issued_by=request.user)

    # if trip is full, bump remaining unverified reservations
    bumped = 0
    if trip.seats_taken >= trip.seat_capacity:
        bumped = trip.bookings.filter(status=Booking.Status.RESERVED).update(
            status=Booking.Status.NO_SHOW
        )

    return Response({
        "booking": BookingSerializer(booking).data,
        "verification_code": code,
        "bumped": bumped,
        "trip_full": trip.seats_taken >= trip.seat_capacity,
    })

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def api_my_bookings(request):
    if request.method == "GET":
        qs = Booking.objects.filter(passenger=request.user).select_related(
            "trip__route__departure", "trip__route__destination",
        )
        return Response(BookingSerializer(qs, many=True).data)

    trip_id = request.data.get("trip_id")
    if not trip_id:
        return Response({"detail": "trip_id is required."}, status=400)
    try:
        trip = Trip.objects.get(pk=trip_id)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found."}, status=404)

    if trip.status not in [Trip.Status.SCHEDULED, Trip.Status.BOARDING]:
        return Response({"detail": "This trip is not open for booking."}, status=400)
    if trip.seats_available <= 0:
        return Response({"detail": "Trip is full."}, status=400)

    booking, created = Booking.objects.get_or_create(
        trip=trip, passenger=request.user,
    )
    if not created:
        return Response({"detail": "You already booked this trip."}, status=400)

    return Response(BookingSerializer(booking).data, status=201)

# ---------- Feedback ----------

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_submit_feedback(request, booking_id):
    """Passenger submits feedback for their completed booking."""
    try:
        booking = Booking.objects.get(pk=booking_id, passenger=request.user)
    except Booking.DoesNotExist:
        return Response({"detail": "Booking not found."}, status=404)

    if booking.trip.status != Trip.Status.COMPLETED:
        return Response(
            {"detail": "Feedback is only available after the trip is completed."},
            status=400,
        )
    if Feedback.objects.filter(booking=booking).exists():
        return Response({"detail": "Feedback already submitted for this trip."}, status=400)

    s = FeedbackSubmitSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    data = s.validated_data

    feedback = Feedback.objects.create(
        booking=booking,
        passenger=request.user,
        trip=booking.trip,
        rating=data["rating"],
        has_complaint=data.get("has_complaint", False),
        category=data.get("category", "") if data.get("has_complaint") else "",
        description=data.get("description", "") if data.get("has_complaint") else "",
    )
    return Response(FeedbackSerializer(feedback).data, status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_my_feedback(request):
    """Passenger sees their own feedback (ratings + complaints + status)."""
    qs = Feedback.objects.filter(passenger=request.user).select_related(
        "trip__route__departure", "trip__route__destination", "passenger",
    )
    return Response(FeedbackSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_operator_feedback(request):
    """Operator sees feedback for their trips."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    qs = Feedback.objects.filter(trip__operator=op).select_related(
        "trip__route__departure", "trip__route__destination", "passenger",
    )
    return Response(FeedbackSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_operator_respond(request, feedback_id):
    """Operator responds to a complaint → status becomes 'resolved'."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        fb = Feedback.objects.get(pk=feedback_id, trip__operator=op)
    except Feedback.DoesNotExist:
        return Response({"detail": "Feedback not found."}, status=404)

    s = FeedbackRespondSerializer(data=request.data)
    s.is_valid(raise_exception=True)

    fb.operator_response = s.validated_data["operator_response"]
    fb.status = Feedback.Status.RESOLVED
    fb.reviewed_at = timezone.now()
    fb.reviewed_by = request.user
    fb.resolved_at = timezone.now()
    fb.save()
    return Response(FeedbackSerializer(fb).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_operator_escalate(request, feedback_id):
    """Operator escalates a complaint to admin review."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        fb = Feedback.objects.get(pk=feedback_id, trip__operator=op)
    except Feedback.DoesNotExist:
        return Response({"detail": "Feedback not found."}, status=404)

    fb.status = Feedback.Status.ESCALATED
    fb.reviewed_at = timezone.now()
    fb.reviewed_by = request.user
    fb.save()
    return Response(FeedbackSerializer(fb).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_operator_acknowledge(request, feedback_id):
    """Operator marks a complaint as under review (opens it)."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        fb = Feedback.objects.get(pk=feedback_id, trip__operator=op)
    except Feedback.DoesNotExist:
        return Response({"detail": "Feedback not found."}, status=404)

    if fb.status == Feedback.Status.SUBMITTED:
        fb.status = Feedback.Status.UNDER_REVIEW
        fb.reviewed_at = timezone.now()
        fb.reviewed_by = request.user
        fb.save()
    return Response(FeedbackSerializer(fb).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_admin_feedback(request):
    """Admin sees all feedback, especially escalated ones."""
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    qs = Feedback.objects.all().select_related(
        "trip__route__departure", "trip__route__destination",
        "trip__operator__association", "passenger",
    )
    # by default show escalated + confirmed
    scope = request.query_params.get("scope", "escalated")
    if scope == "escalated":
        qs = qs.filter(status=Feedback.Status.ESCALATED)
    return Response(FeedbackSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_admin_confirm_incident(request, feedback_id):
    """Admin confirms a complaint as a formal safety incident."""
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    try:
        fb = Feedback.objects.get(pk=feedback_id)
    except Feedback.DoesNotExist:
        return Response({"detail": "Feedback not found."}, status=404)

    fb.status = Feedback.Status.CONFIRMED_INCIDENT
    fb.admin_response = request.data.get("admin_response", "").strip()
    fb.reviewed_at = timezone.now()
    fb.reviewed_by = request.user
    fb.resolved_at = timezone.now()
    fb.save()
    return Response(FeedbackSerializer(fb).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_admin_dismiss(request, feedback_id):
    """Admin dismisses a complaint — no incident confirmed."""
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    try:
        fb = Feedback.objects.get(pk=feedback_id)
    except Feedback.DoesNotExist:
        return Response({"detail": "Feedback not found."}, status=404)

    fb.status = Feedback.Status.DISMISSED
    fb.admin_response = request.data.get("admin_response", "").strip()
    fb.reviewed_at = timezone.now()
    fb.reviewed_by = request.user
    fb.resolved_at = timezone.now()
    fb.save()
    return Response(FeedbackSerializer(fb).data)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_complete_trip(request, trip_id):
    """Operator marks a trip as completed."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found or not yours."}, status=404)

    trip.status = Trip.Status.COMPLETED
    trip.save()
    return Response(TripSerializer(trip).data)