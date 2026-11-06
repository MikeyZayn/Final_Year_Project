from django.contrib.auth import authenticate
from rest_framework import serializers
from django.db import transaction
from django.contrib.auth.password_validation import validate_password
from .models import (
    AdminProfile,
    DriverProfile,
    OperatorProfile,
    PassengerProfile,
    RankCode,
    User,
    PasswordResetCode,
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
            maybe = User.objects.filter(phone=attrs["phone"], is_active=False).first()
            if maybe and maybe.check_password(attrs["password"]):
                raise serializers.ValidationError("Confirm the verification code sent to your email before signing in.")
            raise serializers.ValidationError("Invalid phone number or password.")
        attrs["user"] = user
        return attrs


class RegistrationEmailMixin:
    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already registered.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value


class PassengerRegisterSerializer(RegistrationEmailMixin, serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=15)
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=True, allow_blank=False)
    next_of_kin_name = serializers.CharField(max_length=150)
    next_of_kin_phone = serializers.CharField(max_length=15)
    second_next_of_kin_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    second_next_of_kin_phone = serializers.CharField(max_length=15, required=False, allow_blank=True)

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("Phone already registered.")
        return value

    @transaction.atomic
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
        user.is_active = False  # Activated only after email OTP confirmation
        user.set_password(password)
        user.save()
        PassengerProfile.objects.create(user=user, **profile_data)
        return user

class DriverRegisterSerializer(RegistrationEmailMixin, serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=15)
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=True, allow_blank=False)
    license_number = serializers.CharField(max_length=30)
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

    @transaction.atomic
    def create(self, data):
        password = data.pop("password")
        data.pop("rank_code")   # discard the raw string; use self._rank instead
        license_number = data.pop("license_number")

        # Registration does not require an SA ID or any photo/face capture.
        # Licence checks are performed by the admin against the mock registry later.
        reason = "pending_license_review"
        ext_status = DriverProfile.ExternalVerification.UNVERIFIED

        user = User(**data, role=User.Role.DRIVER)
        user.username = user.phone
        user.is_active = False  # Activated only after email OTP confirmation
        user.set_password(password)
        user.save()

        DriverProfile.objects.create(
            user=user,
            license_number=license_number,
            association=self._rank,
            status=DriverProfile.VerificationStatus.PENDING,
            external_verification_status=ext_status,
            external_verification_reason=reason,
        )
        return user

class OperatorRegisterSerializer(RegistrationEmailMixin, serializers.Serializer):
    phone = serializers.CharField(max_length=15)
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=True, allow_blank=False)
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

    @transaction.atomic
    def create(self, data):
        password = data.pop("password")
        data.pop("rank_code")
        phone = data["phone"]
        user = User(phone=phone, email=data.get("email", ""), role=User.Role.OPERATOR)
        user.username = phone
        user.is_active = False  # Activated only after email OTP confirmation
        user.set_password(password)
        user.save()
        OperatorProfile.objects.create(user=user, association=self._rank)
        return user

class PasswordResetRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=15)


class PasswordResetConfirmSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=15)
    code = serializers.CharField(max_length=8)
    new_password = serializers.CharField(write_only=True, min_length=8)

class EmailVerificationSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=15)
    code = serializers.RegexField(r"^\d{6}$")


class EmailVerificationResendSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=15)
