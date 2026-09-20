from django.conf import settings
from django.db import models
from accounts.models import OperatorProfile


class Destination(models.Model):
    name = models.CharField(max_length=150)
    area = models.CharField(max_length=150, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Rank(models.Model):
    """A physical place where taxis load. Shared by many operators."""
    name = models.CharField(max_length=150)
    area = models.CharField(max_length=150, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.area})" if self.area else self.name


class OperatorAtRank(models.Model):
    """An operator's approved presence at a rank. Set by the rank's admin."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending approval"
        ACTIVE = "active", "Active"
        REJECTED = "rejected", "Rejected"
        INACTIVE = "inactive", "Inactive"

    operator = models.ForeignKey(
        OperatorProfile, on_delete=models.CASCADE, related_name="rank_memberships"
    )
    rank = models.ForeignKey(
        Rank, on_delete=models.PROTECT, related_name="operator_memberships"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    requested_at = models.DateTimeField(auto_now_add=True)
    approved_by = models.ForeignKey(
        "accounts.AdminProfile",
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="approved_memberships",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = [("operator", "rank")]
        ordering = ["rank__name"]

    def __str__(self):
        return f"{self.operator} @ {self.rank} ({self.status})"


class Route(models.Model):
    """A shared corridor: from a rank to a destination with a fare.
    Not owned by any single operator."""

    class ServiceCategory(models.TextChoices):
        UNSTRUCTURED = "unstructured", "Unstructured"
        STRUCTURED = "structured", "Structured"

    departure = models.ForeignKey(Rank, on_delete=models.PROTECT, related_name="routes_from")
    destination = models.ForeignKey(Destination, on_delete=models.PROTECT, related_name="routes_to")
    fare = models.DecimalField(max_digits=8, decimal_places=2)
    service_category = models.CharField(
        max_length=20, choices=ServiceCategory.choices,
        default=ServiceCategory.STRUCTURED,
    )
    typical_duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["departure__name", "destination__name"]
        unique_together = [("departure", "destination")]

    def __str__(self):
        return f"{self.departure.name} → {self.destination.name} (R{self.fare})"


class Vehicle(models.Model):
    """A physical taxi. Independent of any operator or rank."""
    plate_number = models.CharField(max_length=20, unique=True)
    make = models.CharField(max_length=50, blank=True)
    model = models.CharField(max_length=50, blank=True)
    seat_capacity = models.PositiveSmallIntegerField(default=15)
    roadworthy = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.plate_number} ({self.make} {self.model})".strip()


class DriverVehicle(models.Model):
    """A driver is approved to operate a specific vehicle. Many-to-many."""
    driver = models.ForeignKey(
        "accounts.DriverProfile", on_delete=models.CASCADE, related_name="vehicle_assignments"
    )
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name="driver_assignments")
    assigned_at = models.DateTimeField(auto_now_add=True)
    active = models.BooleanField(default=True)

    class Meta:
        unique_together = [("driver", "vehicle", "active")]


class Trip(models.Model):
    """A specific departure instance: operator X runs route Y on date Z."""

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        BOARDING = "boarding", "Boarding"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        FLAGGED = "flagged", "Flagged — needs admin review"

    operator = models.ForeignKey(
        OperatorProfile, on_delete=models.CASCADE, related_name="trips"
    )
    route = models.ForeignKey(Route, on_delete=models.PROTECT, related_name="trips")
    departure_date = models.DateField()
    expected_departure_time = models.TimeField(null=True, blank=True)
    actual_departure_time = models.DateTimeField(null=True, blank=True)
    seat_capacity = models.PositiveSmallIntegerField(default=15)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    trip_code = models.CharField(max_length=30, unique=True)
    driver = models.ForeignKey(
        "accounts.DriverProfile", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="trips",
    )
    vehicle = models.ForeignKey(
        Vehicle, on_delete=models.SET_NULL, null=True, blank=True, related_name="trips"
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["departure_date", "expected_departure_time", "id"]

    @property
    def seats_taken(self):
        return self.bookings.exclude(
            status__in=[Booking.Status.CANCELLED, Booking.Status.NO_SHOW]
        ).count()

    @property
    def seats_available(self):
        return max(self.seat_capacity - self.seats_taken, 0)

    def __str__(self):
        return f"{self.trip_code} {self.route} @ {self.departure_date}"


class Booking(models.Model):
    """A passenger on a trip. Registered user (passenger FK) or walk-in."""

    class Status(models.TextChoices):
        RESERVED = "reserved", "Reserved"
        BOARDED = "boarded", "Boarded"
        COMPLETED = "completed", "Completed"
        NO_SHOW = "no_show", "No show"
        CANCELLED = "cancelled", "Cancelled"

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="bookings")
    passenger = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="bookings",
    )
    walk_in_name = models.CharField(max_length=150, blank=True)
    walk_in_phone = models.CharField(max_length=15, blank=True)
    walk_in_id_number = models.CharField(max_length=13, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RESERVED)
    booked_at = models.DateTimeField(auto_now_add=True)
    boarded_at = models.DateTimeField(null=True, blank=True)
    boarded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="boarded_bookings",
    )

    class Meta:
        ordering = ["-booked_at"]

    def display_name(self):
        if self.passenger:
            return f"{self.passenger.first_name} {self.passenger.last_name}".strip() or self.passenger.phone
        return self.walk_in_name or "Walk-in"

    def __str__(self):
        return f"{self.display_name()} → {self.trip.trip_code} ({self.status})"


class VerificationCode(models.Model):
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name="verification_code")
    code = models.CharField(max_length=20, unique=True)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="issued_codes",
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.code} ({'used' if self.verified_at else 'unused'})"

class TripFlag(models.Model):
    """An operator flags a trip for admin attention."""

    class Category(models.TextChoices):
        UNVERIFIED_DRIVER = "unverified_driver", "Driver not verified"
        VEHICLE_CONDITION = "vehicle_condition", "Vehicle condition"
        MISSING_ASSETS = "missing_assets", "Driver or vehicle missing"
        DOCUMENTATION = "documentation", "Documentation issue"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        ACKNOWLEDGED = "acknowledged", "Acknowledged"
        RESOLVED = "resolved", "Resolved"
        DISMISSED = "dismissed", "Dismissed"

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="flags")
    category = models.CharField(max_length=30, choices=Category.choices)
    notes = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    flagged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name="flags_raised",
    )
    flagged_at = models.DateTimeField(auto_now_add=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="flags_resolved",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-flagged_at"]

    def __str__(self):
        return f"{self.trip.trip_code} — {self.get_category_display()} ({self.status})"

class TripAssetChange(models.Model):
    """Audit log of any driver or vehicle reassignment on a trip."""

    class Reason(models.TextChoices):
        DRIVER_NOT_FIT = "driver_not_fit", "Driver not fit to drive"
        DRIVER_RESPONSIBILITIES = "driver_responsibilities", "Driver has other responsibilities"
        DRIVER_ROTATION = "driver_rotation", "Driver rotation change"
        VEHICLE_NOT_FIT = "vehicle_not_fit", "Vehicle not fit for travel"
        VEHICLE_FORFEIT = "vehicle_forfeit", "Vehicle voluntary forfeit"
        VEHICLE_SWAP = "vehicle_swap", "Vehicle swapped in queue"
        OTHER = "other", "Other"

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="asset_changes")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name="asset_changes_made",
    )
    changed_at = models.DateTimeField(auto_now_add=True)
    old_driver = models.ForeignKey(
        "accounts.DriverProfile", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="replaced_from",
    )
    new_driver = models.ForeignKey(
        "accounts.DriverProfile", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="replaced_to",
    )
    old_vehicle = models.ForeignKey(
        Vehicle, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="replaced_from",
    )
    new_vehicle = models.ForeignKey(
        Vehicle, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="replaced_to",
    )
    reason = models.CharField(max_length=30, choices=Reason.choices)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-changed_at"]

    def __str__(self):
        return f"{self.trip.trip_code} — {self.get_reason_display()}"