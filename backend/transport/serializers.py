from rest_framework import serializers
from .models import (
    Rank, Destination, OperatorAtRank, Route,
    Vehicle, DriverVehicle, Trip, Booking, VerificationCode, TripFlag,
)


class RankSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rank
        fields = ["id", "name", "area", "latitude", "longitude"]


class DestinationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Destination
        fields = ["id", "name", "area", "latitude", "longitude"]


class OperatorAtRankSerializer(serializers.ModelSerializer):
    rank = RankSerializer(read_only=True)
    operator_id = serializers.IntegerField(source="operator.id", read_only=True)
    operator_name = serializers.CharField(
        source="operator.association.association_name", read_only=True
    )

    class Meta:
        model = OperatorAtRank
        fields = ["id", "operator_id", "operator_name", "rank", "status", "notes"]


class RouteSerializer(serializers.ModelSerializer):
    departure = RankSerializer(read_only=True)
    destination = DestinationSerializer(read_only=True)
    fare = serializers.DecimalField(max_digits=8, decimal_places=2)

    class Meta:
        model = Route
        fields = [
            "id", "departure", "destination", "fare",
            "service_category", "typical_duration_minutes", "active",
        ]


class RouteWriteSerializer(serializers.ModelSerializer):
    departure_id = serializers.PrimaryKeyRelatedField(
        queryset=Rank.objects.all(), source="departure"
    )
    destination_id = serializers.PrimaryKeyRelatedField(
        queryset=Destination.objects.all(), source="destination"
    )

    class Meta:
        model = Route
        fields = [
            "departure_id", "destination_id", "fare",
            "service_category", "typical_duration_minutes",
        ]


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = ["id", "plate_number", "make", "model",
                  "seat_capacity", "roadworthy", "notes"]


class TripSerializer(serializers.ModelSerializer):
    route = RouteSerializer(read_only=True)
    operator_name = serializers.CharField(
        source="operator.association.association_name", read_only=True
    )
    driver_name = serializers.SerializerMethodField()
    vehicle_plate = serializers.CharField(source="vehicle.plate_number", read_only=True)
    seats_taken = serializers.IntegerField(read_only=True)
    seats_available = serializers.IntegerField(read_only=True)

    class Meta:
        model = Trip
        fields = [
            "id", "trip_code", "operator_name",
            "route", "departure_date", "expected_departure_time",
            "actual_departure_time", "seat_capacity", "seats_taken",
            "seats_available", "status", "driver_name", "vehicle_plate",
            "notes", "created_at",
        ]

    def get_driver_name(self, obj):
        if not obj.driver:
            return None
        u = obj.driver.user
        return f"{u.first_name} {u.last_name}".strip() or u.phone


class TripWriteSerializer(serializers.ModelSerializer):
    route_id = serializers.PrimaryKeyRelatedField(
        queryset=Route.objects.all(), source="route"
    )
    operator_id = serializers.PrimaryKeyRelatedField(
        queryset=__import__("accounts.models", fromlist=["OperatorProfile"]).OperatorProfile.objects.all(),
        source="operator",
    )
    driver_id = serializers.IntegerField(required=False, allow_null=True)
    vehicle_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = Trip
        fields = [
            "route_id", "operator_id", "departure_date",
            "expected_departure_time", "seat_capacity",
            "driver_id", "vehicle_id", "notes",
        ]

    def create(self, validated):
        from accounts.models import DriverProfile
        from .models import Vehicle

        driver_id = validated.pop("driver_id", None)
        vehicle_id = validated.pop("vehicle_id", None)
        driver = DriverProfile.objects.filter(pk=driver_id).first() if driver_id else None
        vehicle = Vehicle.objects.filter(pk=vehicle_id).first() if vehicle_id else None

        trip = Trip.objects.create(driver=driver, vehicle=vehicle, **validated)
        return trip


class BookingSerializer(serializers.ModelSerializer):
    trip_code = serializers.CharField(source="trip.trip_code", read_only=True)
    route_label = serializers.SerializerMethodField()
    departure_date = serializers.DateField(source="trip.departure_date", read_only=True)
    passenger_name = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id", "trip", "trip_code", "route_label",
            "departure_date", "status", "booked_at",
            "passenger_name", "walk_in_name", "walk_in_phone",
        ]
        read_only_fields = ["status", "booked_at"]

    def get_route_label(self, obj):
        return f"{obj.trip.route.departure.name} → {obj.trip.route.destination.name}"

    def get_passenger_name(self, obj):
        return obj.display_name()


class VerificationCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = VerificationCode
        fields = ["id", "code", "issued_at", "verified_at"]


class TripFlagSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    flagged_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TripFlag
        fields = [
            "id", "trip", "category", "category_label",
            "notes", "status", "status_label",
            "flagged_by_name", "flagged_at",
        ]

    def get_flagged_by_name(self, obj):
        if not obj.flagged_by:
            return "Unknown"
        u = obj.flagged_by
        return f"{u.first_name} {u.last_name}".strip() or u.phone