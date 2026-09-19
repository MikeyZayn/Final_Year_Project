from django.db import models
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import Rank, DeparturePoint, Destination, Route
from .serializers import (
    RankSerializer,
    RouteSerializer,
    DeparturePointSerializer,
    DestinationSerializer,
)

@api_view(["GET"])
@permission_classes([AllowAny])
def api_list_routes(request):
    """
    List active routes, optionally filtered by partial departure/destination name.
    Example: /transport/api/routes/?from=Empangeni&to=Durban
    """
    qs = (
        Route.objects.filter(
            active=True,
            departure_point__status=DeparturePoint.Status.ACTIVE,
        )
        .select_related(
            "departure_point", "destination", "operator__association",
            "departure_point__rank",
        )
    )

    from_q = request.query_params.get("from", "").strip()
    to_q = request.query_params.get("to", "").strip()

    if from_q:
        qs = qs.filter(
            models.Q(departure_point__name__icontains=from_q) |
            models.Q(departure_point__rank__name__icontains=from_q) |
            models.Q(departure_point__rank__area__icontains=from_q)
        )
    if to_q:
        qs = qs.filter(destination__name__icontains=to_q)

    return Response(RouteSerializer(qs, many=True).data)    


# ---------- Rank picker ----------

@api_view(["GET"])
@permission_classes([AllowAny])
def api_list_ranks(request):
    return Response(RankSerializer(Rank.objects.all(), many=True).data)


# ---------- Operator's own data ----------

def _get_operator_or_none(request):
    try:
        return request.user.operator_profile
    except Exception:
        return None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_my_departure_points(request):
    operator = _get_operator_or_none(request)
    if operator is None:
        return Response({"detail": "Not an operator account."}, status=403)
    qs = DeparturePoint.objects.filter(operator=operator).select_related("rank")
    return Response(DeparturePointSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_request_rank(request):
    """Operator requests a rank. Creates a pending DeparturePoint for admin review."""
    operator = _get_operator_or_none(request)
    if operator is None:
        return Response({"detail": "Not an operator account."}, status=403)

    rank_id = request.data.get("rank_id")
    notes = request.data.get("notes", "").strip()

    if not rank_id:
        return Response({"detail": "rank_id is required."}, status=400)

    try:
        rank = Rank.objects.get(pk=rank_id)
    except Rank.DoesNotExist:
        return Response({"detail": "Rank not found."}, status=404)

    if DeparturePoint.objects.filter(operator=operator, rank=rank).exists():
        return Response(
            {"detail": "You already have a departure point at that rank."},
            status=400,
        )

    dp = DeparturePoint.objects.create(
        operator=operator,
        rank=rank,
        status=DeparturePoint.Status.PENDING,
        notes=notes,
    )
    return Response(DeparturePointSerializer(dp).data, status=201)


# ---------- Operator's own routes ----------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def api_my_routes(request):
    operator = _get_operator_or_none(request)
    if operator is None:
        return Response({"detail": "Not an operator account."}, status=403)

    if request.method == "GET":
        qs = Route.objects.filter(operator=operator).select_related(
            "departure_point__rank", "destination",
        )
        return Response(RouteSerializer(qs, many=True).data)

    # POST — create route
    dp_id = request.data.get("departure_point_id")
    dest_id = request.data.get("destination_id")
    fare = request.data.get("fare")
    category = request.data.get("service_category", "structured")
    duration = request.data.get("typical_duration_minutes") or None

    if not (dp_id and dest_id and fare):
        return Response(
            {"detail": "departure_point_id, destination_id and fare are required."},
            status=400,
        )

    try:
        dp = DeparturePoint.objects.get(pk=dp_id, operator=operator)
    except DeparturePoint.DoesNotExist:
        return Response({"detail": "Departure point not found or not yours."}, status=404)

    if dp.status != DeparturePoint.Status.ACTIVE:
        return Response(
            {"detail": "You can only create routes from an approved departure point."},
            status=403,
        )

    try:
        dest = Destination.objects.get(pk=dest_id)
    except Destination.DoesNotExist:
        return Response({"detail": "Destination not found."}, status=404)

    route = Route.objects.create(
        operator=operator,
        departure_point=dp,
        destination=dest,
        fare=fare,
        service_category=category,
        typical_duration_minutes=duration,
        active=True,
    )
    return Response(RouteSerializer(route).data, status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def api_my_route_detail(request, route_id):
    operator = _get_operator_or_none(request)
    if operator is None:
        return Response({"detail": "Not an operator account."}, status=403)

    try:
        route = Route.objects.get(pk=route_id, operator=operator)
    except Route.DoesNotExist:
        return Response({"detail": "Route not found."}, status=404)

    if request.method == "DELETE":
        route.active = False
        route.save()
        return Response(status=204)

    # PATCH
    for field in ["fare", "service_category", "typical_duration_minutes", "active"]:
        if field in request.data:
            setattr(route, field, request.data[field])

    if "destination_id" in request.data:
        try:
            route.destination = Destination.objects.get(pk=request.data["destination_id"])
        except Destination.DoesNotExist:
            return Response({"detail": "Destination not found."}, status=404)

    route.save()
    return Response(RouteSerializer(route).data)


# ---------- Public: destinations ----------

@api_view(["GET"])
@permission_classes([AllowAny])
def api_list_destinations(request):
    return Response(DestinationSerializer(Destination.objects.all(), many=True).data)