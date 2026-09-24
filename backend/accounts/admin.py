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
    list_display = (
        "user", "license_number", "id_number", "pdp_number",
        "association", "status", "external_verification_status",
    )
    list_filter = ("status", "external_verification_status", "association")
    search_fields = ("user__phone", "license_number", "id_number")
    readonly_fields = ("external_verification_status", "external_verification_reason")
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