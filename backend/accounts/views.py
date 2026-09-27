from django.shortcuts import redirect, render
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.decorators import login_required
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework.parsers import MultiPartParser, FormParser

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
@permission_classes([AllowAny])
def api_password_reset_request(request):
    email = str(request.data.get("email", "")).strip()
    if not email:
        return Response({"email": ["Enter the email address on your account."]}, status=400)

    User = get_user_model()
    users = User.objects.filter(email__iexact=email, is_active=True).exclude(email="")
    for user in users:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = (
            f"{settings.FRONTEND_URL.rstrip('/')}/?reset=1"
            f"&uid={uid}&token={token}"
        )
        send_mail(
            "Reset your THEMBA password",
            f"Use this link to choose a new password. It expires for security.\n\n{reset_url}",
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=False,
        )

    return Response({"detail": "If an account uses that email, password reset instructions have been sent."})


@api_view(["POST"])
@permission_classes([AllowAny])
def api_password_reset_confirm(request):
    uid = request.data.get("uid", "")
    token = request.data.get("token", "")
    password = request.data.get("password", "")
    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        user = get_user_model().objects.get(pk=user_id, is_active=True)
    except (TypeError, ValueError, OverflowError, get_user_model().DoesNotExist):
        return Response({"detail": "This password reset link is invalid or has expired."}, status=400)

    if not default_token_generator.check_token(user, token):
        return Response({"detail": "This password reset link is invalid or has expired."}, status=400)

    try:
        validate_password(password, user=user)
    except ValidationError as error:
        return Response({"password": list(error.messages)}, status=400)

    user.set_password(password)
    user.save(update_fields=["password"])
    Token.objects.filter(user=user).delete()
    return Response({"detail": "Password reset successfully. Sign in with your new password."})


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