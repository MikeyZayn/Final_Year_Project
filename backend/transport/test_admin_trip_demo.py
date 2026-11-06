"""Safe rank-scoped developer trip progression, mirroring the reference admin UI."""
from datetime import timedelta, time

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User, RankCode, OperatorProfile, AdminProfile
from .models import Rank, Destination, Route, Trip, Booking, TripChange


class AdminTripDemoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.rank = Rank.objects.create(name="Ungoye")
        self.other_rank = Rank.objects.create(name="Elsewhere")
        destination = Destination.objects.create(name="Richards Bay")
        self.route = Route.objects.create(departure=self.rank, destination=destination, fare="60.00")
        self.other_route = Route.objects.create(departure=self.other_rank, destination=destination, fare="60.00")
        association = RankCode.objects.create(code="ADM-DEMO", association_name="Demo", operating_region="KZN")
        self.operator_user = User.objects.create_user("0827771111", "test", role="operator")
        self.operator = OperatorProfile.objects.create(user=self.operator_user, association=association)
        self.admin_user = User.objects.create_user("0827772222", "test", role="admin")
        AdminProfile.objects.create(user=self.admin_user, rank=self.rank)
        self.other_admin_user = User.objects.create_user("0827773333", "test", role="admin")
        AdminProfile.objects.create(user=self.other_admin_user, rank=self.other_rank)
        self.original = Trip.objects.create(
            route=self.route, operator=self.operator, trip_code="REAL-001",
            departure_date=timezone.localdate() + timedelta(days=1),
            expected_departure_time=time(11, 0), status="boarding",
        )
        self.client.force_authenticate(self.admin_user)

    def copy(self, source_id=None):
        return self.client.post("/transport/api/admin/trips/demo/", {
            "source_trip_id": source_id or self.original.pk,
        }, format="json")

    def simulate(self, trip_id, step):
        return self.client.post("/transport/api/admin/trips/simulate/", {
            "trip_id": trip_id, "step": step,
        }, format="json")

    def test_clone_does_not_change_original_or_copy_bookings(self):
        Booking.objects.create(trip=self.original, walk_in_name="Live booked passenger", status="reserved")
        response = self.copy()
        self.assertEqual(response.status_code, 201, response.data)
        demo = Trip.objects.get(pk=response.data["id"])
        self.assertTrue(demo.trip_code.startswith("DEMO-"))
        self.assertEqual(demo.status, Trip.Status.SCHEDULED)
        self.assertEqual(demo.route, self.original.route)
        self.assertEqual(demo.operator, self.original.operator)
        self.assertIsNone(demo.driver_id)
        self.assertIsNone(demo.vehicle_id)
        self.assertEqual(demo.bookings.count(), 0)
        self.original.refresh_from_db()
        self.assertEqual(self.original.status, Trip.Status.BOARDING)
        self.assertEqual(self.original.bookings.count(), 1)

    def test_full_sequence_reset_cancel_and_audit(self):
        demo_id = self.copy().data["id"]
        for target in ("boarding", "in_progress", "completed"):
            response = self.simulate(demo_id, "next")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["status"], target)
        demo = Trip.objects.get(pk=demo_id)
        self.assertIsNotNone(demo.actual_departure_time)
        self.assertEqual(self.simulate(demo_id, "next").data["status"], "completed")
        self.assertEqual(self.simulate(demo_id, "reset").data["status"], "scheduled")
        demo.refresh_from_db()
        self.assertIsNone(demo.actual_departure_time)
        self.assertEqual(self.simulate(demo_id, "cancel").data["status"], "cancelled")
        self.assertEqual(self.simulate(demo_id, "next").status_code, 400)
        self.assertEqual(self.simulate(demo_id, "reset").data["status"], "scheduled")
        self.assertEqual(TripChange.objects.filter(trip_id=demo_id).count(), 6)
        self.original.refresh_from_db()
        self.assertEqual(self.original.status, "boarding")

    def test_live_trip_cannot_be_modified_by_simulator(self):
        response = self.simulate(self.original.pk, "next")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Trip.objects.get(pk=self.original.pk).status, "boarding")

    def test_non_admin_and_wrong_rank_blocked(self):
        self.client.force_authenticate(self.operator_user)
        self.assertEqual(self.copy().status_code, 403)
        self.assertEqual(self.simulate(self.original.pk, "next").status_code, 403)
        self.client.force_authenticate(self.other_admin_user)
        self.assertEqual(self.copy().status_code, 404)
        self.assertEqual(self.simulate(self.original.pk, "next").status_code, 404)

    def test_reject_booked_demo_and_unrecognised_step(self):
        demo_id = self.copy().data["id"]
        self.assertEqual(self.simulate(demo_id, "invented").status_code, 400)
        Booking.objects.create(trip_id=demo_id, walk_in_name="Demo passenger")
        self.assertEqual(self.simulate(demo_id, "next").status_code, 409)
        self.assertEqual(Trip.objects.get(pk=demo_id).status, "scheduled")
