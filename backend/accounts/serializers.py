from rest_framework import serializers
from .models import User


class UserPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "phone", "email", "role", "first_name", "last_name"]


class LoginSerializer(serializers.Serializer):
    """Accept phone, email, or username + password."""

    username = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        ident = (
            (attrs.get("username") or "").strip()
            or (attrs.get("phone") or "").strip()
            or (attrs.get("email") or "").strip()
        )
        if not ident:
            raise serializers.ValidationError("Provide username, phone, or email.")
        attrs["ident"] = ident
        return attrs
