from rest_framework import serializers

class CompanionSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, trim_whitespace=True)
    last_name = serializers.CharField(max_length=150, trim_whitespace=True)

class GroupBookingRequestSerializer(serializers.Serializer):
    trip_id = serializers.IntegerField(min_value=1)
    companions = CompanionSerializer(many=True, required=False, max_length=50)

class FiniteFloatField(serializers.FloatField):
    def to_internal_value(self, data):
        import math
        value = super().to_internal_value(data)
        if not math.isfinite(value):
            raise serializers.ValidationError("A finite coordinate is required.")
        return value

class CoordinateSerializer(serializers.Serializer):
    lat = FiniteFloatField(min_value=-90, max_value=90)
    lng = FiniteFloatField(min_value=-180, max_value=180)

class RoutingRequestSerializer(serializers.Serializer):
    origin = CoordinateSerializer()
    destination = CoordinateSerializer()
