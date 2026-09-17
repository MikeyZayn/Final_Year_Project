from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from .models import AdminProfile, DriverProfile, OperatorProfile, PassengerProfile, RankCode, User
from .models import DriverProfile, PassengerProfile, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("username", "email", "phone", "role", "is_staff")
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("THEMBA role", {"fields": ("role", "phone")}),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ("THEMBA role", {"fields": ("role", "phone")}),
    )


@admin.register(PassengerProfile)
class PassengerProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "next_of_kin_name", "next_of_kin_phone", "second_next_of_kin_name")

@admin.register(DriverProfile)
class DriverProfileAdmin(admin.ModelAdmin):
    # This is where an operator/admin approves a driver — flip status to
    # "verified" here once you're ready to enforce it elsewhere in the app.
    list_display = ("user", "license_number", "status", "association")
    list_filter = ("status",)

@admin.register(RankCode)
class RankCodeAdmin(admin.ModelAdmin):
    list_display = ("code", "association_name", "operating_region", "is_active", "created_at")
    list_filter = ("is_active",)


@admin.register(OperatorProfile)
class OperatorProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "association")

@admin.register(AdminProfile)
class AdminProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "institution_name")