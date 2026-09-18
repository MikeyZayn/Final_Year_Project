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
    """A physical place where taxis load. Multiple operators can use one Rank."""
    name = models.CharField(max_length=150)
    area = models.CharField(max_length=150, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.area})" if self.area else self.name


class DeparturePoint(models.Model):
    """An operator's presence at a Rank. Multiple operators can share a Rank."""
    operator = models.ForeignKey(
        OperatorProfile, on_delete=models.CASCADE, related_name="departure_points"
    )
    rank = models.ForeignKey(
        Rank, on_delete=models.PROTECT, null=True, blank=True,
        related_name="departure_points",
    )

    # Legacy fields — kept for backward compat with existing seed. Will be dropped later.
    name = models.CharField(max_length=150, blank=True)
    area = models.CharField(max_length=150, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        label = self.rank.name if self.rank else (self.name or "Departure point")
        return f"{label} — {self.operator.association.association_name}"


class Route(models.Model):
    class ServiceCategory(models.TextChoices):
        UNSTRUCTURED = "unstructured", "Unstructured"
        STRUCTURED = "structured", "Structured"

    operator = models.ForeignKey(
        OperatorProfile, on_delete=models.CASCADE, related_name="routes"
    )
    departure_point = models.ForeignKey(
        DeparturePoint, on_delete=models.PROTECT, related_name="routes"
    )
    destination = models.ForeignKey(
        Destination, on_delete=models.PROTECT, related_name="routes"
    )
    fare = models.DecimalField(max_digits=8, decimal_places=2)
    service_category = models.CharField(
        max_length=20, choices=ServiceCategory.choices,
        default=ServiceCategory.UNSTRUCTURED,
    )
    typical_duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["departure_point__name", "destination__name"]

    def __str__(self):
        return f"{self.departure_point} → {self.destination.name} (R{self.fare})"