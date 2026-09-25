from django.db import models
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from accounts.models import OperatorProfile, User
from .models import (
    Rank, Destination, OperatorAtRank, Route,
    Vehicle, Trip, Booking, VerificationCode,
    TripFlag, TripAssetChange, Feedback,
    QueueEntry, DriverVehicle, Announcement, PanicAlert,
)

from .serializers import (
    RankSerializer, DestinationSerializer, OperatorAtRankSerializer,
    RouteSerializer, RouteWriteSerializer, VehicleSerializer,
    TripSerializer, TripWriteSerializer, BookingSerializer,
    VerificationCodeSerializer, TripFlagSerializer, TripAssetChangeSerializer,
    FeedbackSerializer, FeedbackRespondSerializer, FeedbackSubmitSerializer,
    AnnouncementSerializer, AnnouncementWriteSerializer, PanicAlertSerializer,
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
    qs = Booking.objects.filter(passenger=request.user).exclude(status=Booking.Status.CANCELLED)
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
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)

    qs = Feedback.objects.filter(
        trip__route__departure=admin_profile.rank,
    ).select_related(
        "trip__route__departure", "trip__route__destination",
        "trip__operator__association", "passenger",
    )

    scope = request.query_params.get("scope", "escalated")
    if scope == "escalated":
        qs = qs.filter(status=Feedback.Status.ESCALATED)
    elif scope == "complaints":
        qs = qs.filter(has_complaint=True)
    # scope == "all" → no filter

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
    """Operator marks a trip as completed. Works whether or not the taxi is full.
    Unverified reservations become no-shows. Boarded passengers become completed."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found or not yours."}, status=404)

    if trip.status == Trip.Status.COMPLETED:
        return Response({"detail": "Trip is already completed."}, status=400)
    if trip.status == Trip.Status.CANCELLED:
        return Response({"detail": "Cannot complete a cancelled trip."}, status=400)

    # Bump unverified reservations
    no_shows = trip.bookings.filter(status=Booking.Status.RESERVED).update(
        status=Booking.Status.NO_SHOW
    )
    # Mark boarded passengers as completed so they can rate
    completed = trip.bookings.filter(status=Booking.Status.BOARDED).update(
        status=Booking.Status.COMPLETED
    )

    trip.status = Trip.Status.COMPLETED
    trip.engaged_by = None
    trip.engaged_at = None
    trip.save()

    return Response({
        "trip": TripSerializer(trip).data,
        "no_shows": no_shows,
        "completed_passengers": completed,
    })

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_cancel_booking(request, booking_id):
    """Passenger cancels their own booking. Only allowed before boarding."""
    try:
        booking = Booking.objects.get(pk=booking_id, passenger=request.user)
    except Booking.DoesNotExist:
        return Response({"detail": "Booking not found."}, status=404)

    if booking.status == Booking.Status.CANCELLED:
        return Response({"detail": "Already cancelled."}, status=400)

    if booking.status in [Booking.Status.BOARDED, Booking.Status.COMPLETED]:
        return Response(
            {"detail": "Cannot cancel after boarding. Contact the operator."},
            status=400,
        )

    if booking.trip.status == Trip.Status.IN_PROGRESS:
        return Response(
            {"detail": "Trip has already departed. Cannot cancel."},
            status=400,
        )

    booking.status = Booking.Status.CANCELLED
    booking.save()
    return Response(BookingSerializer(booking).data)

# ---------- Driver endpoints ----------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_driver_profile(request):
    """Profile for the logged-in driver — includes ratings + complaints summary."""
    try:
        profile = request.user.driver_profile
    except Exception:
        return Response({"detail": "Not a driver account."}, status=403)

    u = request.user
    from .models import Feedback

    driver_trips = Trip.objects.filter(driver=profile)
    feedback = Feedback.objects.filter(trip__driver=profile)

    rating_qs = feedback.exclude(rating__isnull=True)
    avg = rating_qs.aggregate(avg=models.Avg("rating"))["avg"]
    rating_count = rating_qs.count()
    complaint_count = feedback.filter(has_complaint=True).count()
    open_complaints = feedback.filter(
        has_complaint=True,
        status__in=[Feedback.Status.SUBMITTED, Feedback.Status.UNDER_REVIEW, Feedback.Status.ESCALATED],
    ).count()

    return Response({
        "user": {
            "first_name": u.first_name,
            "last_name": u.last_name,
            "phone": u.phone,
            "email": u.email,
        },
        "license_number": profile.license_number,
        "id_number": profile.id_number,
        "pdp_number": profile.pdp_number,
        "status": profile.status,
        "external_verification_status": profile.external_verification_status,
        "external_verification_reason": profile.external_verification_reason,
        "rating_avg": round(avg, 2) if avg else None,
        "rating_count": rating_count,
        "complaint_count": complaint_count,
        "open_complaints": open_complaints,
        "notifications": [],   # placeholder until a notifications model exists
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_driver_vehicle(request):
    """The vehicle currently assigned to the logged-in driver."""
    try:
        profile = request.user.driver_profile
    except Exception:
        return Response({"detail": "Not a driver account."}, status=403)

    assignment = (
        DriverVehicle.objects
        .filter(driver=profile, active=True, vehicle__roadworthy=True)
        .select_related("vehicle")
        .first()
    )
    if not assignment:
        return Response(None)

    v = assignment.vehicle
    return Response({
        "id": v.id,
        "plate_number": v.plate_number,
        "make": v.make,
        "model": v.model,
        "seat_capacity": v.seat_capacity,
        "status": "roadworthy" if v.roadworthy else "not_roadworthy",
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_driver_trips(request):
    """Trips where this user is the assigned driver."""
    try:
        profile = request.user.driver_profile
    except Exception:
        return Response({"detail": "Not a driver account."}, status=403)

    qs = (
        Trip.objects
        .filter(driver=profile)
        .select_related(
            "route__departure", "route__destination",
            "operator__association", "vehicle",
        )
        .order_by("departure_date", "expected_departure_time")
    )
    return Response(TripSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_driver_confirm_trip(request):
    """Driver enters a trip code to confirm they're operating that trip.
    For the prototype this simply fetches and returns the trip — the
    authoritative assignment is what the operator/admin set."""
    try:
        profile = request.user.driver_profile
    except Exception:
        return Response({"detail": "Not a driver account."}, status=403)

    code = (request.data.get("trip_code") or "").strip()
    if not code:
        return Response({"detail": "trip_code is required."}, status=400)

    try:
        trip = Trip.objects.select_related(
            "route__departure", "route__destination", "vehicle",
        ).get(trip_code=code)
    except Trip.DoesNotExist:
        return Response({"detail": "No trip with that code."}, status=404)

    if trip.driver_id and trip.driver_id != profile.id:
        return Response(
            {"detail": "This trip is assigned to another driver."},
            status=403,
        )

    # If unassigned, assign to this driver
    if trip.driver_id is None:
        trip.driver = profile
        trip.save()

    return Response(TripSerializer(trip).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_driver_post_location(request, vehicle_id):
    """Stub — GPS location ingestion not implemented in the prototype.
    Returns a benign response so the driver UI can render without error."""
    return Response({
        "lat": request.data.get("lat"),
        "lng": request.data.get("lng"),
        "trip_id": request.data.get("trip_id"),
        "route_status": "on_route",
        "distance_from_route_m": 0,
        "note": "GPS ingestion not implemented in the prototype.",
    })

@api_view(["POST"])
@permission_classes([AllowAny])
def api_routing_directions(request):
    """Proxy to the routing service. Reads ORS_API_KEY from Django settings."""
    origin = request.data.get("origin") or {}
    destination = request.data.get("destination") or {}

    lat0 = origin.get("lat")
    lng0 = origin.get("lng")
    lat1 = destination.get("lat")
    lng1 = destination.get("lng")

    if None in (lat0, lng0, lat1, lng1):
        return Response(
            {"detail": "origin and destination must both have lat and lng."},
            status=400,
        )

    try:
        from .services.routing_service import get_driving_route
    except ImportError as e:
        return Response(
            {"detail": f"Routing service not available: {e}"}, status=503
        )

    try:
        result = get_driving_route(
            (float(lat0), float(lng0)),
            (float(lat1), float(lng1)),
        )
    except Exception as exc:
        return Response(
            {"detail": f"Routing failed: {exc}"}, status=502
        )

    return Response(result)


# ---------- Announcements ----------

@api_view(["GET"])
@permission_classes([AllowAny])
def api_list_announcements(request):
    """Public feed of active announcements."""
    qs = Announcement.objects.filter(active=True).select_related(
        "operator__association", "route__departure", "route__destination", "created_by",
    ).order_by("-created_at")[:50]
    return Response(AnnouncementSerializer(qs, many=True).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def api_my_announcements(request):
    """Operator's own announcements — list or create."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)

    if request.method == "GET":
        qs = Announcement.objects.filter(operator=op).select_related(
            "route__departure", "route__destination", "created_by",
        )
        return Response(AnnouncementSerializer(qs, many=True).data)

    s = AnnouncementWriteSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    data = s.validated_data
    route_id = data.pop("route_id", None)
    route = Route.objects.filter(pk=route_id).first() if route_id else None

    ann = Announcement.objects.create(
        operator=op, route=route,
        created_by=request.user,
        **data,
    )
    return Response(AnnouncementSerializer(ann).data, status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def api_announcement_detail(request, announcement_id):
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        ann = Announcement.objects.get(pk=announcement_id, operator=op)
    except Announcement.DoesNotExist:
        return Response({"detail": "Announcement not found."}, status=404)

    if request.method == "DELETE":
        ann.active = False
        ann.save()
        return Response(status=204)

    for field in ["title", "body", "active"]:
        if field in request.data:
            setattr(ann, field, request.data[field])
    if "route_id" in request.data:
        rid = request.data["route_id"]
        ann.route = Route.objects.filter(pk=rid).first() if rid else None
    ann.save()
    return Response(AnnouncementSerializer(ann).data)

# ---------- Panic alerts ----------

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_trigger_panic(request, booking_id):
    """Passenger raises a panic alert on their active trip."""
    try:
        booking = Booking.objects.get(pk=booking_id, passenger=request.user)
    except Booking.DoesNotExist:
        return Response({"detail": "Booking not found."}, status=404)

    if booking.status != Booking.Status.BOARDED:
        return Response(
            {"detail": "Panic button is only available while you are boarded."},
            status=400,
        )

    # prevent duplicate active alerts
    existing = booking.panic_alerts.filter(status=PanicAlert.Status.ACTIVE).first()
    if existing:
        return Response(PanicAlertSerializer(existing).data, status=200)

    alert = PanicAlert.objects.create(
        booking=booking,
        passenger=request.user,
        latitude=request.data.get("latitude"),
        longitude=request.data.get("longitude"),
        message=request.data.get("message", ""),
    )
    return Response(PanicAlertSerializer(alert).data, status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_cancel_panic(request, alert_id):
    """Passenger cancels their own alert (false alarm)."""
    try:
        alert = PanicAlert.objects.get(pk=alert_id, passenger=request.user)
    except PanicAlert.DoesNotExist:
        return Response({"detail": "Alert not found."}, status=404)

    if alert.status != PanicAlert.Status.ACTIVE:
        return Response({"detail": "Alert is no longer active."}, status=400)

    alert.status = PanicAlert.Status.CANCELLED
    alert.resolved_at = timezone.now()
    alert.resolution_notes = "Cancelled by passenger."
    alert.save()
    return Response(PanicAlertSerializer(alert).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_operator_alerts(request):
    """Operator sees active alerts on their trips."""
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    qs = PanicAlert.objects.filter(
        booking__trip__operator=op,
        status=PanicAlert.Status.ACTIVE,
    ).select_related("booking__trip", "passenger")
    return Response(PanicAlertSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_operator_acknowledge_alert(request, alert_id):
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        alert = PanicAlert.objects.get(pk=alert_id, booking__trip__operator=op)
    except PanicAlert.DoesNotExist:
        return Response({"detail": "Alert not found."}, status=404)

    alert.status = PanicAlert.Status.ACKNOWLEDGED
    alert.acknowledged_by = request.user
    alert.acknowledged_at = timezone.now()
    alert.save()
    return Response(PanicAlertSerializer(alert).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_operator_resolve_alert(request, alert_id):
    op = _get_operator_or_none(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        alert = PanicAlert.objects.get(pk=alert_id, booking__trip__operator=op)
    except PanicAlert.DoesNotExist:
        return Response({"detail": "Alert not found."}, status=404)

    alert.status = PanicAlert.Status.RESOLVED
    alert.resolved_at = timezone.now()
    alert.resolution_notes = request.data.get("notes", "")
    alert.save()
    return Response(PanicAlertSerializer(alert).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_my_active_panic(request):
    """Passenger checks if they have an active alert on any of their bookings."""
    qs = PanicAlert.objects.filter(
        passenger=request.user,
        status=PanicAlert.Status.ACTIVE,
    ).select_related("booking__trip")
    return Response(PanicAlertSerializer(qs, many=True).data)

# ---------- Admin (rank-scoped) ----------

def _admin_rank(admin_profile):
    return admin_profile.rank


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_admin_pending_memberships(request):
    """Pending OperatorAtRank requests for this admin's rank."""
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    if not admin_profile.rank:
        return Response({"detail": "You are not assigned to a rank."}, status=400)

    qs = OperatorAtRank.objects.filter(
        rank=admin_profile.rank,
        status=OperatorAtRank.Status.PENDING,
    ).select_related("operator__user", "operator__association", "rank")
    return Response(OperatorAtRankSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_admin_approve_membership(request, membership_id):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    try:
        m = OperatorAtRank.objects.get(pk=membership_id, rank=admin_profile.rank)
    except OperatorAtRank.DoesNotExist:
        return Response({"detail": "Membership not found for your rank."}, status=404)

    m.status = OperatorAtRank.Status.ACTIVE
    m.approved_by = admin_profile
    m.approved_at = timezone.now()
    m.save()
    return Response(OperatorAtRankSerializer(m).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_admin_reject_membership(request, membership_id):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    try:
        m = OperatorAtRank.objects.get(pk=membership_id, rank=admin_profile.rank)
    except OperatorAtRank.DoesNotExist:
        return Response({"detail": "Membership not found for your rank."}, status=404)

    m.status = OperatorAtRank.Status.REJECTED
    m.notes = request.data.get("notes", m.notes)
    m.approved_by = admin_profile
    m.approved_at = timezone.now()
    m.save()
    return Response(OperatorAtRankSerializer(m).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_admin_trip_flags(request):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)

    qs = TripFlag.objects.filter(
        trip__route__departure=admin_profile.rank,
    ).select_related(
        "trip__route__departure", "trip__route__destination",
        "trip__operator__association", "flagged_by",
        "trip__driver__user", "trip__vehicle",
    )

    scope = request.query_params.get("scope", "open")
    if scope == "open":
        qs = qs.filter(status=TripFlag.Status.OPEN)
    # scope == "all" → no filter

    return Response(TripFlagSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_admin_acknowledge_flag(request, flag_id):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    try:
        flag = TripFlag.objects.get(pk=flag_id, trip__route__departure=admin_profile.rank)
    except TripFlag.DoesNotExist:
        return Response({"detail": "Flag not found."}, status=404)

    flag.status = TripFlag.Status.ACKNOWLEDGED
    flag.save()
    return Response(TripFlagSerializer(flag).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_admin_resolve_flag(request, flag_id):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    try:
        flag = TripFlag.objects.get(pk=flag_id, trip__route__departure=admin_profile.rank)
    except TripFlag.DoesNotExist:
        return Response({"detail": "Flag not found."}, status=404)

    flag.status = TripFlag.Status.RESOLVED
    flag.resolved_by = request.user
    flag.resolved_at = timezone.now()
    flag.resolution_notes = request.data.get("notes", "")
    flag.save()
    return Response(TripFlagSerializer(flag).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_admin_cancel_trip(request, trip_id):
    """Admin cancels a trip. Marks all unboarded bookings as cancelled."""
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, route__departure=admin_profile.rank)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found."}, status=404)

    trip.status = Trip.Status.CANCELLED
    trip.save()

    trip.bookings.filter(
        status__in=[Booking.Status.RESERVED, Booking.Status.BOARDED]
    ).update(status=Booking.Status.CANCELLED)

    return Response(TripSerializer(trip).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_admin_me(request):
    """Info about the logged-in admin (which rank they manage)."""
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    return Response({
        "institution_name": admin_profile.institution_name,
        "rank": RankSerializer(admin_profile.rank).data if admin_profile.rank else None,
    })

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_admin_membership_detail(request, membership_id):
    """Full operator details for admin verification."""
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    try:
        m = OperatorAtRank.objects.get(pk=membership_id, rank=admin_profile.rank)
    except OperatorAtRank.DoesNotExist:
        return Response({"detail": "Not found."}, status=404)

    op = m.operator
    u = op.user
    return Response({
        "id": m.id,
        "status": m.status,
        "notes": m.notes,
        "requested_at": m.requested_at,
        "approved_at": m.approved_at,
        "rank": RankSerializer(m.rank).data,
        "operator": {
            "id": op.id,
            "name": f"{u.first_name} {u.last_name}".strip() or u.phone,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "phone": u.phone,
            "email": u.email,
            "association_code": op.association.code,
            "association_name": op.association.association_name,
            "account_created": u.date_joined,
            "membership_count": OperatorAtRank.objects.filter(operator=op).count(),
            "active_memberships": OperatorAtRank.objects.filter(
                operator=op, status=OperatorAtRank.Status.ACTIVE
            ).count(),
            "routes_served": Route.objects.filter(
                trips__operator=op
            ).distinct().count(),
            "trips_operated": Trip.objects.filter(operator=op).count(),
        },
    })

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_admin_rank_trips(request):
    """Trips departing from this admin's rank, ordered by date/time = the queue."""
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)

    qs = Trip.objects.filter(
        route__departure=admin_profile.rank,
    ).select_related(
        "route__departure", "route__destination",
        "operator__association", "vehicle", "driver__user",
    ).order_by("departure_date", "expected_departure_time")

    date_filter = request.query_params.get("date")
    if date_filter:
        qs = qs.filter(departure_date=date_filter)

    return Response(TripSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_admin_schedule_trip(request):
    """Admin schedules a new trip from their rank."""
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)

    route_id = request.data.get("route_id")
    operator_id = request.data.get("operator_id")
    departure_date = request.data.get("departure_date")
    time_str = request.data.get("expected_departure_time")  # "HH:MM" or null
    capacity = request.data.get("seat_capacity", 15)
    driver_id = request.data.get("driver_id")
    vehicle_id = request.data.get("vehicle_id")
    notes = request.data.get("notes", "")

    if not (route_id and operator_id and departure_date):
        return Response(
            {"detail": "route_id, operator_id and departure_date are required."},
            status=400,
        )

    try:
        route = Route.objects.get(pk=route_id, departure=admin_profile.rank)
    except Route.DoesNotExist:
        return Response({"detail": "Route not found or not from your rank."}, status=404)

    try:
        operator = OperatorProfile.objects.get(pk=operator_id)
    except OperatorProfile.DoesNotExist:
        return Response({"detail": "Operator not found."}, status=404)

    # Operator must be active at this rank
    if not OperatorAtRank.objects.filter(
        operator=operator, rank=admin_profile.rank,
        status=OperatorAtRank.Status.ACTIVE,
    ).exists():
        return Response(
            {"detail": "That operator is not active at your rank."}, status=400
        )

    # Optional driver and vehicle
    driver = None
    if driver_id:
        from accounts.models import DriverProfile
        driver = DriverProfile.objects.filter(pk=driver_id).first()

    vehicle = None
    if vehicle_id:
        vehicle = Vehicle.objects.filter(pk=vehicle_id).first()

    # Time parsing
    from datetime import time as dt_time
    parsed_time = None
    if time_str:
        try:
            hh, mm = time_str.split(":")[:2]
            parsed_time = dt_time(int(hh), int(mm))
        except Exception:
            return Response({"detail": "Invalid time format, use HH:MM."}, status=400)

    trip = Trip.objects.create(
        operator=operator,
        route=route,
        departure_date=departure_date,
        expected_departure_time=parsed_time,
        seat_capacity=int(capacity) if capacity else 15,
        driver=driver,
        vehicle=vehicle,
        notes=notes,
        trip_code=_generate_trip_code(route),
    )
    return Response(TripSerializer(trip).data, status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_admin_available_for_rank(request):
    """Data the admin needs to schedule: routes from their rank, active operators,
    active drivers and vehicles."""
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)

    routes = Route.objects.filter(departure=admin_profile.rank, active=True)
    route_data = RouteSerializer(routes, many=True).data

    memberships = OperatorAtRank.objects.filter(
        rank=admin_profile.rank, status=OperatorAtRank.Status.ACTIVE,
    ).select_related("operator__user", "operator__association")
    operator_data = [
        {
            "id": m.operator.id,
            "name": f"{m.operator.user.first_name} {m.operator.user.last_name}".strip()
                    or m.operator.user.phone,
            "association": m.operator.association.association_name,
        }
        for m in memberships
    ]

    from accounts.models import DriverProfile
    drivers = DriverProfile.objects.filter(
        status=DriverProfile.VerificationStatus.VERIFIED
    ).select_related("user")
    driver_data = [
        {
            "id": d.id,
            "name": f"{d.user.first_name} {d.user.last_name}".strip() or d.user.phone,
            "phone": d.user.phone,
        }
        for d in drivers
    ]

    vehicles = Vehicle.objects.filter(roadworthy=True)
    vehicle_data = VehicleSerializer(vehicles, many=True).data

    return Response({
        "routes": route_data,
        "operators": operator_data,
        "drivers": driver_data,
        "vehicles": vehicle_data,
    })

# ---------- Edit trip ----------

@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def api_admin_edit_trip(request, trip_id):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, route__departure=admin_profile.rank)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found."}, status=404)

    from datetime import time as dt_time
    from accounts.models import DriverProfile

    if "route_id" in request.data:
        r = Route.objects.filter(pk=request.data["route_id"], departure=admin_profile.rank).first()
        if not r:
            return Response({"detail": "Route not from your rank."}, status=400)
        trip.route = r
    if "departure_date" in request.data:
        trip.departure_date = request.data["departure_date"]
    if "expected_departure_time" in request.data:
        t = request.data["expected_departure_time"]
        if t:
            try:
                hh, mm = t.split(":")[:2]
                trip.expected_departure_time = dt_time(int(hh), int(mm))
            except Exception:
                return Response({"detail": "Invalid time."}, status=400)
        else:
            trip.expected_departure_time = None
    if "seat_capacity" in request.data:
        trip.seat_capacity = int(request.data["seat_capacity"] or 15)
    if "driver_id" in request.data:
        did = request.data["driver_id"]
        trip.driver = DriverProfile.objects.filter(pk=did).first() if did else None
    if "vehicle_id" in request.data:
        vid = request.data["vehicle_id"]
        trip.vehicle = Vehicle.objects.filter(pk=vid).first() if vid else None
    if "status" in request.data:
        valid = [c[0] for c in Trip.Status.choices]
        if request.data["status"] not in valid:
            return Response({"detail": "Invalid status."}, status=400)
        trip.status = request.data["status"]
    if "notes" in request.data:
        trip.notes = request.data["notes"]

    trip.save()
    return Response(TripSerializer(trip).data)


# ---------- Manage queue ----------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def api_admin_queue(request):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    rank = admin_profile.rank

    if request.method == "GET":
        qs = QueueEntry.objects.filter(rank=rank, active=True).select_related(
            "vehicle", "driver__user", "operator__user",
        )
        return Response([
            {
                "id": e.id,
                "position": e.position,
                "vehicle_id": e.vehicle_id,
                "plate_number": e.vehicle.plate_number,
                "vehicle_label": f"{e.vehicle.make} {e.vehicle.model}".strip(),
                "driver_name": (
                    f"{e.driver.user.first_name} {e.driver.user.last_name}".strip()
                    if e.driver else None
                ),
                "operator_name": (
                    f"{e.operator.user.first_name} {e.operator.user.last_name}".strip()
                    if e.operator else None
                ),
            }
            for e in qs
        ])

    vehicle_id = request.data.get("vehicle_id")
    if not vehicle_id:
        return Response({"detail": "vehicle_id is required."}, status=400)
    vehicle = Vehicle.objects.filter(pk=vehicle_id).first()
    if not vehicle:
        return Response({"detail": "Vehicle not found."}, status=404)

    driver_id = request.data.get("driver_id")
    operator_id = request.data.get("operator_id")
    from accounts.models import DriverProfile
    driver = DriverProfile.objects.filter(pk=driver_id).first() if driver_id else None
    operator = OperatorProfile.objects.filter(pk=operator_id).first() if operator_id else None

    last_pos = QueueEntry.objects.filter(rank=rank, active=True).order_by("-position").first()
    next_pos = (last_pos.position + 1) if last_pos else 1

    entry = QueueEntry.objects.create(
        rank=rank, vehicle=vehicle, driver=driver, operator=operator,
        position=next_pos, added_by=request.user,
    )
    return Response({"id": entry.id, "position": entry.position}, status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_admin_queue_remove(request, entry_id):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    try:
        entry = QueueEntry.objects.get(pk=entry_id, rank=admin_profile.rank)
    except QueueEntry.DoesNotExist:
        return Response({"detail": "Entry not found."}, status=404)

    entry.active = False
    entry.save()

    remaining = QueueEntry.objects.filter(
        rank=admin_profile.rank, active=True,
    ).order_by("position")
    for i, e in enumerate(remaining, start=1):
        if e.position != i:
            e.position = i
            e.save()
    return Response(status=204)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_admin_queue_move(request, entry_id):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)

    direction = request.data.get("direction")
    if direction not in ("up", "down"):
        return Response({"detail": "direction must be 'up' or 'down'."}, status=400)

    try:
        entry = QueueEntry.objects.get(pk=entry_id, rank=admin_profile.rank, active=True)
    except QueueEntry.DoesNotExist:
        return Response({"detail": "Entry not found."}, status=404)

    current_pos = entry.position
    target_pos = current_pos - 1 if direction == "up" else current_pos + 1

    swap = QueueEntry.objects.filter(
        rank=admin_profile.rank, active=True, position=target_pos,
    ).first()
    if not swap:
        return Response({"detail": "Already at boundary."}, status=400)

    entry.position, swap.position = target_pos, current_pos
    entry.save()
    swap.save()
    return Response({"ok": True})


# ---------- Account management ----------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_admin_users(request):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)

    q = request.query_params.get("q", "").strip()
    role = request.query_params.get("role", "").strip()

    qs = User.objects.exclude(is_superuser=True)
    if q:
        qs = qs.filter(
            models.Q(phone__icontains=q) |
            models.Q(first_name__icontains=q) |
            models.Q(last_name__icontains=q)
        )
    if role:
        qs = qs.filter(role=role)

    qs = qs.order_by("-date_joined")[:50]
    return Response([
        {
            "id": u.id,
            "phone": u.phone,
            "name": f"{u.first_name} {u.last_name}".strip() or u.phone,
            "role": u.role,
            "account_status": u.account_status,
            "status_reason": u.status_reason,
            "date_joined": u.date_joined,
            "is_active": u.is_active,
        }
        for u in qs
    ])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_admin_disable_user(request, user_id):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    if admin_profile.user_id == user_id:
        return Response({"detail": "You cannot disable your own account."}, status=400)

    try:
        u = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({"detail": "User not found."}, status=404)

    u.account_status = User.AccountStatus.DISABLED
    u.status_reason = request.data.get("reason", "").strip()
    u.status_changed_at = timezone.now()
    u.status_changed_by = request.user
    u.is_active = False
    u.save()

    from rest_framework.authtoken.models import Token
    Token.objects.filter(user=u).delete()

    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_admin_enable_user(request, user_id):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    try:
        u = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({"detail": "User not found."}, status=404)

    u.account_status = User.AccountStatus.ACTIVE
    u.status_reason = ""
    u.status_changed_at = timezone.now()
    u.status_changed_by = request.user
    u.is_active = True
    u.save()
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_admin_archive_user(request, user_id):
    admin_profile = _get_admin_or_none(request)
    if admin_profile is None:
        return Response({"detail": "Not an admin account."}, status=403)
    if admin_profile.user_id == user_id:
        return Response({"detail": "You cannot archive your own account."}, status=400)
    try:
        u = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({"detail": "User not found."}, status=404)

    u.account_status = User.AccountStatus.ARCHIVED
    u.status_reason = request.data.get("reason", "").strip()
    u.status_changed_at = timezone.now()
    u.status_changed_by = request.user
    u.is_active = False
    u.save()

    from rest_framework.authtoken.models import Token
    Token.objects.filter(user=u).delete()
    return Response({"ok": True})


# ---------- Extended driver info ----------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_admin_driver_detail(request, driver_id):
    admin_profile = _get_admin_or_none(request)
    operator = _get_operator_or_none(request)
    if admin_profile is None and operator is None:
        return Response({"detail": "Admin or operator only."}, status=403)

    from accounts.models import DriverProfile
    try:
        d = DriverProfile.objects.select_related("user", "association").get(pk=driver_id)
    except DriverProfile.DoesNotExist:
        return Response({"detail": "Driver not found."}, status=404)

    u = d.user
    trips = Trip.objects.filter(driver=d)
    trip_count = trips.count()
    completed = trips.filter(status=Trip.Status.COMPLETED).count()

    from .models import Feedback
    feedback = Feedback.objects.filter(trip__driver=d)
    rating_qs = feedback.exclude(rating__isnull=True)
    avg = rating_qs.aggregate(avg=models.Avg("rating"))["avg"]

    vehicles = DriverVehicle.objects.filter(driver=d, active=True).select_related("vehicle")

    return Response({
        "id": d.id,
        "user_id": u.id,
        "name": f"{u.first_name} {u.last_name}".strip() or u.phone,
        "phone": u.phone,
        "email": u.email,
        "license_number": d.license_number,
        "id_number": d.id_number,
        "pdp_number": d.pdp_number,
        "association_name": d.association.association_name if d.association else None,
        "association_code": d.association.code if d.association else None,
        "internal_status": d.status,
        "external_verification_status": d.external_verification_status,
        "external_verification_reason": d.external_verification_reason,
        "account_status": u.account_status,
        "joined": u.date_joined,
        "trip_count": trip_count,
        "completed_trips": completed,
        "rating_avg": round(avg, 2) if avg else None,
        "rating_count": rating_qs.count(),
        "complaints_count": feedback.filter(has_complaint=True).count(),
        "confirmed_incidents": feedback.filter(
            status=Feedback.Status.CONFIRMED_INCIDENT
        ).count(),
        "vehicles": [
            {
                "id": dv.vehicle.id,
                "plate_number": dv.vehicle.plate_number,
                "make": dv.vehicle.make,
                "model": dv.vehicle.model,
                "roadworthy": dv.vehicle.roadworthy,
            }
            for dv in vehicles
        ],
    })