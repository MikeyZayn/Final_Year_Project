import re
from urllib.parse import urlparse, parse_qs

from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import User


@override_settings(
	EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
	FRONTEND_URL="http://localhost:5174",
)
class AuthApiTests(TestCase):
	def setUp(self):
		self.client = APIClient()

	def test_registration_trims_phone_and_returns_auth_token(self):
		response = self.client.post(
			"/accounts/api/register/passenger/",
			{
				"first_name": "Test",
				"last_name": "Passenger",
				"phone": " 0821234567 ",
				"password": "Strong!Pass482",
				"next_of_kin_name": "Contact Person",
				"next_of_kin_phone": "0831234567",
			},
			format="json",
		)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data["user"]["phone"], "0821234567")
		self.assertTrue(response.data["token"])

	def test_login_trims_phone(self):
		User.objects.create_user(
			phone="0821234567",
			password="Strong!Pass482",
			email="passenger@example.com",
		)

		response = self.client.post(
			"/accounts/api/login/",
			{"phone": " 0821234567 ", "password": "Strong!Pass482"},
			format="json",
		)

		self.assertEqual(response.status_code, 200)
		self.assertTrue(response.data["token"])

	def test_local_vite_port_passes_cors_preflight(self):
		response = self.client.options(
			"/accounts/api/login/",
			HTTP_ORIGIN="http://localhost:5174",
			HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
		)

		self.assertEqual(response.get("Access-Control-Allow-Origin"), "http://localhost:5174")

	def test_password_reset_request_is_generic_and_reset_link_changes_password(self):
		user = User.objects.create_user(
			phone="0821234567",
			password="Original!Password482",
			email="passenger@example.com",
		)

		request_response = self.client.post(
			"/accounts/api/password-reset/",
			{"email": "passenger@example.com"},
			format="json",
		)

		self.assertEqual(request_response.status_code, 200)
		self.assertEqual(len(mail.outbox), 1)
		reset_url = re.search(r"http://localhost:5174/\?reset=1&[^\s]+", mail.outbox[0].body).group(0)
		query = parse_qs(urlparse(reset_url).query)

		confirm_response = self.client.post(
			"/accounts/api/password-reset/confirm/",
			{
				"uid": query["uid"][0],
				"token": query["token"][0],
				"password": "New!SecurePassword739",
			},
			format="json",
		)

		self.assertEqual(confirm_response.status_code, 200)
		self.assertTrue(user.__class__.objects.get(pk=user.pk).check_password("New!SecurePassword739"))
		login_response = self.client.post(
			"/accounts/api/login/",
			{"phone": user.phone, "password": "New!SecurePassword739"},
			format="json",
		)
		self.assertEqual(login_response.status_code, 200)

	def test_unknown_email_gets_same_reset_request_response_without_sending_mail(self):
		response = self.client.post(
			"/accounts/api/password-reset/",
			{"email": "unknown@example.com"},
			format="json",
		)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(len(mail.outbox), 0)
