from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .serializers import LoginSerializer, UserPublicSerializer


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """
    POST /api/auth/login/
    Body: { "username"|"phone"|"email": "...", "password": "themba123" }
    """
    ser = LoginSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    ident = ser.validated_data["ident"]
    password = ser.validated_data["password"]
    user = authenticate(request, username=ident, password=password)
    if user is None:
        return Response(
            {"detail": "Invalid credentials. Use phone, email, or username."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    token, _ = Token.objects.get_or_create(user=user)
    return Response(
        {
            "token": token.key,
            "user": UserPublicSerializer(user).data,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_view(request):
    return Response(UserPublicSerializer(request.user).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    Token.objects.filter(user=request.user).delete()
    return Response({"detail": "Logged out."})
