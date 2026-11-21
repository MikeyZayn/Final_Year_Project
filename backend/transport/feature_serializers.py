from rest_framework import serializers


class CompanionSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, trim_whitespace=True)
    last_name = serializers.CharField(max_length=150, trim_whitespace=True)


class GroupBookingRequestSerializer(serializers.Serializer):
    trip_id = serializers.IntegerField(min_value=1, required=False)
    companions = CompanionSerializer(many=True, required=False, max_length=50)
    payment_method = serializers.ChoiceField(choices=["card", "cash", "pass"])
    card_token = serializers.ChoiceField(choices=["demo_visa", "demo_mastercard", "demo_declined"], required=False)

    def validate(self, attrs):
        if set(self.initial_data) - set(self.fields):
            raise serializers.ValidationError({"detail": "Submit a demo token without card details."})
        token = attrs.get("card_token")
        if attrs["payment_method"] == "card":
            if not token:
                raise serializers.ValidationError({"card_token": "Choose a demo card."})
            if token == "demo_declined":
                raise serializers.ValidationError({"detail": "The demo card was declined. No seat or payment was recorded."})
        elif token:
            raise serializers.ValidationError({"card_token": "This payment method does not use a card token."})
        return attrs


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
