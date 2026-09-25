from django.contrib import admin
from .models import (
    Rank, Destination, OperatorAtRank, Route,
    Vehicle, DriverVehicle, Trip, Booking, VerificationCode,
    TripFlag, Feedback, Announcement, PanicAlert,
)


@admin.register(Rank)
class RankAdmin(admin.ModelAdmin):
    list_display = ("name", "area")
    search_fields = ("name", "area")


@admin.register(Destination)
class DestinationAdmin(admin.ModelAdmin):
    list_display = ("name", "area")
    search_fields = ("name", "area")


@admin.register(OperatorAtRank)
class OperatorAtRankAdmin(admin.ModelAdmin):
    list_display = ("rank", "operator", "status", "approved_by", "approved_at")
    list_filter = ("status", "rank", "operator__association")
    actions = ["approve_selected", "reject_selected"]

    @admin.action(description="Approve selected memberships")
    def approve_selected(self, request, queryset):
        from django.utils import timezone
        try:
            admin_profile = request.user.admin_profile
        except Exception:
            self.message_user(request, "You are not registered as an admin profile.")
            return
        updated = 0
        for m in queryset:
            if m.rank_id != admin_profile.rank_id:
                continue
            m.status = OperatorAtRank.Status.ACTIVE
            m.approved_by = admin_profile
            m.approved_at = timezone.now()
            m.save()
            updated += 1
        self.message_user(request, f"Approved {updated} membership(s).")

    @admin.action(description="Reject selected memberships")
    def reject_selected(self, request, queryset):
        updated = queryset.update(status=OperatorAtRank.Status.REJECTED)
        self.message_user(request, f"Rejected {updated} membership(s).")


@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ("departure", "destination", "fare", "service_category", "active")
    list_filter = ("service_category", "active", "departure")


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ("plate_number", "make", "model", "seat_capacity", "roadworthy")
    list_filter = ("roadworthy",)
    search_fields = ("plate_number",)


@admin.register(DriverVehicle)
class DriverVehicleAdmin(admin.ModelAdmin):
    list_display = ("driver", "vehicle", "active", "assigned_at")
    list_filter = ("active",)


class BookingInline(admin.TabularInline):
    model = Booking
    extra = 0
    readonly_fields = ("booked_at",)


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = ("trip_code", "operator", "route", "departure_date",
                    "expected_departure_time", "status", "seats_taken")
    list_filter = ("status", "operator__association", "departure_date")
    search_fields = ("trip_code",)
    inlines = [BookingInline]


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("trip", "display_name", "status", "booked_at")
    list_filter = ("status",)
    search_fields = ("passenger__phone", "walk_in_name", "trip__trip_code")


@admin.register(VerificationCode)
class VerificationCodeAdmin(admin.ModelAdmin):
    list_display = ("code", "booking", "issued_by", "issued_at", "verified_at")
    list_filter = ("verified_at",)
    search_fields = ("code",)


@admin.register(TripFlag)
class TripFlagAdmin(admin.ModelAdmin):
    list_display = ("trip", "category", "status", "flagged_by", "flagged_at")
    list_filter = ("status", "category")
    actions = ["mark_resolved"]

    @admin.action(description="Mark selected flags as resolved")
    def mark_resolved(self, request, queryset):
        from django.utils import timezone
        updated = queryset.update(
            status=TripFlag.Status.RESOLVED,
            resolved_by=request.user,
            resolved_at=timezone.now(),
        )
        self.message_user(request, f"Resolved {updated} flag(s).")

@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ("trip", "rating", "has_complaint", "category", "status", "created_at")
    list_filter = ("status", "category", "has_complaint", "rating")
    search_fields = ("passenger__phone", "trip__trip_code")
    readonly_fields = ("created_at", "reviewed_at", "resolved_at")

@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("title", "operator", "route", "active", "created_at")
    list_filter = ("active", "operator__association")
    search_fields = ("title", "body")

@admin.register(PanicAlert)
class PanicAlertAdmin(admin.ModelAdmin):
    list_display = ("booking", "passenger", "status", "created_at", "acknowledged_by")
    list_filter = ("status",)
    search_fields = ("passenger__phone", "booking__trip__trip_code")
    readonly_fields = ("created_at", "acknowledged_at", "resolved_at")