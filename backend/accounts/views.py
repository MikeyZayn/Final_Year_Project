from django.shortcuts import redirect, render
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required

from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework.parsers import MultiPartParser, FormParser
from django.utils import timezone
from datetime import timedelta
import random
from rest_framework import status

from .models import PasswordResetCode, User

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
)


# ---------- Server-rendered views (kept as fallback) ----------

def register_passenger(request):
    if request.method == "POST":
        form = PassengerSignUpForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect("login")
    else:
        form = PassengerSignUpForm()
    return render(request, "accounts/register_passenger.html", {"form": form})


def register_driver(request):
    if request.method == "POST":
        form = DriverSignUpForm(request.POST, request.FILES)
        if form.is_valid():
            form.save()
            return redirect("login")
    else:
        form = DriverSignUpForm()
    return render(request, "accounts/register_driver.html", {"form": form})


def register_admin(request):
    if request.method == "POST":
        form = AdminSignUpForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect("login")
    else:
        form = AdminSignUpForm()
    return render(request, "accounts/register_admin.html", {"form": form})


def register_operator(request):
    if request.method == "POST":
        form = OperatorSignUpForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect("login")
    else:
        form = OperatorSignUpForm()
    return render(request, "accounts/register_operator.html", {"form": form})


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


@api_view(["POST"])
@permission_classes([AllowAny])
def api_register_passenger(request):
    s = PassengerRegisterSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    user = s.save()
    return _auth_response(user)


@api_view(["POST"])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser])
def api_register_driver(request):
    s = DriverRegisterSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    user = s.save()
    return _auth_response(user)


@api_view(["POST"])
@permission_classes([AllowAny])
def api_register_operator(request):
    s = OperatorRegisterSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    user = s.save()
    return _auth_response(user)


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

def _generate_reset_code():
    return f"{random.randint(0, 999999):06d}"


@api_view(["POST"])
@permission_classes([AllowAny])
def api_password_reset_request(request):
    """Request a password reset code.
    Passengers and drivers get the code returned directly (simulated SMS).
    Operators and admins are told to contact their rank admin."""
    s = PasswordResetRequestSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    phone = s.validated_data["phone"]

    try:
        user = User.objects.get(phone=phone)
    except User.DoesNotExist:
        return Response(
            {"detail": "No account found with that phone number."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if user.account_status != User.AccountStatus.ACTIVE:
        return Response(
            {"detail": "This account is not active. Contact an administrator."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Operators and admins use admin-assisted reset
    if user.role in (User.Role.OPERATOR, User.Role.ADMIN):
        return Response({
            "method": "admin_assisted",
            "detail": (
                "Password reset for this role is handled by a rank administrator. "
                "Please contact your rank admin in person."
            ),
        })

    # Passengers and drivers get a self-service code
    PasswordResetCode.objects.filter(user=user, used_at__isnull=True).update(
        used_at=timezone.now()
    )
    code = _generate_reset_code()
    PasswordResetCode.objects.create(
        user=user,
        code=code,
        purpose=PasswordResetCode.Purpose.SELF_SERVICE,
        expires_at=timezone.now() + timedelta(minutes=15),
    )

    return Response({
        "method": "self_service",
        "code": code,
        "detail": (
            "A 6-digit code has been generated. In production this would be sent "
            "by SMS; for the prototype it is shown here and expires in 15 minutes."
        ),
    })


@api_view(["POST"])
@permission_classes([AllowAny])
def api_password_reset_confirm(request):
    """Verify a code and set a new password."""
    s = PasswordResetConfirmSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    phone = s.validated_data["phone"]
    code = s.validated_data["code"]
    new_password = s.validated_data["new_password"]

    try:
        user = User.objects.get(phone=phone)
    except User.DoesNotExist:
        return Response(
            {"detail": "No account found with that phone number."},
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        reset = PasswordResetCode.objects.get(
            user=user, code=code, used_at__isnull=True,
        )
    except PasswordResetCode.DoesNotExist:
        return Response(
            {"detail": "Invalid or already-used code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not reset.is_valid():
        return Response(
            {"detail": "This code has expired. Request a new one."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(new_password)
    user.save()

    reset.used_at = timezone.now()
    reset.save()

    return Response({"detail": "Password updated. You can now sign in."})