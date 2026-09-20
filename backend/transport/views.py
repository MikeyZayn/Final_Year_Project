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
    Vehicle, Trip, Booking, VerificationCode, TripFlag,
)
from .serializers import (
    RankSerializer, DestinationSerializer, OperatorAtRankSerializer,
    RouteSerializer, RouteWriteSerializer, VehicleSerializer,
    TripSerializer, TripWriteSerializer, BookingSerializer,
    VerificationCodeSerializer, TripFlagSerializer,
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
    """Upcoming trips. Public discovery for passengers."""
    today = timezone.now().date()
    qs = Trip.objects.filter(
        status__in=[Trip.Status.SCHEDULED, Trip.Status.BOARDING],
        departure_date__gte=today,
    ).select_related(
        "route__departure", "route__destination",
        "operator__association", "vehicle",
    ).order_by("departure_date", "expected_departure_time")
    route_id = request.query_params.get("route")
    if route_id:
        qs = qs.filter(route_id=route_id)
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
    manifest = []
    for b in bookings:
        entry = {
            "booking_id": b.id,
            "name": b.display_name(),
            "phone": b.passenger.phone if b.passenger else b.walk_in_phone,
            "status": b.status,
            "booked_at": b.booked_at,
            "walk_in": b.passenger is None,
        }
        vc = getattr(b, "verification_code", None)
        entry["verification_code"] = vc.code if vc else None
        entry["code_verified"] = bool(vc and vc.verified_at)
        manifest.append(entry)
    data["manifest"] = manifest
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