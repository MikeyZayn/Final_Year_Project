from rest_framework import serializers
from .models import Rank, Destination, DeparturePoint, Route

class RankSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rank
        fields = ["id", "name", "area", "latitude", "longitude"]


class DestinationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Destination
        fields = ["id", "name", "area", "latitude", "longitude"]


class DeparturePointSerializer(serializers.ModelSerializer):
    rank = RankSerializer(read_only=True)

    class Meta:
        model = DeparturePoint
        fields = ["id", "name", "area", "latitude", "longitude", "rank"]

class RouteSerializer(serializers.ModelSerializer):
    departure_point = DeparturePointSerializer(read_only=True)
    destination = DestinationSerializer(read_only=True)
    operator_name = serializers.CharField(
        source="operator.association.association_name", read_only=True
    )
    fare = serializers.DecimalField(max_digits=8, decimal_places=2)

    class Meta:
        model = Route
        fields = [
            "id",
            "operator_name",
            "departure_point",
            "destination",
            "fare",
            "service_category",
            "typical_duration_minutes",
            "active",
        ]