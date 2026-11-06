from django.shortcuts import redirect, render
from django.contrib.auth import authenticate, login, logout
from django.db import transaction
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import BadHeaderError
from smtplib import SMTPException
from django.contrib.auth.decorators import login_required

from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework.parsers import MultiPartParser, FormParser
from django.utils import timezone
from datetime import timedelta
import secrets
from rest_framework import status

from .models import PasswordResetCode, User, EmailVerificationCode
from .email_otp import (
    generate_code, ensure_email_ready, deliver_code, send_registration_code,
    verify_registration_code, reset_code_matches, COOLDOWN_SECONDS,
)
from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as PasswordValidationError

from .forms import (
    AdminSignUpForm,
    DriverSignUpForm,
    LoginForm,
    OperatorSignUpForm,
    PassengerSignUpForm,
)
from .serializers import (
    UserSerializer,
    LoginSerializer,
    PassengerRegisterSerializer,
    DriverRegisterSerializer,
    OperatorRegisterSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    EmailVerificationSerializer,
    EmailVerificationResendSerializer,
)


# The JSON API handles registration and email confirmation. These old HTML
# registration pages cannot bypass the new mandatory email verification flow.
def _legacy_registration(request):
    from django.http import HttpResponse
    return HttpResponse(
        "Use the THEMBA web app's Create an account screen to register and verify your email.",
        content_type="text/plain; charset=utf-8", status=410,
    )

register_passenger = _legacy_registration
register_driver = _legacy_registration
register_operator = _legacy_registration
register_admin = _legacy_registration


def home(request):
    return render(request, "accounts/home.html")


def login_view(request):
    if request.method == "POST":
        form = LoginForm(request.POST)
        if form.is_valid():
            user = authenticate(
                request,
                username=form.cleaned_data["phone"],
                password=form.cleaned_data["password"],
            )
            if user is not None:
                login(request, user)
                return redirect("dashboard")
            form.add_error(None, "Invalid phone number or password.")
    else:
        form = LoginForm()
    return render(request, "accounts/login.html", {"form": form})


def logout_view(request):
    logout(request)
    return redirect("home")


@login_required
def dashboard(request):
    return render(request, "accounts/dashboard.html", {"user": request.user})


# ---------- JSON API for React ----------

def _auth_response(user):
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "user": UserSerializer(user).data})


def _register_with_email(serializer):
    """Create an inactive account and send an email OTP, atomically.

    If SMTP is not configured or delivery fails, leave no unusable account.
    """
    try:
        ensure_email_ready()
        with transaction.atomic():
            user = serializer.save()
            send_registration_code(user)
    except (ImproperlyConfigured, SMTPException, OSError, BadHeaderError, RuntimeError) as exc:
        # Do not leak SMTP passwords or provider internals to the client.
        return Response({"detail": "Email delivery is unavailable. Check SMTP setup and try again."}, status=503)
    return Response({
        "requires_email_verification": True,
        "phone": user.phone,
        "detail": "We sent a six-digit verification code to your email. It expires in 15 minutes.",
    }, status=202)


@api_view(["POST"])
@permission_classes([AllowAny])
def api_register_passenger(request):
    s = PassengerRegisterSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    return _register_with_email(s)


@api_view(["POST"])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser])
def api_register_driver(request):
    s = DriverRegisterSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    return _register_with_email(s)


@api_view(["POST"])
@permission_classes([AllowAny])
def api_register_operator(request):
    s = OperatorRegisterSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    return _register_with_email(s)


@api_view(["POST"])
@permission_classes([AllowAny])
def api_email_verify(request):
    s = EmailVerificationSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    try:
        with transaction.atomic():
            user = User.objects.select_for_update().get(phone=s.validated_data["phone"])
            if user.is_active:
                return Response({"detail": "Email already verified. Please sign in."}, status=400)
            if not verify_registration_code(user, s.validated_data["code"]):
                return Response({"detail": "Incorrect or expired code. Request another if needed."}, status=400)
            user.is_active = True
            user.save(update_fields=["is_active"])
    except User.DoesNotExist:
        return Response({"detail": "Incorrect or expired code."}, status=400)
    return _auth_response(user)


