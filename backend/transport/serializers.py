from rest_framework import serializers
from .models import (
    Rank,
    Destination,
    OperatorAtRank,
    Route,
    RouteStop,
    Vehicle,
    Trip,
    Booking,
    VerificationCode,
    TripFlag,
    TripAssetChange,
    VehicleLocation,
    TaxiFareRule,
    PanicAlert,
)


class RankSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rank
        fields = ["id", "name", "area", "latitude", "longitude"]


class DestinationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Destination
        fields = ["id", "name", "area", "latitude", "longitude"]


class RouteSerializer(serializers.ModelSerializer):
    departure = RankSerializer(read_only=True)
    destination = DestinationSerializer(read_only=True)

    class Meta:
        model = Route
        fields = [
            "id",
            "code",
            "name",
            "departure",
            "destination",
            "fare",
            "service_category",
            "typical_duration_minutes",
            "geometry",
            "distance_km",
            "average_speed_kmh",
            "vehicle_class",
            "deviation_threshold_m",
            "active",
        ]


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = [
            "id",
            "plate_number",
            "make",
            "model",
            "seat_capacity",
            "roadworthy",
            "status",
            "notes",
        ]


class VehicleLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleLocation
        fields = [
            "id",
            "vehicle",
            "trip",
            "lat",
            "lng",
            "speed_kmh",
            "heading_deg",
            "accuracy_m",
            "source",
            "recorded_at",
        ]


class TripSerializer(serializers.ModelSerializer):
    route = RouteSerializer(read_only=True)
    operator_name = serializers.CharField(
        source="operator.association.association_name", read_only=True, default=""
    )
    vehicle_plate = serializers.CharField(
        source="vehicle.plate_number", read_only=True, default=None
    )
    driver_name = serializers.SerializerMethodField()
    seats_taken = serializers.IntegerField(read_only=True)
    seats_available = serializers.IntegerField(read_only=True)

    class Meta:
        model = Trip
        fields = [
            "id",
            "trip_code",
            "route",
            "operator_name",
            "departure_date",
            "expected_departure_time",
            "actual_departure_time",
            "estimated_arrival",
            "seat_capacity",
            "seats_taken",
            "seats_available",
            "status",
            "driver_name",
            "vehicle_plate",
            "vehicle_id",
            "engaged_at",
            "notes",
        ]

    def get_driver_name(self, obj):
        if not obj.driver:
            return None
        u = obj.driver.user
        name = f"{u.first_name} {u.last_name}".strip()
        return name or u.phone or u.username


class BookingSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    trip_code = serializers.CharField(source="trip.trip_code", read_only=True)
    verification_code = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id",
            "trip",
            "trip_code",
            "passenger",
            "walk_in_name",
            "walk_in_phone",
            "walk_in_id_number",
            "walk_in_next_of_kin_name",
            "walk_in_next_of_kin_phone",
            "status",
            "fare_paid",
            "booked_at",
            "boarded_at",
            "display_name",
            "verification_code",
        ]
        read_only_fields = ["booked_at", "boarded_at"]

    def get_verification_code(self, obj):
        vc = getattr(obj, "verification_code", None)
        return vc.code if vc else None


class BookingCreateSerializer(serializers.Serializer):
    trip_id = serializers.IntegerField()
    # optional walk-in if not authenticated passenger self-book


class PanicAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = PanicAlert
        fields = [
            "id",
            "trip",
            "booking",
            "latitude",
            "longitude",
            "accuracy_m",
            "payload",
            "created_at",
        ]
        read_only_fields = ["created_at"]
