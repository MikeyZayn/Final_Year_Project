from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import (
    AdminProfile,
    DriverProfile,
    OperatorProfile,
    PassengerProfile,
    RankCode,
    User,
)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "phone", "first_name", "last_name", "email", "role"]


class LoginSerializer(serializers.Serializer):
    phone = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(username=attrs["phone"], password=attrs["password"])
        if not user:
            raise serializers.ValidationError("Invalid phone number or password.")
        attrs["user"] = user
        return attrs


class PassengerRegisterSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=15)
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    next_of_kin_name = serializers.CharField(max_length=150)
    next_of_kin_phone = serializers.CharField(max_length=15)
    second_next_of_kin_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    second_next_of_kin_phone = serializers.CharField(max_length=15, required=False, allow_blank=True)

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("Phone already registered.")
        return value

    def create(self, data):
        profile_data = {
            "next_of_kin_name": data.pop("next_of_kin_name"),
            "next_of_kin_phone": data.pop("next_of_kin_phone"),
            "second_next_of_kin_name": data.pop("second_next_of_kin_name", ""),
            "second_next_of_kin_phone": data.pop("second_next_of_kin_phone", ""),
        }
        password = data.pop("password")
        user = User(**data, role=User.Role.PASSENGER)
        user.username = user.phone
        user.set_password(password)
        user.save()
        PassengerProfile.objects.create(user=user, **profile_data)
        return user


class DriverRegisterSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=15)
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    license_number = serializers.CharField(max_length=30)
    rank_code = serializers.CharField(max_length=20)
    photo = serializers.ImageField()

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("Phone already registered.")
        return value

    def validate_rank_code(self, value):
        try:
            self._rank = RankCode.objects.get(code=value, is_active=True)
        except RankCode.DoesNotExist:
            raise serializers.ValidationError("Invalid or inactive rank code.")
        return value

    def create(self, data):
        password = data.pop("password")
        data.pop("rank_code")
        license_number = data.pop("license_number")
        photo = data.pop("photo")
        user = User(**data, role=User.Role.DRIVER)
        user.username = user.phone
        user.set_password(password)
        user.save()
        DriverProfile.objects.create(
            user=user,
            license_number=license_number,
            photo=photo,
            association=self._rank,
        )
        return user


class OperatorRegisterSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=15)
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    rank_code = serializers.CharField(max_length=20)

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("Phone already registered.")
        return value

    def validate_rank_code(self, value):
        try:
            self._rank = RankCode.objects.get(code=value, is_active=True)
        except RankCode.DoesNotExist:
            raise serializers.ValidationError("Invalid or inactive rank code.")
        return value

    def create(self, data):
        password = data.pop("password")
        data.pop("rank_code")
        phone = data["phone"]
        user = User(phone=phone, email=data.get("email", ""), role=User.Role.OPERATOR)
        user.username = phone
        user.set_password(password)
        user.save()
        OperatorProfile.objects.create(user=user, association=self._rank)
        return user