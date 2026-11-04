from rest_framework import serializers


class CompanionSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, trim_whitespace=True)
    last_name = serializers.CharField(max_length=150, trim_whitespace=True)


class GroupBookingRequestSerializer(serializers.Serializer):
    trip_id = serializers.IntegerField(min_value=1, required=False)
    companions = CompanionSerializer(many=True, required=False, max_length=50)
    payment_method = serializers.ChoiceField(choices=["card", "cash"])
    card_holder_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True, default=""
    )
    card_number = serializers.CharField(
        max_length=19, required=False, allow_blank=True, default=""
    )
    card_expiry = serializers.CharField(
        max_length=7, required=False, allow_blank=True, default=""
    )
    card_cvv = serializers.CharField(
        max_length=4, required=False, allow_blank=True, default=""
    )

    def validate(self, attrs):
        method = attrs.get("payment_method")
        if method == "card":
            # Demo checkout: a 16-digit number, MM/YY expiry and the 3-4 digit
            # CVV from the back of the card. The frontend enforces the same
            # rules, so demo data behaves exactly like production input.
            digits = "".join(ch for ch in (attrs.get("card_number") or "") if ch.isdigit())
            if len(digits) != 16:
                raise serializers.ValidationError(
                    {"card_number": "Enter the 16-digit card number printed on the card."}
                )
            if not (attrs.get("card_holder_name") or "").strip():
                raise serializers.ValidationError(
                    {"card_holder_name": "Name on card is required."}
                )
            expiry = (attrs.get("card_expiry") or "").strip()
            if (
                len(expiry) != 5
                or expiry[2] != "/"
                or not expiry[:2].isdigit()
                or not expiry[3:].isdigit()
                or not 1 <= int(expiry[:2]) <= 12
            ):
                raise serializers.ValidationError(
                    {"card_expiry": "Enter the expiry date as MM/YY."}
                )
            cvv = "".join(ch for ch in (attrs.get("card_cvv") or "") if ch.isdigit())
            if len(cvv) not in (3, 4):
                raise serializers.ValidationError(
                    {"card_cvv": "Enter the 3 or 4 digit CVV from the back of the card."}
                )
            attrs["card_number"] = digits
            attrs["card_expiry"] = expiry
            attrs["card_cvv"] = cvv
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
