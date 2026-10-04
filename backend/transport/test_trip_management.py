from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import User, RankCode, OperatorProfile, DriverProfile, AdminProfile, PassengerProfile
from .models import Rank, Destination, Route, Vehicle, Trip, Booking, DriverAtRank, OperatorAtRank, TripChange

class TripManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        association = RankCode.objects.create(code="EDIT", association_name="Edit", operating_region="KZN")
        self.op_user = User.objects.create_user("0821000001", "test", role="operator")
        self.op = OperatorProfile.objects.create(user=self.op_user, association=association)
        self.rank = Rank.objects.create(name="Local rank")
        self.route = Route.objects.create(departure=self.rank, destination=Destination.objects.create(name="Town"), fare=20)
        OperatorAtRank.objects.create(operator=self.op, rank=self.rank, status="active")
        self.admin = User.objects.create_user("0701000001", "test", role="admin")
        AdminProfile.objects.create(user=self.admin, rank=self.rank)
        self.driver = self.make_driver("0831000001")
        self.replacement = self.make_driver("0831000002")
        self.vehicle = Vehicle.objects.create(plate_number="EDIT1", seat_capacity=15)
        self.other_vehicle = Vehicle.objects.create(plate_number="EDIT2", seat_capacity=10)
        self.trip = Trip.objects.create(operator=self.op, route=self.route, driver=self.driver, vehicle=self.vehicle,
            trip_code="EDIT1", departure_date=timezone.localdate() + timedelta(days=1), seat_capacity=15,
            status="boarding", engaged_by=self.op, assets_verified_at=timezone.now(), assets_verified_by=self.op_user)
        self.passenger = User.objects.create_user("0821000002", "test", role="passenger", first_name="Lead")
        self.profile = PassengerProfile.objects.create(user=self.passenger, next_of_kin_name="Original", next_of_kin_phone="0822222222")
        self.client.force_authenticate(self.op_user)

    def make_driver(self, phone):
        u = User.objects.create_user(phone, "test", role="driver")
        d = DriverProfile.objects.create(user=u, license_number=phone, status="verified")
        DriverAtRank.objects.create(driver=d, rank=self.rank, status="active")
        return d

    def change(self, payload, admin=False):
        if admin:
            self.client.force_authenticate(self.admin)
            return self.client.patch(f"/transport/api/admin/trips/{self.trip.pk}/edit/", payload, format="json")
        return self.client.post(f"/transport/api/my-trips/{self.trip.pk}/reassign/", payload, format="json")

    def test_operator_driver_change_resets_verification_and_is_visible_to_admin(self):
        response = self.change({"driver_id": self.replacement.pk, "reason": "Shift changed", "driver_reason": "Driver is unavailable"})
        self.assertEqual(response.status_code, 200, response.data)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.driver, self.replacement)
        self.assertIsNone(self.trip.assets_verified_at)
        self.assertEqual(self.trip.asset_changes.count(), 1)
        self.client.force_authenticate(self.admin)
        rows = self.client.get(f"/transport/api/trips/{self.trip.pk}/history/").data
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["before"]["driver_id"], str(self.driver.pk))
        self.assertEqual(rows[0]["after"]["driver_id"], str(self.replacement.pk))
        self.assertIn("unavailable", rows[0]["reason"])

    def test_operator_cannot_change_schedule_or_skip_reasons(self):
        for payload in [
            {"departure_date": "2027-01-01", "reason": "No"},
            {"driver_id": self.replacement.pk, "reason": "No"},
            {"driver_id": self.replacement.pk, "driver_reason": "Shift"},
            {"vehicle_id": self.other_vehicle.pk, "reason": "No"},
        ]:
            self.assertEqual(self.change(payload).status_code, 400)
        self.assertFalse(TripChange.objects.exists())
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.driver, self.driver)

    def test_rejected_dot_and_unapproved_rank_drivers_cannot_be_assigned(self):
        for status in ["failed", "suspended"]:
            self.replacement.external_verification_status = status
            self.replacement.save()
            self.assertEqual(self.change({"driver_id": self.replacement.pk, "reason": "Swap", "driver_reason": "Shift"}).status_code, 400)
        self.replacement.external_verification_status = "verified"
        self.replacement.save()
        DriverAtRank.objects.filter(driver=self.replacement).update(status="pending")
        self.assertEqual(self.change({"driver_id": self.replacement.pk, "reason": "Swap", "driver_reason": "Shift"}).status_code, 400)

    def test_vehicle_change_capacity_and_roadworthy_guard(self):
        Booking.objects.bulk_create([Booking(trip=self.trip, walk_in_name=str(i)) for i in range(11)])
        payload = {"vehicle_id": self.other_vehicle.pk, "reason": "Replacement", "vehicle_reason": "Mechanical issue"}
        self.assertEqual(self.change(payload).status_code, 400)
        self.other_vehicle.seat_capacity = 15
        self.other_vehicle.roadworthy = False
        self.other_vehicle.save()
        self.assertEqual(self.change(payload).status_code, 400)
        self.other_vehicle.roadworthy = True
        self.other_vehicle.save()
        self.assertEqual(self.change(payload).status_code, 200)
        self.trip.refresh_from_db()
        self.assertIsNone(self.trip.assets_verified_at)

    def test_schedule_overlap_and_closed_trip_guard(self):
        Trip.objects.create(operator=self.op, route=self.route, driver=self.replacement,
            trip_code="CLASH", departure_date=self.trip.departure_date)
        self.assertEqual(self.change({"driver_id": self.replacement.pk, "reason": "Swap", "driver_reason": "Shift"}).status_code, 400)
        self.trip.status = "in_progress"
        self.trip.save()
        self.assertEqual(self.change({"vehicle_id": self.other_vehicle.pk, "reason": "Swap", "vehicle_reason": "Repair"}).status_code, 400)
        self.assertEqual(self.change({"notes": "Historical note", "reason": "Correction"}, admin=True).status_code, 200)

    def test_admin_validates_fields_and_records_each_edit(self):
        self.assertEqual(self.change({"departure_date": "invalid", "reason": "Change"}, admin=True).status_code, 400)
        self.assertEqual(self.change({"seat_capacity": 0, "reason": "Change"}, admin=True).status_code, 400)
        response = self.change({"expected_departure_time": "08:30", "notes": "Updated", "reason": "New timetable"}, admin=True)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(TripChange.objects.get().actor_role, "admin")
        self.assertEqual(TripChange.objects.get().after["expected_departure_time"], "08:30:00")

    def test_history_and_edit_are_rank_scoped(self):
        AdminProfile.objects.filter(user=self.admin).update(rank=Rank.objects.create(name="Other"))
        self.admin.refresh_from_db()
        self.assertEqual(self.change({"notes": "No", "reason": "Wrong rank"}, admin=True).status_code, 404)
        self.assertEqual(self.client.get(f"/transport/api/trips/{self.trip.pk}/history/").status_code, 404)
        self.client.force_authenticate(self.passenger)
        self.assertEqual(self.client.get(f"/transport/api/trips/{self.trip.pk}/history/").status_code, 403)

    def test_cancel_records_reason_and_does_not_cancel_boarded_passengers(self):
        self.client.force_authenticate(self.admin)
        url = f"/transport/api/admin/trips/{self.trip.pk}/cancel/"
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 400)
        b = Booking.objects.create(trip=self.trip, passenger=self.passenger, status="boarded")
        self.assertEqual(self.client.post(url, {"reason": "Cancelled"}, format="json").status_code, 400)
        b.status = "reserved"; b.save()
        self.assertEqual(self.client.post(url, {"reason": "Vehicle unavailable"}, format="json").status_code, 200)
        self.assertEqual(TripChange.objects.get().after["status"], "cancelled")
        b.refresh_from_db(); self.assertEqual(b.status, "cancelled")

    def group(self, leader, ids=(), companions=()):
        return self.client.post(f"/transport/api/my-trips/{self.trip.pk}/group/", {
            "leader_id": leader.pk, "booking_ids": list(ids), "companions": list(companions),
            "next_of_kin_name": "Shared Contact", "next_of_kin_phone": "0823333333"}, format="json")

    def test_group_registered_members_and_child_keeps_profiles_and_seats(self):
        leader = Booking.objects.create(trip=self.trip, passenger=self.passenger)
        member_user = User.objects.create_user("0821000003", "test", role="passenger", first_name="Member")
        member = Booking.objects.create(trip=self.trip, passenger=member_user)
        response = self.group(leader, [member.pk], [{"first_name": "Child", "last_name": "Family"}])
        self.assertEqual(response.status_code, 200, response.data)
        member.refresh_from_db()
        self.assertEqual(member.display_name(), "Member")
        self.assertEqual(self.trip.seats_taken, 3)
        self.profile.refresh_from_db(); self.assertEqual(self.profile.next_of_kin_name, "Original")
        self.client.force_authenticate(member_user)
        bookings = self.client.get("/transport/api/my-bookings/").data
        self.assertEqual(bookings[0]["shared_next_of_kin"]["name"], "Shared Contact")
        self.assertEqual(bookings[0]["group_leader_id"], leader.pk)

    def test_walk_in_group_can_board_selected_members(self):
        leader = Booking.objects.create(trip=self.trip, walk_in_name="Parent", status="boarded")
        response = self.group(leader, companions=[{"first_name": "Child", "last_name": "Family"}])
        self.assertEqual(response.status_code, 200)
        child = leader.companions.get()
        response = self.client.post(f"/transport/api/my-trips/{self.trip.pk}/bookings/{leader.pk}/board-group/",
            {"booking_ids": [child.pk]}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        child.refresh_from_db(); self.assertEqual(child.status, "boarded")

    def test_group_rejects_cross_trip_nested_groups_and_over_capacity(self):
        leader = Booking.objects.create(trip=self.trip, passenger=self.passenger)
        other = Trip.objects.create(operator=self.op, route=self.route, trip_code="OTHER", departure_date=self.trip.departure_date)
        outsider = Booking.objects.create(trip=other, walk_in_name="Elsewhere")
        self.assertEqual(self.group(leader, [outsider.pk]).status_code, 400)
        parent = Booking.objects.create(trip=self.trip, walk_in_name="Other leader")
        Booking.objects.create(trip=self.trip, group_leader=parent, companion_first_name="Child")
        self.assertEqual(self.group(leader, [parent.pk]).status_code, 400)
        self.trip.seat_capacity = self.trip.seats_taken; self.trip.save()
        self.assertEqual(self.group(leader, companions=[{"first_name": "Extra", "last_name": "Child"}]).status_code, 400)
        leader.refresh_from_db(); self.assertEqual(leader.group_next_of_kin_name, "")

    def test_leader_cancel_keeps_registered_companion_booking(self):
        leader = Booking.objects.create(trip=self.trip, passenger=self.passenger)
        member_user = User.objects.create_user("0821000003", "test", role="passenger")
        member = Booking.objects.create(trip=self.trip, passenger=member_user)
        self.assertEqual(self.group(leader, [member.pk]).status_code, 200)
        self.client.force_authenticate(self.passenger)
        self.assertEqual(self.client.post(f"/transport/api/my-bookings/{leader.pk}/cancel/").status_code, 200)
        member.refresh_from_db()
        self.assertEqual(member.status, "reserved")
        self.assertIsNone(member.group_leader_id)
        self.assertEqual(member.group_next_of_kin_name, "Shared Contact")
