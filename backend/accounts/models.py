from django.db import models
from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager

class UserManager(DjangoUserManager):
    def create_user(self, phone=None, password=None, **extra_fields):
        if not phone:
            raise ValueError("The phone number must be set")
        email = extra_fields.pop("email", "") or ""
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        user = self.model(phone=phone, email=email, username=phone, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, phone=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self.create_user(phone, password, **extra_fields)
class User(AbstractUser):
    class Role(models.TextChoices):
        PASSENGER = "passenger", "Passenger"
        DRIVER = "driver", "Driver"
        OPERATOR = "operator", "Operator"
        ADMIN = "admin", "Admin"

    role = models.CharField(max_length=20, choices=Role.choices, default= Role.PASSENGER)
    phone = models.CharField(max_length=15, unique=True)

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = []
    objects = UserManager()
    def __str__(self):
        
        return f"{self.username} ({self.role})"

class PassengerProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="passenger_profile")
    primary_route = models.CharField(max_length=120, blank=True)  # will change once routes table exists
    next_of_kin_name = models.CharField(max_length=150)
    next_of_kin_phone = models.CharField(max_length=15)
    second_next_of_kin_name = models.CharField(max_length=150, blank=True)
    second_next_of_kin_phone = models.CharField(max_length=15, blank=True)

    def __str__(self):
        return f"Passenger: {self.user}"
class DriverProfile(models.Model):
    class VerificationStatus(models.TextChoices):
        PENDING = "pending", "Pending verification"
        VERIFIED = "verified", "Verified"
        REJECTED = "rejected", "Rejected"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="driver_profile")
    license_number = models.CharField(max_length=30)  # TODO: encrypt to match schema's license_number_enc
    photo = models.ImageField(upload_to="driver_photos/")
    association = models.ForeignKey(
        "RankCode", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="driver_applications",
    )    
    status = models.CharField(
        max_length=20, choices=VerificationStatus.choices, default=VerificationStatus.PENDING
    )

    def __str__(self):
        return f"Driver: {self.user} ({self.status})"

class RankCode(models.Model):
    """Represents a taxi association. Operators register against this code;
    many operators can share one — it's not single-use."""
    code = models.CharField(max_length=20, unique=True)
    association_name = models.CharField(max_length=150)
    operating_region = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)  # admin can deactivate instead of deleting
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.code} — {self.association_name}"

class OperatorProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="operator_profile")
    association = models.ForeignKey(RankCode, on_delete=models.PROTECT, related_name="operators")

    def __str__(self):
        return f"Operator: {self.user} ({self.association.association_name})"

class AdminProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="admin_profile")
    institution_name = models.CharField(max_length=150)
    rank = models.ForeignKey(
        "transport.Rank",
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name="admins",
    )

    def __str__(self):
        rank_label = self.rank.name if self.rank else "unassigned"
        return f"Admin: {self.user} ({self.institution_name}) @ {rank_label}"