@api_view(["POST"])
@permission_classes([AllowAny])
def api_email_resend(request):
    s = EmailVerificationResendSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    try:
        with transaction.atomic():
            user = User.objects.select_for_update().get(phone=s.validated_data["phone"], is_active=False)
            last = user.email_verification_codes.order_by("-created_at").first()
            now = timezone.now()
            if last and (now - last.last_sent_at).total_seconds() < COOLDOWN_SECONDS:
                return Response({"detail": "Please wait one minute before requesting another code."}, status=429)
            if user.email_verification_codes.filter(created_at__gte=now-timedelta(days=1)).count() >= 5:
                return Response({"detail": "Too many requests. Try again tomorrow."}, status=429)
            ensure_email_ready()
            user.email_verification_codes.filter(used_at__isnull=True).update(used_at=now)
            send_registration_code(user)
    except User.DoesNotExist:
        pass  # Do not reveal whether the phone belongs to an account.
    except (ImproperlyConfigured, SMTPException, OSError, BadHeaderError, RuntimeError):
        return Response({"detail": "Email delivery is unavailable. Try again later."}, status=503)
    return Response({"detail": "If your registration is pending, a new code has been emailed."})


@api_view(["POST"])
@permission_classes([AllowAny])
def api_login(request):
    s = LoginSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    return _auth_response(s.validated_data["user"])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_logout(request):
    if request.auth:
        request.auth.delete()
    return Response({"detail": "Logged out."})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_me(request):
    return Response(UserSerializer(request.user).data)

@api_view(["POST"])
@permission_classes([AllowAny])
def api_password_reset_request(request):
    """Email a reset OTP to the registered address; never return the OTP."""
    s = PasswordResetRequestSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    generic = {"method": "email", "detail": "If an active account exists, a password reset code has been sent to its registered email."}
    try:
        with transaction.atomic():
            user = User.objects.select_for_update().get(phone=s.validated_data["phone"], is_active=True)
            if not user.email:
                return Response(generic)
            last = PasswordResetCode.objects.filter(user=user, purpose=PasswordResetCode.Purpose.SELF_SERVICE).order_by("-created_at").first()
            now = timezone.now()
            if last and (now - last.created_at).total_seconds() < COOLDOWN_SECONDS:
                return Response(generic)
            ensure_email_ready()
            PasswordResetCode.objects.filter(user=user, used_at__isnull=True, purpose=PasswordResetCode.Purpose.SELF_SERVICE).update(used_at=now)
            code = generate_code()
            PasswordResetCode.objects.create(
                user=user, code=make_password(code), purpose=PasswordResetCode.Purpose.SELF_SERVICE,
                expires_at=now+timedelta(minutes=15),
            )
            deliver_code(user.email, code, "reset")
    except User.DoesNotExist:
        pass
    except (ImproperlyConfigured, SMTPException, OSError, BadHeaderError, RuntimeError):
        return Response({"detail": "Email service unavailable. Please try again later."}, status=503)
    return Response(generic)


@api_view(["POST"])
@permission_classes([AllowAny])
def api_password_reset_confirm(request):
    s = PasswordResetConfirmSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    try:
        validate_password(s.validated_data["new_password"])
    except PasswordValidationError as exc:
        return Response({"detail": exc.messages}, status=400)
    try:
        with transaction.atomic():
            user = User.objects.select_for_update().get(phone=s.validated_data["phone"], is_active=True)
            reset = PasswordResetCode.objects.filter(
                user=user, used_at__isnull=True
            ).order_by("-created_at").first()
            if not reset or not reset_code_matches(reset, s.validated_data["code"]):
                return Response({"detail": "Invalid, expired or already-used code."}, status=400)
            user.set_password(s.validated_data["new_password"])
            user.save(update_fields=["password"])
            # Existing login tokens are invalidated after a password change.
            Token.objects.filter(user=user).delete()
    except User.DoesNotExist:
        return Response({"detail": "Invalid, expired or already-used code."}, status=400)
    return Response({"detail": "Password updated. You can now sign in."})
