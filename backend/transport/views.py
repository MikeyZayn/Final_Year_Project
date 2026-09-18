from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.db import models
from .models import Route
from .serializers import RouteSerializer


@api_view(["GET"])
@permission_classes([AllowAny])
def api_list_routes(request):
    """
    List active routes, optionally filtered by partial departure/destination name.
    Example: /transport/api/routes/?from=Empangeni&to=Durban
    """
    qs = (
        Route.objects.filter(active=True)
        .select_related("departure_point", "destination", "operator__association",
                        "departure_point__rank")
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