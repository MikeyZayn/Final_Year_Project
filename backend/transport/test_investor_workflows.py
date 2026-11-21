from django.test import TestCase, override_settings
from django.core import mail
from django.utils import timezone
from rest_framework.authtoken.models import Token
from accounts.models import AccountDecision, AdminProfile, PassengerProfile, User
from .models import Booking, CommuterPassUsage, OperatorAtRank, Rank, TripChange, Vehicle
from .tests import TripWorkflowTests as TripFixture


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", DEBUG=True)
class DocumentedWorkflowTests(TestCase):
    def setUp(self):
        TripFixture.setUp(self)
        self.rank = self.trip.route.departure
        self.admin = User.objects.create_user("0700000091", "Demo-admin-only-91!", role="admin")
        AdminProfile.objects.create(user=self.admin, rank=self.rank, institution_name="Test rank office")
        OperatorAtRank.objects.create(operator=self.op, rank=self.rank, status="active")

    def test_passenger_settings_persist_without_altering_authentication_fields(self):
        self.client.force_authenticate(self.passenger)
        path = "/accounts/api/passenger-settings/"
        payload = {
            "first_name": "Lindi", "last_name": "Test", "next_of_kin_name": "Family Contact",
            "next_of_kin_phone": "0821111100", "second_next_of_kin_name": "",
            "second_next_of_kin_phone": "", "email": "different@example.test", "role": "admin",
        }
        self.assertEqual(self.client.put(path, payload, format="json").status_code, 200)
        profile = PassengerProfile.objects.get(user=self.passenger)
        profile.user.refresh_from_db()
        self.assertEqual(profile.next_of_kin_phone, "0821111100")
        self.assertEqual(profile.user.first_name, "Lindi")
        self.assertEqual(profile.user.role, "passenger")
        self.assertEqual(profile.user.email, self.passenger.email)
        self.client.force_authenticate(self.operator)
        self.assertEqual(self.client.get(path).status_code, 403)

    def test_email_verified_operator_requires_rank_approval_before_email_login(self):
        import re
        self.client.force_authenticate(None)
        phone, password = "0820000081", "New-test-passphrase-2026!"
        registration = self.client.post("/accounts/api/register/operator/", {
            "phone": phone, "email": "review@example.test", "password": password,
            "rank_code": self.op.association.code,
        }, format="json")
        self.assertEqual(registration.status_code, 202, registration.data)
        code = re.search(r"\b\d{6}\b", mail.outbox[-1].body)[0]
        otp = self.client.post("/accounts/api/email/verify/", {"phone": phone, "code": code}, format="json")
        self.assertEqual(otp.status_code, 202, otp.data)
        self.assertNotIn("token", otp.data)
        applicant = User.objects.get(phone=phone)
        login = {"phone": "REVIEW@example.test", "password": password}
        self.assertEqual(self.client.post("/accounts/api/login/", login, format="json").status_code, 400)
        self.client.force_authenticate(self.admin)
        path = f"/transport/api/admin/users/{applicant.pk}/approve/"
        self.assertEqual(self.client.post(path, {"reason": "Association details checked"}).status_code, 200)
        self.assertTrue(OperatorAtRank.objects.filter(operator__user=applicant, rank=self.rank, status="active").exists())
        self.assertTrue(AccountDecision.objects.filter(account=applicant, actor=self.admin, status="active").exists())
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post("/accounts/api/login/", login, format="json").status_code, 200)

    def test_account_actions_are_rank_scoped_and_revoke_tokens(self):
        other_admin = User.objects.create_user("0700000092", "Demo-admin-only-92!", role="admin")
        AdminProfile.objects.create(user=other_admin, rank=Rank.objects.create(name="Other rank"), institution_name="Other")
        Token.objects.create(user=self.operator)
        path = f"/transport/api/admin/users/{self.operator.pk}/disable/"
        self.client.force_authenticate(other_admin)
        self.assertEqual(self.client.post(path, {"reason": "Review"}).status_code, 404)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(path, {"reason": "Review"}).status_code, 200)
        self.assertFalse(Token.objects.filter(user=self.operator).exists())

    def test_untimed_trip_and_demo_pass_requires_operator_confirmation(self):
        self.trip.expected_departure_time = None
        self.trip.departure_date = timezone.localdate()
        self.trip.save()
        self.client.force_authenticate(self.passenger)
        response = self.client.post("/transport/api/my-bookings/", {
            "trip_id": self.trip.pk, "payment_method": "pass",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["payment_status"], "pending")
        booking = Booking.objects.get(pk=response.data["id"])
        self.client.force_authenticate(self.operator)
        path = f"/transport/api/my-trips/{self.trip.pk}"
        self.assertEqual(self.client.post(path + "/engage/").status_code, 200)
        self.assertEqual(self.client.post(path + "/verify-assets/").status_code, 400)
        self.assertEqual(self.client.post(path + "/verify-assets/", {
            "driver_id": self.trip.driver_id, "vehicle_id": self.trip.vehicle_id,
            "checks": {"face": True, "details": True, "vehicle": True},
        }, format="json").status_code, 200)
        self.assertTrue(TripChange.objects.filter(trip=self.trip, changed_by=self.operator).exists())
        boarding = path + f"/bookings/{booking.pk}/verify/"
        pass_path = path + f"/bookings/{booking.pk}/verify-pass/"
        self.assertEqual(self.client.post(boarding).status_code, 400)
        self.assertEqual(self.client.post(pass_path).status_code, 400)
        for _ in range(2):
            self.assertEqual(self.client.post(pass_path, {"pass_presented": True}, format="json").status_code, 200)
        self.assertEqual(CommuterPassUsage.objects.filter(booking=booking, recorded_by=self.operator).count(), 1)
        self.assertEqual(self.client.post(boarding).status_code, 200)
        booking.refresh_from_db()
        self.assertEqual(booking.amount_paid, 0)
        self.assertEqual(booking.payment_verified_by, self.operator)
        self.client.force_authenticate(self.admin)
        usage = self.client.get("/transport/api/admin/commuter-pass-usage/").data
        self.assertEqual([entry["booking_id"] for entry in usage], [booking.pk])

    def test_information_only_route_keeps_fare_without_public_booking(self):
        self.trip.route.service_category = "unstructured"
        self.trip.route.save()
        self.client.force_authenticate(self.passenger)
        self.assertEqual(self.client.get("/transport/api/routes/").data[0]["fare"], "25.00")
        self.assertEqual(self.client.get("/transport/api/trips/").data, [])
        self.assertEqual(self.client.post("/transport/api/my-bookings/", {
            "trip_id": self.trip.pk, "payment_method": "cash",
        }, format="json").status_code, 400)

    def test_vehicle_queue_can_be_reordered_and_read_by_local_operator(self):
        self.client.force_authenticate(self.admin)
        path = "/transport/api/admin/queue/"
        other = Vehicle.objects.create(plate_number="QUEUE-TWO", roadworthy=True)
        first = self.client.post(path, {"vehicle_id": self.trip.vehicle_id})
        second = self.client.post(path, {"vehicle_id": other.pk})
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(self.client.post(path, {"vehicle_id": other.pk}).status_code, 409)
        self.assertEqual(self.client.post(f"{path}{second.data['id']}/move/", {"direction": "up"}).status_code, 200)
        self.client.force_authenticate(self.operator)
        response = self.client.get("/transport/api/operator/queue/")
        self.assertEqual([row["plate_number"] for row in response.data], ["QUEUE-TWO", self.trip.vehicle.plate_number])
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f"{path}{first.data['id']}/remove/").status_code, 204)
