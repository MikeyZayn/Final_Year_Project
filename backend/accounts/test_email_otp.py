"""Email verification and password reset behaviour. Run with manage.py test accounts."""
import re
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from accounts.models import DriverProfile, RankCode, User

@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="test@themba.example",
)
class EmailOtpFlowTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.password = "Excellent2026!Password"

    def register_passenger(self, phone="0821100221", email="traveller@example.test"):
        return self.api.post("/accounts/api/register/passenger/", {
            "first_name": "Lindi", "last_name": "N", "phone": phone,
            "email": email, "password": self.password,
            "next_of_kin_name": "Family", "next_of_kin_phone": "0831100332",
        }, format="json")

    def code_in_mail(self):
        match = re.search(r"\b\d{6}\b", mail.outbox[-1].body)
        self.assertIsNotNone(match)
        return match.group(0)

    def test_email_is_required_and_registration_needs_verification(self):
        response = self.register_passenger(email="")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)
        response = self.register_passenger()
        self.assertEqual(response.status_code, 202)
        self.assertNotIn("code", response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["traveller@example.test"])
        user = User.objects.get(phone="0821100221")
        self.assertFalse(user.is_active)
        self.assertEqual(self.api.post("/accounts/api/login/", {"phone":user.phone,"password":self.password},format="json").status_code, 400)
        code = self.code_in_mail()
        confirm = self.api.post("/accounts/api/email/verify/", {"phone":user.phone,"code":code},format="json")
        self.assertEqual(confirm.status_code, 200)
        self.assertIn("token", confirm.data)
        self.assertTrue(User.objects.get(pk=user.pk).is_active)
        self.assertEqual(self.api.post("/accounts/api/email/verify/", {"phone":user.phone,"code":code}, format="json").status_code, 400)

    def test_invalid_code_does_not_activate_account(self):
        self.register_passenger()
        correct = self.code_in_mail()
        wrong = "000000" if correct != "000000" else "999999"
        for i in range(5):
            result = self.api.post("/accounts/api/email/verify/", {"phone":"0821100221","code":wrong}, format="json")
            self.assertEqual(result.status_code, 400)
        self.assertEqual(self.api.post("/accounts/api/email/verify/", {"phone":"0821100221","code":correct}, format="json").status_code, 400)

    def test_driver_signup_does_not_require_photo_or_sa_id(self):
        RankCode.objects.create(code="ONG001", association_name="Ongoye", operating_region="Empangeni")
        response = self.api.post("/accounts/api/register/driver/", {
            "first_name":"Bongani", "last_name":"Z", "phone":"0821100223", "email":"driver@example.test",
            "password":self.password,"license_number":"NDL 001","rank_code":"ONG001",
        }, format="multipart")
        self.assertEqual(response.status_code, 202)
        driver = DriverProfile.objects.get(user__phone="0821100223")
        self.assertFalse(driver.photo)
        self.assertEqual(driver.id_number, "")

    def test_password_reset_email_is_not_returned_in_api(self):
        user = User.objects.create_user(phone="0821100224", password=self.password, email="reset@example.test")
        result = self.api.post("/accounts/api/password-reset/request/", {"phone":user.phone},format="json")
        self.assertEqual(result.status_code, 200)
        self.assertNotIn("code", result.data)
        self.assertEqual(mail.outbox[0].to, ["reset@example.test"])
        code = self.code_in_mail()
        done = self.api.post("/accounts/api/password-reset/confirm/", {
            "phone":user.phone, "code":code, "new_password":"Another2026!Password",
        },format="json")
        self.assertEqual(done.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password("Another2026!Password"))
        self.assertEqual(self.api.post("/accounts/api/password-reset/confirm/", {
            "phone":user.phone, "code":code, "new_password":"Yetanother2026!Password",
        },format="json").status_code, 400)

    def test_admin_reset_code_is_emailed_not_disclosed(self):
        admin = User.objects.create_superuser(phone="0821100288", password=self.password, email="admin@example.test")
        customer = User.objects.create_user(phone="0821100299", password=self.password, email="customer@example.test")
        self.api.force_authenticate(user=admin)
        result = self.api.post(f"/transport/api/admin/users/{customer.id}/reset-code/", {}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertNotIn("code", result.data)
        self.assertEqual(mail.outbox[0].to, ["customer@example.test"])
