"""Email OTPs for THEMBA. Transport uses configured SMTP (not a simulated SMS)."""
import secrets
from datetime import timedelta
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from django.core.exceptions import ImproperlyConfigured
from django.utils import timezone
from .models import EmailVerificationCode, PasswordResetCode

OTP_TTL_MINUTES = 15
COOLDOWN_SECONDS = 60
MAX_ATTEMPTS = 5

def generate_code():
    return f"{secrets.randbelow(1000000):06d}"

def ensure_email_ready():
    """Never pretend to email a code when SMTP is not configured."""
    backend = getattr(settings, "EMAIL_BACKEND", "")
    if not settings.DEBUG and not backend.endswith("smtp.EmailBackend"):
        raise ImproperlyConfigured("Production email verification requires an SMTP delivery backend.")
    if backend.endswith("smtp.EmailBackend") and not (settings.EMAIL_HOST_USER and settings.EMAIL_HOST_PASSWORD):
        raise ImproperlyConfigured("Email delivery is not configured. Add SMTP credentials to backend/.env.")

def deliver_code(email, code, purpose):
    ensure_email_ready()
    title = "THEMBA: verify your email" if purpose == "register" else "THEMBA: reset your password"
    text = (f"Your THEMBA verification code is {code}.\n"
            f"It expires in {OTP_TTL_MINUTES} minutes. Never share this code.")
    sent = send_mail(title, text, settings.DEFAULT_FROM_EMAIL, [email], fail_silently=False)
    if sent != 1:
        raise RuntimeError("Verification email could not be sent.")

def send_registration_code(user):
    code = generate_code()
    now = timezone.now()
    row = EmailVerificationCode.objects.create(
        user=user, code_hash=make_password(code),
        expires_at=now + timedelta(minutes=OTP_TTL_MINUTES), last_sent_at=now,
    )
    deliver_code(user.email, code, "register")
    return row

def verify_registration_code(user, supplied):
    row = user.email_verification_codes.filter(used_at__isnull=True).order_by("-created_at").first()
    if not row or row.expires_at <= timezone.now() or row.attempts >= MAX_ATTEMPTS:
        return False
    row.attempts += 1
    good = check_password(supplied, row.code_hash)
    if good:
        row.used_at = timezone.now()
    row.save(update_fields=["attempts", "used_at"])
    return good

def reset_code_matches(row, supplied):
    """Support old in-person admin codes while new reset codes are hashed."""
    if row.attempts >= MAX_ATTEMPTS or not row.is_valid():
        return False
    row.attempts += 1
    good = check_password(supplied, row.code) if row.code.startswith(("pbkdf2_", "argon2", "bcrypt_", "scrypt$")) else secrets.compare_digest(row.code, supplied)
    if good:
        row.used_at = timezone.now()
    row.save(update_fields=["attempts", "used_at"])
    return good
