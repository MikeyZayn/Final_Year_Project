"""
Merged API views: FYP trip/booking/operator + search-first routing/GPS/panic.
"""
import logging
import math

import requests
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import models as dj_models
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.models import DriverProfile, OperatorProfile
from accounts.serializers import UserPublicSerializer

from .models import (
    Announcement,
    Booking,
    Destination,
    DriverComplaint,
    OperatorAtRank,
    PanicAlert,
    Rank,
    Route,
    TaxiFareRule,
    Trip,
    TripAssetChange,
    TripFlag,
    Vehicle,
    VehicleLocation,
    VerificationCode,
    DriverNotification,
)
from .serializers import (
    AnnouncementSerializer,
    BookingSerializer,
    DestinationSerializer,
    DriverComplaintSerializer,
    PanicAlertSerializer,
    RankSerializer,
    RouteSerializer,
    TripSerializer,
    VehicleLocationSerializer,
    VehicleSerializer,
)
from .services.routing_service import get_ad_hoc_route, get_driving_route, RoutingServiceError
from .services.fare_service import estimate_ad_hoc_fare
from .services.deviation import check_deviation


logger = logging.getLogger(__name__)


def _operator(request):
    try:
        return request.user.operator_profile
    except Exception:
        return None


# ---------- Public discovery ----------


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
def api_list_routes(request):
    qs = Route.objects.filter(active=True).select_related("departure", "destination")
    from_q = request.query_params.get("from", "").strip()
    to_q = request.query_params.get("to", "").strip()
    if from_q:
        qs = qs.filter(
            dj_models.Q(departure__name__icontains=from_q)
            | dj_models.Q(departure__area__icontains=from_q)
        )
    if to_q:
        qs = qs.filter(destination__name__icontains=to_q)
    return Response(RouteSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def api_list_trips(request):
    """Upcoming / bookable trips for passengers."""
    today = timezone.localdate()
    qs = (
        Trip.objects.filter(
            departure_date__gte=today,
            status__in=[
                Trip.Status.SCHEDULED,
                Trip.Status.BOARDING,
                Trip.Status.IN_PROGRESS,
            ],
        )
        .select_related(
            "route__departure",
            "route__destination",
            "vehicle",
            "driver__user",
            "operator__association",
        )
        .order_by("departure_date", "expected_departure_time")
    )
    from_q = request.query_params.get("from", "").strip()
    to_q = request.query_params.get("to", "").strip()
    if from_q:
        qs = qs.filter(
            dj_models.Q(route__departure__name__icontains=from_q)
            | dj_models.Q(route__departure__area__icontains=from_q)
        )
    if to_q:
        qs = qs.filter(route__destination__name__icontains=to_q)
    return Response(TripSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def api_trip_detail(request, trip_id):
    try:
        trip = Trip.objects.select_related(
            "route__departure", "route__destination", "vehicle", "driver__user", "operator__association"
        ).get(pk=trip_id)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found."}, status=404)
    return Response(TripSerializer(trip).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_trip_live_tracking(request, trip_id):
    """GET /api/trips/<id>/live/ — trip summary + latest vehicle GPS."""
    try:
        trip = Trip.objects.select_related(
            "route__departure",
            "route__destination",
            "vehicle",
            "driver__user",
            "operator__association",
        ).get(pk=trip_id)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found."}, status=404)

    role = getattr(request.user, "role", "") or ""
    if role == "passenger":
        has = Booking.objects.filter(
            trip=trip,
            passenger=request.user,
            status__in=[Booking.Status.RESERVED, Booking.Status.BOARDED],
        ).exists()
        if not has:
            return Response(
                {"detail": "Book this trip before tracking."}, status=403
            )

    data = TripSerializer(trip).data
    loc = None
    if trip.vehicle_id:
        loc_obj = (
            VehicleLocation.objects.filter(vehicle_id=trip.vehicle_id)
            .order_by("-recorded_at")
            .first()
        )
        if loc_obj:
            loc = VehicleLocationSerializer(loc_obj).data
    data["live_location"] = loc
    data["has_live_location"] = loc is not None
    return Response(data)


# ---------- Passenger booking ----------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_create_booking(request):
    trip_id = request.data.get("trip_id")
    trip_code = (request.data.get("trip_code") or "").strip().upper()

    if not trip_id and not trip_code:
        return Response({"detail": "trip_id or trip_code is required."}, status=400)

    if trip_code:
        trip = (
            Trip.objects.select_related("route")
            .filter(trip_code__iexact=trip_code)
            .first()
        )
        if not trip:
            return Response({"detail": "Invalid trip verification code."}, status=404)
        if trip_id and int(trip_id) != trip.id:
            return Response({"detail": "trip_id does not match trip_code."}, status=400)
    else:
        try:
            trip = Trip.objects.select_related("route").get(pk=trip_id)
        except Trip.DoesNotExist:
            return Response({"detail": "Trip not found."}, status=404)

    if trip.seats_available < 1:
        return Response({"detail": "No seats available."}, status=400)
    if trip.status not in (Trip.Status.SCHEDULED, Trip.Status.BOARDING):
        return Response({"detail": "Trip is not open for booking."}, status=400)

    existing = Booking.objects.filter(
        trip=trip,
        passenger=request.user,
        status__in=[Booking.Status.RESERVED, Booking.Status.BOARDED],
    ).first()
    if existing:
        return Response(BookingSerializer(existing).data)

    booking = Booking.objects.create(
        trip=trip,
        passenger=request.user,
        status=Booking.Status.RESERVED,
        fare_paid=trip.route.fare,
    )
    code = get_random_string(6).upper()
    VerificationCode.objects.create(booking=booking, code=code)

    # Notify assigned driver of ride request (passenger → driver)
    passenger_lat = request.data.get("lat") or request.data.get("passenger_lat")
    passenger_lng = request.data.get("lng") or request.data.get("passenger_lng")
    try:
        plat = float(passenger_lat) if passenger_lat is not None else None
        plng = float(passenger_lng) if passenger_lng is not None else None
    except (TypeError, ValueError):
        plat, plng = None, None

    if trip.driver_id:
        pname = ""
        if request.user:
            pname = (
                f"{request.user.first_name} {request.user.last_name}".strip()
                or request.user.phone
                or request.user.username
            )
        from_name = getattr(getattr(trip.route, "departure", None), "name", "") or ""
        to_name = getattr(getattr(trip.route, "destination", None), "name", "") or ""
        DriverNotification.objects.create(
            driver=trip.driver,
            title="Ride request",
            body=(
                f"{pname or 'Passenger'} requested a seat on {trip.trip_code} "
                f"({from_name} → {to_name}). Code {code}."
            ),
            link_trip=trip,
            link_booking=booking,
            meta={
                "type": "ride_request",
                "trip_id": trip.id,
                "trip_code": trip.trip_code,
                "booking_id": booking.id,
                "passenger_name": pname,
                "passenger_lat": plat,
                "passenger_lng": plng,
            },
        )

    data = BookingSerializer(booking).data
    data["verification_code"] = code
    return Response(data, status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_my_bookings(request):
    """
    Passenger booking list for My bookings UI.
    Each row includes verification_code so the desk can load it into Verify.
    """
    qs = (
        Booking.objects.filter(passenger=request.user)
        .select_related(
            "trip__route__departure",
            "trip__route__destination",
            "verification_code",
        )
        .order_by("-booked_at")
    )
    return Response(BookingSerializer(qs, many=True).data)


# ---------- Operator ----------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_my_trips(request):
    op = _operator(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    qs = (
        Trip.objects.filter(operator=op)
        .select_related(
            "route__departure", "route__destination", "vehicle", "driver__user", "operator__association"
        )
        .order_by("departure_date", "expected_departure_time")
    )
    return Response(TripSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_trip_manifest(request, trip_id):
    op = _operator(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found or not yours."}, status=404)
    data = TripSerializer(trip).data
    data["is_engaged"] = bool(trip.engaged_at or trip.engaged_by_id)
    bookings = trip.bookings.select_related("passenger", "verification_code")
    booked, walk_ins = [], []
    for b in bookings:
        vc = getattr(b, "verification_code", None)
        name = b.display_name()
        entry = {
            "booking_id": b.id,
            "name": name,
            "phone": (b.passenger.phone if b.passenger else b.walk_in_phone) or "",
            "status": b.status,
            "walk_in": b.passenger is None,
            "verification_code": vc.code if vc else None,
            "code_verified": bool(vc and vc.verified_at),
            "next_of_kin_name": b.walk_in_next_of_kin_name or "",
            "next_of_kin_phone": b.walk_in_next_of_kin_phone or "",
        }
        (walk_ins if b.passenger is None else booked).append(entry)
    data["booked_passengers"] = booked
    data["walk_in_passengers"] = walk_ins
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_register_walk_in(request, trip_id):
    op = _operator(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found or not yours."}, status=404)
    if trip.seats_available < 1:
        return Response({"detail": "No seats available."}, status=400)
    name = (request.data.get("name") or "").strip()
    phone = (request.data.get("phone") or "").strip()
    if not name:
        return Response({"detail": "name is required."}, status=400)
    booking = Booking.objects.create(
        trip=trip,
        walk_in_name=name,
        walk_in_phone=phone,
        walk_in_id_number=request.data.get("id_number", ""),
        walk_in_next_of_kin_name=request.data.get("next_of_kin_name", ""),
        walk_in_next_of_kin_phone=request.data.get("next_of_kin_phone", ""),
        status=Booking.Status.RESERVED,
        fare_paid=trip.route.fare,
    )
    code = get_random_string(6).upper()
    VerificationCode.objects.create(booking=booking, code=code)
    data = BookingSerializer(booking).data
    data["verification_code"] = code
    return Response(data, status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_engage_trip(request, trip_id):
    op = _operator(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found or not yours."}, status=404)
    trip.engaged_by = op
    trip.engaged_at = timezone.now()
    if trip.status == Trip.Status.SCHEDULED:
        trip.status = Trip.Status.BOARDING
    trip.save()
    return Response(TripSerializer(trip).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_release_trip(request, trip_id):
    op = _operator(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found or not yours."}, status=404)
    trip.engaged_by = None
    trip.engaged_at = None
    trip.save(update_fields=["engaged_by", "engaged_at"])
    return Response(TripSerializer(trip).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_verify_booking(request, trip_id, booking_id):
    op = _operator(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
        booking = Booking.objects.get(pk=booking_id, trip=trip)
    except (Trip.DoesNotExist, Booking.DoesNotExist):
        return Response({"detail": "Not found."}, status=404)
    code = (request.data.get("code") or "").strip().upper()
    vc = getattr(booking, "verification_code", None)
    if vc and code and vc.code.upper() != code:
        return Response({"detail": "Invalid verification code."}, status=400)
    booking.status = Booking.Status.BOARDED
    booking.boarded_at = timezone.now()
    booking.boarded_by = request.user
    booking.save()
    if vc and not vc.verified_at:
        vc.verified_at = timezone.now()
        vc.save(update_fields=["verified_at"])
    return Response(BookingSerializer(booking).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_my_memberships(request):
    op = _operator(request)
    if not op:
        return Response({"detail": "Not an operator account."}, status=403)
    qs = OperatorAtRank.objects.filter(operator=op).select_related("rank")
    data = [
        {
            "id": m.id,
            "status": m.status,
            "notes": getattr(m, "notes", "") or "",
            "rank": RankSerializer(m.rank).data,
        }
        for m in qs
    ]
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_request_rank(request):
    op = _operator(request)
    if not op:
        return Response({"detail": "Not an operator account."}, status=403)
    rank_id = request.data.get("rank_id")
    notes = (request.data.get("notes") or "")[:500]
    try:
        rank = Rank.objects.get(pk=rank_id)
    except Rank.DoesNotExist:
        return Response({"detail": "Rank not found."}, status=404)
    if OperatorAtRank.objects.filter(operator=op, rank=rank).exists():
        return Response({"detail": "Already requested or member of this rank."}, status=400)
    m = OperatorAtRank.objects.create(
        operator=op,
        rank=rank,
        status=OperatorAtRank.Status.PENDING,
        notes=notes,
    )
    return Response(
        {"id": m.id, "status": m.status, "rank": RankSerializer(rank).data, "notes": notes},
        status=201,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_flag_trip(request, trip_id):
    op = _operator(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)
    try:
        trip = Trip.objects.get(pk=trip_id, operator=op)
    except Trip.DoesNotExist:
        return Response({"detail": "Trip not found or not yours."}, status=404)
    flag = TripFlag.objects.create(
        trip=trip,
        category=request.data.get("category", TripFlag.Category.OTHER),
        description=request.data.get("description", ""),
        flagged_by=request.user,
    )
    trip.status = Trip.Status.FLAGGED
    trip.save(update_fields=["status"])
    return Response({"id": flag.id, "status": flag.status}, status=201)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def api_announcements(request):
    """Manage operator/admin announcements."""
    if request.user.role not in {"operator", "admin"}:
        return Response({"detail": "Operators and admins only."}, status=403)

    if request.method == "GET":
        qs = Announcement.objects.filter(is_active=True).select_related("created_by")
        if request.user.role == "operator":
            qs = qs.filter(audience__in=[Announcement.Audience.ALL, Announcement.Audience.OPERATORS])
        return Response(AnnouncementSerializer(qs, many=True).data)

    title = (request.data.get("title") or "").strip()
    message = (request.data.get("message") or "").strip()
    if not title or not message:
        return Response({"detail": "title and message are required."}, status=400)

    audience = request.data.get("audience") or Announcement.Audience.ALL
    announcement = Announcement.objects.create(
        created_by=request.user,
        title=title,
        message=message,
        audience=audience,
        is_active=True,
    )
    return Response(AnnouncementSerializer(announcement).data, status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_operator_drivers(request):
    op = _operator(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)

    drivers = (
        DriverProfile.objects.filter(association=op.association)
        .select_related("user", "association")
        .order_by("user__last_name", "user__first_name")
    )
    data = []
    for driver in drivers:
        trips = Trip.objects.filter(driver=driver).select_related(
            "route__departure",
            "route__destination",
            "vehicle",
        ).order_by("-departure_date")[:5]
        data.append(
            {
                "id": driver.id,
                "user": UserPublicSerializer(driver.user).data,
                "license_number": driver.license_number,
                "id_number": driver.id_number,
                "status": driver.status,
                "verified_at": driver.verified_at,
                "association": {
                    "id": driver.association.id if driver.association else None,
                    "association_name": driver.association.association_name if driver.association else None,
                    "operating_region": driver.association.operating_region if driver.association else None,
                },
                "trip_count": Trip.objects.filter(driver=driver).count(),
                "recent_trips": TripSerializer(trips, many=True).data,
            }
        )
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_operator_complaints(request):
    op = _operator(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)

    driver_ids = DriverProfile.objects.filter(association=op.association).values_list("id", flat=True)
    complaints = (
        DriverComplaint.objects.filter(driver_id__in=driver_ids)
        .select_related("driver__user", "trip__route__departure", "trip__route__destination", "raised_by")
        .order_by("-created_at")
    )
    return Response(DriverComplaintSerializer(complaints, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_resolve_driver_complaint(request, complaint_id):
    op = _operator(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)

    try:
        complaint = DriverComplaint.objects.select_related("driver__user").get(
            pk=complaint_id,
            driver__association=op.association,
        )
    except DriverComplaint.DoesNotExist:
        return Response({"detail": "Complaint not found for this association."}, status=404)

    status = (request.data.get("status") or complaint.status).strip().lower()
    if status not in {choice[0] for choice in DriverComplaint.Status.choices}:
        return Response({"detail": "Invalid complaint status."}, status=400)

    complaint.status = status
    complaint.save(update_fields=["status"])
    return Response(DriverComplaintSerializer(complaint).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_operator_driver_detail(request, driver_id):
    op = _operator(request)
    if op is None:
        return Response({"detail": "Not an operator account."}, status=403)

    try:
        driver = DriverProfile.objects.select_related("user", "association").get(
            pk=driver_id,
            association=op.association,
        )
    except DriverProfile.DoesNotExist:
        return Response({"detail": "Driver not found for this association."}, status=404)

    trips = Trip.objects.filter(driver=driver).select_related(
        "route__departure",
        "route__destination",
        "vehicle",
    ).order_by("-departure_date")

    return Response(
        {
            "id": driver.id,
            "user": UserPublicSerializer(driver.user).data,
            "license_number": driver.license_number,
            "id_number": driver.id_number,
            "status": driver.status,
            "verified_at": driver.verified_at,
            "association": {
                "id": driver.association.id if driver.association else None,
                "association_name": driver.association.association_name if driver.association else None,
                "operating_region": driver.association.operating_region if driver.association else None,
            },
            "trip_count": trips.count(),
            "recent_trips": TripSerializer(trips[:10], many=True).data,
        }
    )


# ---------- Driver ----------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_my_vehicle(request):
    try:
        dp = request.user.driver_profile
    except Exception:
        return Response({"detail": "Not a driver account."}, status=403)
    assignment = (
        dp.vehicle_assignments.filter(active=True).select_related("vehicle").first()
    )
    if assignment:
        return Response(VehicleSerializer(assignment.vehicle).data)
    trip = (
        Trip.objects.filter(driver=dp, status=Trip.Status.IN_PROGRESS)
        .select_related("vehicle")
        .first()
    )
    if trip and trip.vehicle:
        return Response(VehicleSerializer(trip.vehicle).data)
    return Response({"detail": "No vehicle assigned."}, status=404)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_driver_my_trips(request):
    if getattr(request.user, "role", None) != "driver":
        return Response({"detail": "Drivers only."}, status=403)
    try:
        dp = request.user.driver_profile
    except Exception:
        return Response({"detail": "No driver profile."}, status=404)
    qs = (
        Trip.objects.filter(driver=dp)
        .select_related(
            "route__departure", "route__destination", "vehicle", "driver__user"
        )
        .prefetch_related("route__stops")
        .order_by("-departure_date", "-expected_departure_time")
    )
    return Response(TripSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_driver_confirm_trip(request):
    if getattr(request.user, "role", None) != "driver":
        return Response({"detail": "Drivers only."}, status=403)
    try:
        dp = request.user.driver_profile
    except Exception:
        return Response({"detail": "No driver profile."}, status=404)

    code = (
        request.data.get("trip_code") or request.data.get("code") or ""
    ).strip().upper()
    if not code:
        return Response({"detail": "trip_code is required."}, status=400)

    trip = (
        Trip.objects.filter(trip_code__iexact=code)
        .select_related("route__departure", "route__destination", "vehicle")
        .prefetch_related("route__stops")
        .first()
    )
    if not trip:
        return Response({"detail": "Invalid trip code."}, status=404)
    if trip.driver_id and trip.driver_id != dp.id:
        return Response(
            {"detail": "Trip already assigned to another driver."}, status=403
        )
    if trip.driver_id is None:
        trip.driver = dp
        trip.save(update_fields=["driver"])

    return Response(TripSerializer(trip).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_driver_profile(request):
    if getattr(request.user, "role", None) != "driver":
        return Response({"detail": "Drivers only."}, status=403)
    try:
        dp = request.user.driver_profile
    except Exception:
        return Response({"detail": "No driver profile."}, status=404)

    ratings = dp.ratings.all()
    avg = ratings.aggregate(dj_models.Avg("score"))["score__avg"]

    return Response(
        {
            "user": UserPublicSerializer(request.user).data,
            "license_number": dp.license_number,
            "status": dp.status,
            "rating_avg": round(avg, 2) if avg is not None else None,
            "rating_count": ratings.count(),
            "complaint_count": dp.complaints.count(),
            "open_complaints": dp.complaints.filter(status="open").count(),
            "trips": TripSerializer(
                Trip.objects.filter(driver=dp)
                .select_related(
                    "route__departure",
                    "route__destination",
                    "vehicle",
                )
                .prefetch_related("route__stops")
                .order_by("-departure_date")[:20],
                many=True,
            ).data,
            "notifications": [
                {
                    "id": n.id,
                    "title": n.title,
                    "body": n.body,
                    "read": n.read,
                    "created_at": n.created_at,
                    "trip_id": n.link_trip_id,
                    "booking_id": n.link_booking_id,
                    "meta": n.meta or {},
                }
                for n in dp.notifications.order_by("-created_at")[:30]
            ],
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_driver_notification_read(request, notification_id):
    if getattr(request.user, "role", None) != "driver":
        return Response({"detail": "Drivers only."}, status=403)
    try:
        dp = request.user.driver_profile
    except Exception:
        return Response({"detail": "No driver profile."}, status=404)
    try:
        n = dp.notifications.get(pk=notification_id)
    except DriverNotification.DoesNotExist:
        return Response({"detail": "Notification not found."}, status=404)
    if not n.read:
        n.read = True
        n.save(update_fields=["read"])
    return Response({"id": n.id, "read": n.read})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_driver_notifications_read_all(request):
    if getattr(request.user, "role", None) != "driver":
        return Response({"detail": "Drivers only."}, status=403)
    try:
        dp = request.user.driver_profile
    except Exception:
        return Response({"detail": "No driver profile."}, status=404)
    updated = dp.notifications.filter(read=False).update(read=True)
    return Response({"updated": updated})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_vehicle_location(request, vehicle_id):
    try:
        vehicle = Vehicle.objects.get(pk=vehicle_id)
    except Vehicle.DoesNotExist:
        return Response({"detail": "Vehicle not found."}, status=404)

    allowed = False
    if getattr(request.user, "role", None) == "admin":
        allowed = True
    elif getattr(request.user, "role", None) == "operator":
        op = _operator(request)
        allowed = op is not None and Trip.objects.filter(
            operator=op, vehicle=vehicle
        ).exists()
    elif getattr(request.user, "role", None) == "driver":
        try:
            dp = request.user.driver_profile
            allowed = dp.vehicle_assignments.filter(
                vehicle=vehicle, active=True
            ).exists() or Trip.objects.filter(
                driver=dp, vehicle=vehicle, status__in=[
                    Trip.Status.BOARDING, Trip.Status.IN_PROGRESS
                ]
            ).exists()
        except Exception:
            allowed = False
    if not allowed:
        return Response({"detail": "Not allowed to update this vehicle."}, status=403)

    try:
        lat = float(request.data["lat"])
        lng = float(request.data["lng"])
    except (KeyError, TypeError, ValueError):
        return Response({"detail": "lat and lng required as numbers."}, status=400)

    source = request.data.get("source", VehicleLocation.Source.GPS)
    if source == VehicleLocation.Source.SIMULATED:
        return Response({"detail": "Simulated GPS is disabled."}, status=400)

    trip_id = request.data.get("trip_id")
    trip = None
    if trip_id:
        trip = (
            Trip.objects.filter(pk=trip_id, vehicle=vehicle)
            .select_related("route")
            .first()
        )
    if trip is None:
        trip = (
            Trip.objects.filter(
                vehicle=vehicle,
                status__in=[Trip.Status.BOARDING, Trip.Status.IN_PROGRESS],
            )
            .select_related("route")
            .order_by("-engaged_at")
            .first()
        )

    loc = VehicleLocation.objects.create(
        vehicle=vehicle,
        trip=trip,
        lat=lat,
        lng=lng,
        speed_kmh=request.data.get("speed_kmh"),
        heading_deg=float(request.data.get("heading_deg") or 0),
        accuracy_m=float(request.data.get("accuracy_m") or 0),
        source=source,
    )

    route_status = "unknown"
    distance_from_route_m = None
    if trip and trip.route:
        dev = check_deviation(lat, lng, trip.route)
        route_status = dev.status
        distance_from_route_m = dev.distance_m

    if trip and trip.status == Trip.Status.BOARDING:
        trip.status = Trip.Status.IN_PROGRESS
        trip.actual_departure_time = timezone.now()
        trip.save(update_fields=["status", "actual_departure_time"])

    payload = {
        "vehicle_id": vehicle.id,
        "trip_id": trip.id if trip else None,
        "lat": lat,
        "lng": lng,
        "speed_kmh": loc.speed_kmh,
        "heading_deg": loc.heading_deg,
        "accuracy_m": loc.accuracy_m,
        "source": loc.source,
        "route_status": route_status,
        "distance_from_route_m": distance_from_route_m,
        "recorded_at": loc.recorded_at.isoformat(),
    }

    channel_layer = get_channel_layer()
    if channel_layer is not None:
        try:
            async_to_sync(channel_layer.group_send)(
                "fleet_tracking",
                {"type": "fleet.update", "payload": payload},
            )
            if trip:
                async_to_sync(channel_layer.group_send)(
                    f"trip_{trip.id}",
                    {"type": "trip.location", "payload": payload},
                )
        except Exception as exc:
            logger.warning("WS broadcast failed: %s", exc)

    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_vehicle_latest_location(request, vehicle_id):
    loc = (
        VehicleLocation.objects.filter(vehicle_id=vehicle_id)
        .order_by("-recorded_at")
        .first()
    )
    if not loc:
        return Response({"detail": "No location yet."}, status=404)
    return Response(VehicleLocationSerializer(loc).data)


# ---------- Routing ----------


@api_view(["POST"])
@permission_classes([AllowAny])
def api_ad_hoc_directions(request):
    data = request.data or {}
    origin_raw = data.get("origin") or {}
    dest_raw = data.get("destination") or {}

    def _pair(raw):
        if not isinstance(raw, dict):
            return None
        lat = raw.get("lat", raw.get("latitude"))
        lng = raw.get("lng", raw.get("longitude"))
        try:
            return (float(lat), float(lng))
        except (TypeError, ValueError):
            return None

    origin = _pair(origin_raw)
    destination = _pair(dest_raw)
    if not origin or not destination:
        return Response(
            {"error": "origin and destination with lat/lng are required."},
            status=400,
        )

    try:
        directions = get_ad_hoc_route(origin, destination)
    except RoutingServiceError as exc:
        return Response({"error": str(exc)}, status=502)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Routing failed")
        return Response({"error": f"Routing unavailable: {exc}"}, status=502)

    fare, notice = estimate_ad_hoc_fare(directions["distance_km"])
    return Response(
        {
            "geometry": directions["geometry"],
            "distance_km": directions["distance_km"],
            "duration_min": directions["duration_min"],
            "source": directions["source"],
            "fare": fare,
            "fare_notice": notice,
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def api_calculate_route_fare(request):
    try:
        distance_km = float(request.data.get("distanceKm") or request.data["distance_km"])
    except (KeyError, TypeError, ValueError):
        return Response({"error": "distance_km required."}, status=400)
    fare, notice = estimate_ad_hoc_fare(distance_km)
    return Response(
        {
            "fare": fare,
            "notice": notice,
            "fare_notice": notice,
            "distance_km": distance_km,
            "estimated_fare": fare,
        }
    )


# ---------- Panic ----------


@api_view(["POST"])
@permission_classes([AllowAny])
def api_panic_alert(request):
    data = dict(request.data) if hasattr(request.data, "dict") else (request.data or {})
    alert = PanicAlert.objects.create(
        user=request.user if request.user.is_authenticated else None,
        trip_id=data.get("tripId") or data.get("trip_id"),
        booking_id=data.get("bookingId") or data.get("booking_id"),
        latitude=data.get("latitude"),
        longitude=data.get("longitude"),
        accuracy_m=data.get("accuracy"),
        payload=data,
    )
    channel_layer = get_channel_layer()
    if channel_layer is not None:
        try:
            async_to_sync(channel_layer.group_send)(
                "fleet_tracking",
                {"type": "panic.alert", "payload": PanicAlertSerializer(alert).data},
            )
        except Exception as exc:
            logger.warning("Panic broadcast failed: %s", exc)
    return Response({"id": alert.id, "status": "received"}, status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_fleet_snapshot(request):
    if getattr(request.user, "role", None) not in ("operator", "admin"):
        return Response({"detail": "Operators and admins only."}, status=403)
    vehicles = Vehicle.objects.all()
    out = []
    for v in vehicles:
        loc = v.locations.order_by("-recorded_at").first()
        if not loc:
            continue
        out.append(
            {
                "vehicle": VehicleSerializer(v).data,
                "location": VehicleLocationSerializer(loc).data,
            }
        )
    return Response(out)