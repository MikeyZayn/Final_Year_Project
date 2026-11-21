"""Rank administrators review their own applicants and manage existing accounts."""
from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from accounts.models import AccountDecision, User
from .models import DriverAtRank, OperatorAtRank


def rank_accounts(actor):
    profile = getattr(actor, "admin_profile", None)
    if actor.role != User.Role.ADMIN or not profile or not profile.rank_id:
        raise PermissionDenied("A rank administrator is required.")
    rank_id = profile.rank_id
    operators = OperatorAtRank.objects.filter(rank_id=rank_id, status="active")
    associations = operators.values("operator__association_id")
    accounts = User.objects.filter(
        Q(operator_profile__rank_memberships__rank_id=rank_id, role="operator")
        | Q(driver_profile__rank_memberships__rank_id=rank_id, role="driver")
        | Q(operator_profile__association_id__in=associations, account_status__in=["pending", "rejected"])
        | Q(driver_profile__association_id__in=associations, account_status__in=["pending", "rejected"])
        | Q(bookings__trip__route__departure_id=rank_id, role="passenger")
    ).exclude(is_superuser=True).distinct()
    return profile, accounts


def account_row(user):
    return {
        "id": user.pk, "phone": user.phone, "name": user.get_full_name() or user.phone,
        "role": user.role, "account_status": user.account_status, "status_reason": user.status_reason,
        "date_joined": user.date_joined, "is_active": user.is_active,
        "review_overdue": user.account_status == "pending" and timezone.now() - user.date_joined >= timedelta(days=1),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def directory(request):
    _, accounts = rank_accounts(request.user)
    query = request.query_params.get("q", "").strip()[:100]
    if query:
        accounts = accounts.filter(Q(phone__icontains=query) | Q(first_name__icontains=query) | Q(last_name__icontains=query))
    if role := request.query_params.get("role"):
        accounts = accounts.filter(role=role)
    if status := request.query_params.get("status"):
        accounts = accounts.filter(account_status=status)
    return Response([account_row(user) for user in accounts.order_by("-date_joined")[:50]])


TRANSITIONS = {
    "approve": ({"pending"}, "active"),
    "reject": ({"pending"}, "rejected"),
    "disable": ({"active"}, "disabled"),
    "enable": ({"disabled"}, "active"),
    "archive": ({"active", "disabled", "rejected"}, "archived"),
}


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def decide(request, user_id, action):
    admin, accounts = rank_accounts(request.user)
    permitted, target = TRANSITIONS[action]
    get_object_or_404(accounts, pk=user_id)
    user = get_object_or_404(User.objects.select_for_update(), pk=user_id)
    reason = serializers.CharField(max_length=1000).run_validation(request.data.get("reason"))
    previous = user.account_status
    if previous not in permitted:
        raise ValidationError({"detail": "This action is unavailable for the current account status."})
    if action in ("approve", "reject") and not user.is_active:
        raise ValidationError({"detail": "The applicant must verify their email first."})
    if action == "approve":
        if user.role == User.Role.DRIVER:
            driver = user.driver_profile
            if driver.status != "verified" or driver.external_verification_status != "verified":
                raise ValidationError({"detail": "Complete the driver's licence check in Drivers before approving."})
            DriverAtRank.objects.update_or_create(driver=driver, rank_id=admin.rank_id, defaults={
                "status": "active", "approved_by": admin, "approved_at": timezone.now(), "notes": reason,
            })
        elif user.role == User.Role.OPERATOR:
            OperatorAtRank.objects.update_or_create(operator=user.operator_profile, rank_id=admin.rank_id, defaults={
                "status": "active", "approved_by": admin, "approved_at": timezone.now(), "notes": reason,
            })
    user.account_status = target
    user.is_active = target == User.AccountStatus.ACTIVE
    user.status_reason = reason
    user.status_changed_by = request.user
    user.status_changed_at = timezone.now()
    user.save(update_fields=["account_status", "is_active", "status_reason", "status_changed_at", "status_changed_by"])
    AccountDecision.objects.create(account=user, actor=request.user, previous_status=previous, status=target, reason=reason)
    Token.objects.filter(user=user).delete()
    return Response(account_row(user))
