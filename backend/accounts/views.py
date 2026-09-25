from django.shortcuts import redirect, render
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required

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
@permission_classes([IsAuthenticated])
def api_logout(request):
    if request.auth:
        request.auth.delete()
    return Response({"detail": "Logged out."})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def api_me(request):
    return Response(UserSerializer(request.user).data)