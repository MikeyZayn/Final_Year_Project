from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import User, RankCode, OperatorProfile, DriverProfile
from datetime import timedelta

from .models import (
    Rank, Destination, Route, Vehicle, Trip, Booking, VerificationCode,
    Feedback, Announcement, OperatorAtRank, DriverAtRank,
)


# A valid demo card. The backend and the PaymentModal enforce the same rules
# (16 digits, MM/YY expiry, 3-4 digit CVV), so tests use the same shape.
CARD_PAYMENT = {
    'payment_method': 'card',
    'card_holder_name': 'Test Passenger',
    'card_number': '4111111111111111',
    'card_expiry': '12/30',
    'card_cvv': '123',
}


class TripWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.operator = User.objects.create_user('0820000001', 'Passw0rd!', role='operator')
        association = RankCode.objects.create(code='TEST', association_name='Test', operating_region='KZN')
        self.op = OperatorProfile.objects.create(user=self.operator, association=association)
        self.passenger = User.objects.create_user('0821111111', 'Passw0rd!', role='passenger')
        driver_user = User.objects.create_user('0830000001', 'Passw0rd!', role='driver')
        driver = DriverProfile.objects.create(user=driver_user, license_number='TEST', status='verified')
        route = Route.objects.create(departure=Rank.objects.create(name='Rank'), destination=Destination.objects.create(name='Town'), fare='25.00')
        self.trip = Trip.objects.create(operator=self.op, route=route, driver=driver, vehicle=Vehicle.objects.create(plate_number='TEST'), departure_date=timezone.localdate(), trip_code='TEST', seat_capacity=2)
        self.client.force_authenticate(self.operator)

    def post(self, action, payload=None):
        return self.client.post(f'/transport/api/my-trips/{self.trip.pk}/{action}/', payload or {}, format='json')

    def ready(self):
        self.assertEqual(self.post('engage').status_code, 200)
        response = self.post('verify-assets')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNotNone(response.data['assets_verified_at'])

    def test_quick_booking_filters_exact_route_ids(self):
        self.client.force_authenticate(self.passenger)
        url = '/transport/api/trips/'
        response = self.client.get(url, {'departure_id': self.trip.route.departure_id, 'destination_id': self.trip.route.destination_id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([t['id'] for t in response.data], [self.trip.id])
        self.assertEqual(self.client.get(url, {'destination_id':999999}).data, [])
        self.assertEqual(self.client.get(url, {'departure_id':'invalid'}).status_code, 400)

    def test_complete_verified_feedback_workflow_and_single_use(self):
        self.ready()
        self.client.force_authenticate(self.passenger)
        r = self.client.post('/transport/api/my-bookings/', {'trip_id': self.trip.pk, **CARD_PAYMENT}, format='json')
        self.assertEqual(r.status_code, 201)
        booking_id = r.data['id']
        self.client.force_authenticate(self.operator)
        r = self.post(f'bookings/{booking_id}/verify')
        self.assertEqual(r.status_code, 200, r.data)
        self.client.force_authenticate(self.passenger)
        receipts = self.client.get('/transport/api/my-bookings/').data
        self.assertEqual(receipts[0]['verification_code'], r.data['verification_code'])
        url = f'/transport/api/my-bookings/{booking_id}/feedback/'
        self.assertEqual(self.client.post(url, {'rating': 5}).status_code, 400)
        self.client.force_authenticate(self.operator)
        self.assertEqual(self.post('release').status_code, 200)
        self.assertEqual(self.post('complete').status_code, 200)
        self.client.force_authenticate(self.passenger)
        response = self.client.post(url, {'rating': 5}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.client.post(url, {'rating': 5}).status_code, 400)
        self.assertIsNotNone(VerificationCode.objects.get(booking_id=booking_id).verified_at)
        self.assertEqual(Feedback.objects.count(), 1)

    def test_full_reservation_does_not_mark_other_passenger_no_show(self):
        self.ready()
        a = Booking.objects.create(trip=self.trip, passenger=self.passenger)
        b = Booking.objects.create(trip=self.trip, walk_in_name='Reserved')
        self.assertEqual(self.post(f'bookings/{a.pk}/verify').status_code, 200)
        b.refresh_from_db()
        self.assertEqual(b.status, 'reserved')
        self.assertEqual(self.post(f'bookings/{b.pk}/verify').status_code, 200)

    def test_assets_required_before_boarding_and_walk_in(self):
        self.post('engage')
        booking = Booking.objects.create(trip=self.trip, passenger=self.passenger)
        self.assertEqual(self.post(f'bookings/{booking.pk}/verify').status_code, 400)
        self.assertEqual(self.post('walk-in', {'name': 'Test'}).status_code, 400)
        self.assertEqual(VerificationCode.objects.count(), 0)

    def test_walk_in_keeps_next_of_kin_and_requires_boarding(self):
        self.assertEqual(self.post('walk-in', {'name': 'Test'}).status_code, 400)
        self.ready()
        response = self.post('walk-in', {'name': 'Test', 'next_of_kin_name': 'Family', 'next_of_kin_phone': '0822222222'})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['booking']['walk_in_next_of_kin_phone'], '0822222222')
        self.post('release')
        self.assertEqual(self.post('walk-in', {'name': 'Test'}).status_code, 400)

    def test_no_show_cannot_submit_feedback(self):
        self.ready()
        booking = Booking.objects.create(trip=self.trip, passenger=self.passenger)
        self.post('release'); self.post('complete')
        self.client.force_authenticate(self.passenger)
        self.assertEqual(self.client.post(f'/transport/api/my-bookings/{booking.pk}/feedback/', {'rating': 5}).status_code, 400)

    def test_ownership_and_lifecycle(self):
        self.assertEqual(self.post('complete').status_code, 400)
        self.ready()
        self.client.force_authenticate(self.passenger)
        self.assertEqual(self.post('release').status_code, 403)
        self.client.force_authenticate(self.operator)
        self.assertEqual(self.post('release').status_code, 200)
        self.assertEqual(self.post('engage').status_code, 400)
        self.assertEqual(self.post('complete').status_code, 200)
        self.assertEqual(self.post('engage').status_code, 400)

    def test_role_dashboards_load(self):
        from accounts.models import AdminProfile
        endpoints = {
            self.operator: ['my-trips', 'my-memberships', 'operator/feedback', 'operator/alerts'],
            self.passenger: ['my-bookings', 'my-feedback', 'my-panic'],
            self.trip.driver.user: ['driver/profile', 'driver/trips', 'driver/vehicle'],
        }
        admin = User.objects.create_user('0700000001', 'Passw0rd!', role='admin')
        AdminProfile.objects.create(user=admin, institution_name='Test', rank=self.trip.route.departure)
        endpoints[admin] = ['admin/me', 'admin/rank-trips', 'admin/queue', 'admin/users', 'admin/drivers']
        for user, paths in endpoints.items():
            self.client.force_authenticate(user)
            for path in paths:
                with self.subTest(role=user.role, endpoint=path):
                    response = self.client.get(f'/transport/api/{path}/')
                    self.assertEqual(response.status_code, 200, response.data)

class NewFeatureTests(TripWorkflowTests):
    def setUp(self):
        super().setUp()
        from accounts.models import PassengerProfile, AdminProfile
        from .models import DriverAtRank
        self.nok = PassengerProfile.objects.create(user=self.passenger, next_of_kin_name='Family Contact', next_of_kin_phone='0822222222')
        self.admin = User.objects.create_user('0700000002', 'Passw0rd!', role='admin')
        AdminProfile.objects.create(user=self.admin, institution_name='Rank office', rank=self.trip.route.departure)
        DriverAtRank.objects.create(driver=self.trip.driver, rank=self.trip.route.departure, status='active')

    def group_book(self, companions=None):
        self.client.force_authenticate(self.passenger)
        return self.client.post('/transport/api/my-bookings/', {'trip_id': self.trip.pk, 'companions': companions or [{'first_name': 'Nandi', 'last_name': 'Dube'}], **CARD_PAYMENT}, format='json')

    def test_group_capacity_and_nok_snapshot(self):
        response = self.group_book()
        self.assertEqual(response.status_code, 201, response.data)
        leader = Booking.objects.get(pk=response.data['id'])
        companion = leader.companions.get()
        self.assertEqual(companion.trip_id, leader.trip_id)
        self.assertIsNone(companion.passenger_id)
        self.assertEqual(companion.display_name(), 'Nandi Dube')
        self.assertEqual(leader.group_next_of_kin_phone, '0822222222')
        self.assertEqual(self.trip.seats_available, 0)
        self.client.force_authenticate(self.operator)
        manifest = self.client.get(f'/transport/api/my-trips/{self.trip.pk}/manifest/').data
        self.assertEqual(manifest['walk_in_passengers'][0]['next_of_kin_phone'], '0822222222')
        self.assertEqual(manifest['walk_in_passengers'][0]['group_leader_id'], leader.id)
        self.nok.next_of_kin_phone = '0833333333'; self.nok.save()
        leader.refresh_from_db()
        self.assertEqual(leader.group_next_of_kin_phone, '0822222222')

    def test_group_requires_names_nok_and_all_seats_atomically(self):
        response = self.group_book([{'first_name': '', 'last_name': 'Dube'}])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Booking.objects.count(), 0)
        response = self.group_book([{'first_name': 'A', 'last_name': 'B'}, {'first_name': 'C', 'last_name': 'D'}])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Booking.objects.count(), 0)
        self.nok.delete()
        self.passenger.refresh_from_db()
        self.assertEqual(self.group_book().status_code, 400)
        self.assertEqual(Booking.objects.count(), 0)

    def test_group_cancel_releases_all_seats_and_rebook(self):
        response = self.group_book(); pk = response.data['id']
        self.assertEqual(self.client.post(f'/transport/api/my-bookings/{pk}/cancel/').status_code, 200)
        self.assertEqual(self.trip.seats_available, 2)
        self.assertEqual(self.group_book().status_code, 201)
        self.assertEqual(Booking.objects.filter(trip=self.trip, passenger=self.passenger).count(), 1)
        self.assertEqual(Booking.objects.filter(group_leader_id=pk).count(), 1)

    def test_selected_group_boarding_and_auto_ack_are_separate_from_feedback(self):
        response = self.group_book(); pk = response.data['id']
        leader = Booking.objects.get(pk=pk); companion = leader.companions.get()
        self.client.force_authenticate(self.operator); self.ready()
        endpoint = f'bookings/{pk}/board-group'
        self.assertEqual(self.post(endpoint, {'booking_ids': [pk]}).status_code, 200)
        companion.refresh_from_db(); self.assertEqual(companion.status, 'reserved')
        self.assertEqual(self.post(endpoint, {'booking_ids': [pk, companion.pk]}).status_code, 200)
        # Repeated operator requests do not issue duplicate codes.
        self.assertEqual(self.post(endpoint, {'booking_ids': [pk, companion.pk]}).data['boarded_count'], 0)
        self.assertEqual(VerificationCode.objects.count(), 2)
        self.client.force_authenticate(self.passenger)
        receipt = VerificationCode.objects.get(booking=leader)
        url = f'/transport/api/my-bookings/{pk}/confirm-boarding/'
        self.assertEqual(self.client.post(url, {'code': 'wrong'}).status_code, 400)
        ack = self.client.post(url, {'code': receipt.code})
        self.assertEqual(ack.status_code, 200)
        self.assertIsNotNone(ack.data['passenger_confirmed_at'])
        again = self.client.post(url, {'code': receipt.code})
        self.assertEqual(again.data['passenger_confirmed_at'], ack.data['passenger_confirmed_at'])
        receipt.refresh_from_db(); self.assertIsNone(receipt.verified_at)
        self.client.force_authenticate(self.operator); self.post('release'); self.post('complete')
        self.client.force_authenticate(self.passenger)
        self.assertEqual(self.client.post(f'/transport/api/my-bookings/{pk}/feedback/', {'rating': 5}).status_code, 201)

    def test_group_and_receipt_ownership(self):
        response = self.group_book(); pk = response.data['id']
        stranger = User.objects.create_user('0829999999', 'Passw0rd!')
        other = Booking.objects.create(trip=self.trip, passenger=stranger)
        self.client.force_authenticate(self.operator); self.ready()
        self.assertEqual(self.post(f'bookings/{pk}/board-group', {'booking_ids': [other.pk]}).status_code, 400)
        self.assertEqual(self.post(f'bookings/{pk}/board-group', {'booking_ids': []}).status_code, 400)
        self.client.force_authenticate(stranger)
        self.assertEqual(self.client.post(f'/transport/api/my-bookings/{pk}/confirm-boarding/', {'code': 'abc'}).status_code, 404)
        own = self.client.get('/transport/api/my-bookings/').data
        self.assertEqual(len(own), 1); self.assertEqual(own[0]['id'], other.id)

    def test_rank_request_endpoints_removed(self):
        self.client.force_authenticate(self.trip.driver.user)
        self.assertEqual(self.client.post('/transport/api/driver/memberships/', {'rank_id': 1}).status_code, 404)
        self.assertEqual(self.client.get('/transport/api/admin/driver-memberships/').status_code, 404)
        self.client.force_authenticate(self.operator)
        self.assertEqual(self.client.post('/transport/api/request-rank/', {'rank_id': 1}).status_code, 404)
        self.assertEqual(self.client.get('/transport/api/admin/pending-memberships/').status_code, 404)

    def test_automatic_start_at_scheduled_time_preserves_unboarded_bookings(self):
        from .services.scheduled_departures import start_due_trips
        now = timezone.now()
        due = timezone.localtime(now) - timedelta(minutes=1)
        self.trip.departure_date = due.date()
        self.trip.expected_departure_time = due.time().replace(microsecond=0)
        self.trip.status = Trip.Status.BOARDING
        self.trip.assets_verified_at = now
        self.trip.save()
        booking = Booking.objects.create(trip=self.trip, passenger=self.passenger, status=Booking.Status.RESERVED)
        self.assertEqual(start_due_trips(now), [self.trip.pk])
        self.assertEqual(start_due_trips(now), [])
        self.trip.refresh_from_db(); booking.refresh_from_db()
        self.assertEqual(self.trip.status, Trip.Status.IN_PROGRESS)
        self.assertIsNotNone(self.trip.actual_departure_time)
        self.assertEqual(booking.status, Booking.Status.RESERVED)

    def test_unverified_trip_does_not_auto_start(self):
        from .services.scheduled_departures import start_due_trips
        now = timezone.now()
        due = timezone.localtime(now) - timedelta(minutes=1)
        self.trip.departure_date = due.date()
        self.trip.expected_departure_time = due.time().replace(microsecond=0)
        self.trip.status = Trip.Status.BOARDING
        self.trip.assets_verified_at = None
        self.trip.save()
        self.assertEqual(start_due_trips(now), [])
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.status, Trip.Status.BOARDING)

    def test_driver_location_requires_assigned_vehicle_and_prompt_window(self):
        now_local = timezone.localtime(timezone.now())
        later = now_local + timedelta(minutes=30)
        self.trip.departure_date = later.date()
        self.trip.expected_departure_time = later.time().replace(microsecond=0)
        self.trip.status = Trip.Status.SCHEDULED
        self.trip.save()
        self.client.force_authenticate(self.trip.driver.user)
        endpoint = f'/transport/api/driver/vehicle/{self.trip.vehicle_id}/location/'
        payload = {'trip_id': self.trip.pk, 'lat': -28.8, 'lng': 31.9}
        self.assertEqual(self.client.post(endpoint, payload, format='json').status_code, 400)
        other = Vehicle.objects.create(plate_number='WRONG-VEHICLE')
        other_endpoint = f'/transport/api/driver/vehicle/{other.id}/location/'
        self.assertEqual(self.client.post(other_endpoint, payload, format='json').status_code, 403)
        soon = now_local + timedelta(minutes=5)
        self.trip.departure_date = soon.date()
        self.trip.expected_departure_time = soon.time().replace(microsecond=0)
        self.trip.save()
        self.assertEqual(self.client.post(endpoint, payload, format='json').status_code, 200)

    def test_driver_complaints_endpoint_removed(self):
        self.client.force_authenticate(self.trip.driver.user)
        self.assertEqual(self.client.get("/transport/api/driver/feedback/").status_code, 404)

    def test_queue_expiry_boundary_and_future_trip_protection(self):
        from .models import QueueEntry
        from .services.queue_expiry import expire_queues
        from datetime import timedelta
        now = timezone.now()
        e = QueueEntry.objects.create(rank=self.trip.route.departure, vehicle=self.trip.vehicle, position=1)
        e2 = QueueEntry.objects.create(rank=self.trip.route.departure, vehicle=self.trip.vehicle, position=2)
        QueueEntry.objects.filter(pk=e.pk).update(added_at=now-timedelta(days=1))
        self.trip.departure_date = timezone.localdate()-timedelta(days=2); self.trip.save()
        Trip.objects.filter(pk=self.trip.pk).update(created_at=now-timedelta(days=2))
        booking = Booking.objects.create(trip=self.trip, passenger=self.passenger)
        result = expire_queues(now)
        self.assertEqual(result, {'queue_entries': 1, 'trips': 1})
        e.refresh_from_db(); e2.refresh_from_db(); booking.refresh_from_db(); self.trip.refresh_from_db()
        self.assertFalse(e.active); self.assertEqual(e2.position, 1)
        self.assertEqual(self.trip.status, 'expired'); self.assertEqual(booking.status, 'no_show')
        self.assertEqual(expire_queues(now), {'queue_entries': 0, 'trips': 0})
        future = Trip.objects.create(operator=self.op, route=self.trip.route, departure_date=timezone.localdate()+timedelta(days=4), trip_code='FUTURE')
        Trip.objects.filter(pk=future.pk).update(created_at=now-timedelta(days=2))
        expire_queues(now); future.refresh_from_db(); self.assertEqual(future.status, 'scheduled')
        self.client.force_authenticate(self.operator)
        self.assertEqual(self.post('engage').status_code, 400)

    def test_schedule_trip_serializes_expiry_and_checks_driver_membership(self):
        from .models import OperatorAtRank, DriverAtRank
        OperatorAtRank.objects.create(operator=self.op, rank=self.trip.route.departure, status="active")
        self.client.force_authenticate(self.admin)
        body = {"route_id": self.trip.route_id, "operator_id": self.op.pk,
            "departure_date": timezone.localdate().isoformat(), "expected_departure_time": "10:00",
            "driver_id": self.trip.driver_id, "vehicle_id": self.trip.vehicle_id}
        response = self.client.post('/transport/api/admin/schedule-trip/', body, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNotNone(response.data['queue_expires_at'])
        DriverAtRank.objects.filter(driver=self.trip.driver).delete()
        self.assertEqual(self.client.post('/transport/api/admin/schedule-trip/', body, format='json').status_code, 400)

    def test_boarded_trip_never_expires(self):
        from .services.queue_expiry import expire_queues
        from datetime import timedelta
        self.ready()
        booking = Booking.objects.create(trip=self.trip, passenger=self.passenger)
        self.post(f'bookings/{booking.id}/verify')
        Trip.objects.filter(pk=self.trip.pk).update(created_at=timezone.now()-timedelta(days=3), departure_date=timezone.localdate()-timedelta(days=3))
        expire_queues(); self.trip.refresh_from_db(); self.assertEqual(self.trip.status, 'boarding')


class RoutingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.body = {'origin': {'lat': -28.844, 'lng': 31.895}, 'destination': {'lat': -28.748, 'lng': 31.893}}

    def test_ors_geojson_coordinates_and_auth(self):
        from unittest.mock import patch, Mock
        from .services.routing_service import get_driving_route
        response = Mock(status_code=200)
        response.json.return_value = {'features': [{'properties': {'summary': {'distance': 12000, 'duration': 900}}, 'geometry': {'coordinates': [[31.895,-28.844], [31.91,-28.81], [31.893,-28.748]]}}]}
        with self.settings(ORS_API_KEY='test-key', ROUTING_SERVICE_URL=''), patch('transport.services.routing_service.requests.post', return_value=response) as post:
            result = get_driving_route((-28.844,31.895), (-28.748,31.893))
            self.assertEqual(result['geometry'][0], [-28.844,31.895]); self.assertEqual(len(result['geometry']), 3)
            self.assertEqual(result['source'], 'ors')
            self.assertEqual(post.call_args.kwargs['headers']['Authorization'], 'test-key')
            self.assertTrue(post.call_args.args[0].endswith('/geojson'))

    def test_osrm_returns_road_geometry(self):
        from unittest.mock import patch, Mock
        response = Mock(status_code=200)
        response.json.return_value = {'code': 'Ok', 'routes': [{'distance': 12000, 'duration': 900, 'geometry': {'coordinates': [[31.895,-28.844], [31.91,-28.81], [31.893,-28.748]]}}]}
        with self.settings(ORS_API_KEY='', ROUTING_SERVICE_URL='https://routing.test'), patch('transport.services.routing_service.requests.get', return_value=response):
            r = self.client.post('/transport/api/routing/directions/', self.body, format='json')
            self.assertEqual(r.status_code, 200, r.data)
            self.assertEqual(r.data['source'], 'osrm'); self.assertEqual(len(r.data['geometry']), 3)

    def test_provider_failure_is_not_a_straight_line(self):
        from unittest.mock import patch
        with self.settings(ORS_API_KEY='', ROUTING_SERVICE_URL='https://routing.test'), patch('transport.services.routing_service.requests.get', side_effect=TimeoutError()):
            r = self.client.post('/transport/api/routing/directions/', self.body, format='json')
            self.assertEqual(r.status_code, 502); self.assertNotIn('geometry', r.data)

    def test_invalid_coordinates_rejected_without_provider_call(self):
        from unittest.mock import patch
        with patch('transport.services.routing_service.requests.get') as get:
            for value in [None, 'NaN', 200, 'not-a-number']:
                body = {'origin': {'lat': value, 'lng': 31}, 'destination': {'lat': -28, 'lng': 32}}
                r = self.client.post('/transport/api/routing/directions/', body, format='json')
                self.assertEqual(r.status_code, 400, r.data)
            get.assert_not_called()


class PaymentAndTrackingTests(TripWorkflowTests):
    """Payment gating, cash verification, notifications and the GPS no-show rule."""

    def setUp(self):
        super().setUp()
        from accounts.models import PassengerProfile

        PassengerProfile.objects.create(
            user=self.passenger,
            next_of_kin_name='Family Contact',
            next_of_kin_phone='0822222222',
        )
        # Real coordinates for the departure rank so GPS distance is meaningful.
        departure = self.trip.route.departure
        departure.latitude = -28.742
        departure.longitude = 31.893
        departure.save()
        self.driver_user = self.trip.driver.user

    # ---- helpers ----
    def book(self, **overrides):
        payload = {'trip_id': self.trip.pk, **CARD_PAYMENT}
        payload.update(overrides)
        return self.client.post('/transport/api/my-bookings/', payload, format='json')

    def set_departure_in(self, minutes):
        from datetime import timedelta
        target = timezone.localtime() + timedelta(minutes=minutes)
        self.trip.departure_date = target.date()
        self.trip.expected_departure_time = target.time().replace(microsecond=0)
        self.trip.save()

    # ---- payment gating ----
    def test_booking_requires_a_payment_method(self):
        self.client.force_authenticate(self.passenger)
        response = self.client.post(
            '/transport/api/my-bookings/', {'trip_id': self.trip.pk}, format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('payment_method', response.data)
        self.assertEqual(Booking.objects.count(), 0)

    def test_card_details_are_validated_like_the_frontend(self):
        self.client.force_authenticate(self.passenger)
        for bad in (
            {'card_number': '411111111111'},
            {'card_expiry': '2030-12'},
            {'card_cvv': '1'},
            {'card_holder_name': '   '},
        ):
            response = self.book(**bad)
            self.assertEqual(response.status_code, 400, bad)
        self.assertEqual(Booking.objects.count(), 0)

    def test_card_payment_verifies_the_passenger_and_creates_a_notification(self):
        self.client.force_authenticate(self.passenger)
        response = self.book()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['payment_status'], 'paid')
        self.assertEqual(response.data['passenger_display_status'], 'verified')
        self.assertEqual(response.data['card_last_four'], '1111')
        self.assertIn('verified passenger', response.data['notification'])

        feed = self.client.get('/transport/api/my-notifications/').data
        kinds = [item['kind'] for item in feed]
        self.assertIn('booking_verified', kinds)
        verified = next(item for item in feed if item['kind'] == 'booking_verified')
        self.assertTrue(verified['proof'])
        self.assertEqual(verified['trip_code'], 'TEST')

    def test_cash_booking_stays_pending_until_the_operator_verifies_it(self):
        self.client.force_authenticate(self.passenger)
        response = self.book(payment_method='cash')
        self.assertEqual(response.status_code, 201, response.data)
        booking_id = response.data['id']
        self.assertEqual(response.data['payment_status'], 'pending')
        self.assertEqual(response.data['passenger_display_status'], 'pending')

        feed = self.client.get('/transport/api/my-notifications/').data
        self.assertIn('cash_pending', [item['kind'] for item in feed])

        url = f'/transport/api/my-trips/{self.trip.pk}/bookings/{booking_id}/verify-cash/'

        # A different operator must not be able to touch this trip.
        other_user = User.objects.create_user('0820000009', 'Passw0rd!', role='operator')
        association = RankCode.objects.create(
            code='OTHER', association_name='Other', operating_region='KZN'
        )
        OperatorProfile.objects.create(user=other_user, association=association)
        self.client.force_authenticate(other_user)
        self.assertEqual(self.client.post(url).status_code, 404)

        self.client.force_authenticate(self.operator)
        response = self.client.post(url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['passenger_display_status'], 'verified')
        booking = Booking.objects.get(pk=booking_id)
        self.assertEqual(booking.payment_status, Booking.PaymentStatus.PAID)
        self.assertIsNotNone(booking.payment_verified_at)

    # ---- cancellation policy ----
    def test_cancel_within_one_hour_charges_a_30_percent_fee(self):
        self.set_departure_in(30)
        self.client.force_authenticate(self.passenger)
        booking_id = self.book().data['id']
        response = self.client.post(f'/transport/api/my-bookings/{booking_id}/cancel/')
        self.assertEqual(response.status_code, 200, response.data)
        refund = response.data['refund']
        self.assertEqual(float(refund['cancellation_fee']), 7.5)
        self.assertEqual(float(refund['refund_amount']), 17.5)
        self.assertEqual(response.data['payment_status'], 'partial_refund')

    def test_cancel_more_than_one_hour_before_departure_is_a_full_refund(self):
        self.set_departure_in(120)
        self.client.force_authenticate(self.passenger)
        booking_id = self.book().data['id']
        response = self.client.post(f'/transport/api/my-bookings/{booking_id}/cancel/')
        self.assertEqual(response.status_code, 200, response.data)
        refund = response.data['refund']
        self.assertEqual(float(refund['cancellation_fee']), 0.0)
        self.assertEqual(float(refund['refund_amount']), 25.0)
        self.assertEqual(response.data['payment_status'], 'refunded')

    # ---- driver GPS / no-show ----
    def test_driver_ping_at_the_rank_blocks_no_show_refunds(self):
        self.client.force_authenticate(self.passenger)
        booking_id = self.book().data['id']

        self.client.force_authenticate(self.driver_user)
        response = self.client.post(
            f'/transport/api/driver/vehicle/{self.trip.vehicle_id}/location/',
            {'lat': -28.7429, 'lng': 31.8930, 'trip_id': self.trip.pk},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['at_rank'])
        self.assertEqual(response.data['route_status'], 'at_rank')
        self.assertLess(response.data['distance_from_rank_m'], 350)

        self.trip.refresh_from_db()
        self.assertIsNotNone(self.trip.driver_at_rank_at)

        self.set_departure_in(-16)
        # The GPS arrival happened before the scheduled cutoff in this test.
        self.trip.driver_at_rank_at = timezone.now() - timedelta(minutes=20)
        self.trip.save(update_fields=['driver_at_rank_at'])
        self.client.force_authenticate(self.operator)
        response = self.client.post(
            f'/transport/api/my-trips/{self.trip.pk}/driver-no-show-refunds/',
            {},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['refunded'], [])
        booking = Booking.objects.get(pk=booking_id)
        self.assertEqual(booking.payment_status, Booking.PaymentStatus.PAID)

    def test_driver_never_at_the_rank_refunds_paid_passengers(self):
        self.client.force_authenticate(self.passenger)
        booking_id = self.book().data['id']

        self.set_departure_in(-16)
        self.client.force_authenticate(self.operator)
        response = self.client.post(
            f'/transport/api/my-trips/{self.trip.pk}/driver-no-show-refunds/',
            {},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['refunded'], [booking_id])
        booking = Booking.objects.get(pk=booking_id)
        self.assertEqual(booking.payment_status, Booking.PaymentStatus.REFUNDED)
        self.assertEqual(booking.refund_amount, booking.fare_amount)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.driver_location_status, 'no_show')

    def test_location_ping_rejects_other_drivers_and_bad_coordinates(self):
        other = User.objects.create_user('0830000002', 'Passw0rd!', role='driver')
        DriverProfile.objects.create(user=other, license_number='OTHER', status='verified')
        url = f'/transport/api/driver/vehicle/{self.trip.vehicle_id}/location/'

        self.client.force_authenticate(other)
        response = self.client.post(
            url, {'lat': -28.742, 'lng': 31.893, 'trip_id': self.trip.pk}, format='json'
        )
        self.assertEqual(response.status_code, 403)

        self.client.force_authenticate(self.driver_user)
        for bad in ({'lat': 'NaN', 'lng': 31.893}, {'lat': -28.742, 'lng': 500}):
            response = self.client.post(
                url, {**bad, 'trip_id': self.trip.pk}, format='json'
            )
            self.assertEqual(response.status_code, 400, bad)

    # ---- trip details ----
    def test_trip_detail_endpoint_exposes_route_driver_and_rating(self):
        response = self.client.get(f'/transport/api/trips/{self.trip.pk}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['trip_code'], 'TEST')
        self.assertEqual(response.data['route']['departure']['name'], 'Rank')
        self.assertIn('driver_rating', response.data)
        self.assertIn('duration_minutes', response.data)
        self.assertIn('driver_checked_in', response.data)
        self.assertEqual(self.client.get('/transport/api/trips/999999/').status_code, 404)


class AnnouncementRankScopeAndNotificationPriorityTests(TripWorkflowTests):
    """Announcements are rank-scoped for staff; notifications lead with the most urgent."""

    def setUp(self):
        super().setUp()
        self.other_association = RankCode.objects.create(
            code='OTHER', association_name='Other Association', operating_region='KZN'
        )
        other_user = User.objects.create_user('0820000002', 'Passw0rd!', role='operator')
        self.other_operator = OperatorProfile.objects.create(
            user=other_user, association=self.other_association
        )
        self.own_rank = self.trip.route.departure
        OperatorAtRank.objects.create(
            operator=self.op, rank=self.own_rank, status=OperatorAtRank.Status.ACTIVE
        )
        self.other_rank = Rank.objects.create(name='Other Rank')
        OperatorAtRank.objects.create(
            operator=self.other_operator,
            rank=self.other_rank,
            status=OperatorAtRank.Status.ACTIVE,
        )
        self.ann_own = Announcement.objects.create(
            operator=self.op, title='Own rank update', body='Own rank', created_by=self.operator
        )
        self.ann_other = Announcement.objects.create(
            operator=self.other_operator, title='Other rank update', body='Other rank', created_by=other_user
        )
        self.ann_central = Announcement.objects.create(
            title='Central update', body='All ranks', created_by=self.operator
        )

    def _ids(self):
        return {item['id'] for item in self.client.get('/transport/api/announcements/').data}

    def test_operator_sees_own_rank_and_central_announcements_only(self):
        self.client.force_authenticate(self.operator)
        ids = self._ids()
        self.assertIn(self.ann_own.id, ids)
        self.assertIn(self.ann_central.id, ids)
        self.assertNotIn(self.ann_other.id, ids)

    def test_driver_sees_announcements_for_their_own_association_only(self):
        driver_user = User.objects.create_user('0830000009', 'Passw0rd!', role='driver')
        driver = DriverProfile.objects.create(
            user=driver_user,
            license_number='DRV009',
            status='verified',
            association=self.op.association,
        )
        DriverAtRank.objects.create(
            driver=driver, rank=self.own_rank, status=OperatorAtRank.Status.ACTIVE
        )
        self.client.force_authenticate(driver_user)
        ids = self._ids()
        self.assertIn(self.ann_own.id, ids)
        self.assertIn(self.ann_central.id, ids)
        self.assertNotIn(self.ann_other.id, ids)

    def test_passenger_and_guest_see_every_active_announcement(self):
        for viewer in (self.passenger, None):
            self.client.force_authenticate(viewer)
            ids = self._ids()
            self.assertEqual(ids, {self.ann_own.id, self.ann_other.id, self.ann_central.id})

    def test_expired_announcements_are_hidden(self):
        expired = Announcement.objects.create(
            title='Expired', body='Old', created_by=self.operator,
            expires_at=timezone.now() - timedelta(hours=1),
        )
        self.client.force_authenticate(None)
        self.assertNotIn(expired.id, self._ids())

    def test_cash_pending_notification_sorts_before_verified_receipt(self):
        self.ready()
        self.client.force_authenticate(self.passenger)
        card = self.client.post(
            '/transport/api/my-bookings/', {'trip_id': self.trip.pk, **CARD_PAYMENT}, format='json'
        )
        self.assertEqual(card.status_code, 201, card.data)

        cash_trip = Trip.objects.create(
            operator=self.op,
            route=self.trip.route,
            vehicle=Vehicle.objects.create(plate_number='CASH1'),
            departure_date=timezone.localdate() + timedelta(days=1),
            trip_code='CASH1',
            seat_capacity=2,
        )
        cash = self.client.post(
            '/transport/api/my-bookings/',
            {'trip_id': cash_trip.pk, 'payment_method': 'cash'},
            format='json',
        )
        self.assertEqual(cash.status_code, 201, cash.data)

        feed = self.client.get('/transport/api/my-notifications/').data
        self.assertEqual(feed[0]['kind'], 'cash_pending')
        self.assertEqual(feed[0]['booking_id'], cash.data['id'])

        first = self.client.get('/transport/api/my-notifications/', {'limit': 1, 'offset': 0}).data
        second = self.client.get('/transport/api/my-notifications/', {'limit': 1, 'offset': 1}).data
        self.assertEqual(len(first), 1)
        self.assertEqual(len(second), 1)
        self.assertNotEqual(first[0]['id'], second[0]['id'])
        self.assertEqual(
            self.client.get('/transport/api/my-notifications/', {'limit': 'many'}).status_code, 400
        )

class DriverRankAnnouncementsTests(TripWorkflowTests):
    """Driver announcements must be rank-scoped; passenger feed remains public."""

    def setUp(self):
        super().setUp()
        self.ungoye = self.trip.route.departure
        self.ungoye.name = 'Ungoye Main Rank'
        self.ungoye.save(update_fields=['name'])
        self.durban = Rank.objects.create(name='Durban Main Rank')
        OperatorAtRank.objects.create(
            operator=self.op, rank=self.ungoye, status=OperatorAtRank.Status.ACTIVE,
        )
        self.durban_operator_user = User.objects.create_user(
            '0829999999', 'Passw0rd!', role='operator'
        )
        durban_association = RankCode.objects.create(
            code='DBN', association_name='Durban Transport', operating_region='KZN'
        )
        self.durban_operator = OperatorProfile.objects.create(
            user=self.durban_operator_user, association=durban_association
        )
        OperatorAtRank.objects.create(
            operator=self.durban_operator, rank=self.durban, status=OperatorAtRank.Status.ACTIVE,
        )
        self.ungoye_driver_user = User.objects.create_user(
            '0831111111', 'Passw0rd!', role='driver'
        )
        self.ungoye_driver = DriverProfile.objects.create(
            user=self.ungoye_driver_user, license_number='DRIVINGUNG', status='verified',
        )
        DriverAtRank.objects.create(
            driver=self.ungoye_driver, rank=self.ungoye,
            status=OperatorAtRank.Status.ACTIVE,
        )
        self.durban_driver_user = User.objects.create_user(
            '0832222222', 'Passw0rd!', role='driver'
        )
        self.durban_driver = DriverProfile.objects.create(
            user=self.durban_driver_user, license_number='DRIVINGDBN', status='verified',
        )
        DriverAtRank.objects.create(
            driver=self.durban_driver, rank=self.durban,
            status=OperatorAtRank.Status.ACTIVE,
        )

    def _announce_ids(self, user):
        self.client.force_authenticate(user)
        response = self.client.get('/transport/api/announcements/')
        self.assertEqual(response.status_code, 200)
        return {item['id'] for item in response.data}

    def test_operator_can_publish_only_to_their_active_rank(self):
        self.client.force_authenticate(self.operator)
        selected = self.client.get('/transport/api/my-announcement-ranks/')
        self.assertEqual(selected.status_code, 200)
        self.assertEqual([item['id'] for item in selected.data], [self.ungoye.id])
        created = self.client.post('/transport/api/my-announcements/', {
            'title': 'Ungoye schedule change', 'body': 'Departure changes',
            'rank_id': self.ungoye.id,
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['rank_name'], 'Ungoye Main Rank')
        self.assertEqual(created.data['source_name'], self.op.association.association_name)
        self.assertIn(created.data['id'], self._announce_ids(self.ungoye_driver_user))
        self.assertNotIn(created.data['id'], self._announce_ids(self.durban_driver_user))

        self.client.force_authenticate(self.operator)
        wrong = self.client.post('/transport/api/my-announcements/', {
            'title': 'Should not publish', 'body': 'Other rank',
            'rank_id': self.durban.id,
        }, format='json')
        self.assertEqual(wrong.status_code, 400)

    def test_route_cannot_change_the_publishing_rank(self):
        other_route = Route.objects.create(
            departure=self.durban, destination=Destination.objects.create(name='Port'),
            fare='50.00',
        )
        self.client.force_authenticate(self.operator)
        response = self.client.post('/transport/api/my-announcements/', {
            'title': 'Wrong route', 'body': 'A rank mismatch',
            'rank_id': self.ungoye.id, 'route_id': other_route.id,
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_rank_admin_and_global_announcements(self):
        from accounts.models import AdminProfile
        rank_admin_user = User.objects.create_user('0843333333', 'Passw0rd!', role='admin')
        AdminProfile.objects.create(user=rank_admin_user, institution_name='Rank office', rank=self.ungoye)
        old_style_admin = Announcement.objects.create(
            title='Rank admin update', body='At Ungoye', created_by=rank_admin_user,
        )
        explicit_admin = Announcement.objects.create(
            title='Rank targeted', body='At Durban', created_by=rank_admin_user,
            rank=self.durban,
        )
        central = Announcement.objects.create(
            title='System-wide announcement', body='All drivers',
        )
        ungoye_ids = self._announce_ids(self.ungoye_driver_user)
        self.assertIn(old_style_admin.id, ungoye_ids)
        self.assertNotIn(explicit_admin.id, ungoye_ids)
        self.assertIn(central.id, ungoye_ids)
        durban_ids = self._announce_ids(self.durban_driver_user)
        self.assertNotIn(old_style_admin.id, durban_ids)
        self.assertIn(explicit_admin.id, durban_ids)
        self.assertIn(central.id, durban_ids)

        passenger_ids = self._announce_ids(self.passenger)
        self.assertIn(old_style_admin.id, passenger_ids)
        self.assertIn(explicit_admin.id, passenger_ids)
        self.assertIn(central.id, passenger_ids)

    def test_inactive_unapproved_driver_not_allowed_rank_notices(self):
        pending = User.objects.create_user('0834444444', 'Passw0rd!', role='driver')
        profile = DriverProfile.objects.create(user=pending, license_number='DRV-PEND')
        DriverAtRank.objects.create(
            driver=profile, rank=self.ungoye, status=OperatorAtRank.Status.PENDING,
        )
        notice = Announcement.objects.create(rank=self.ungoye, title='Targeted', body='Only Ungoye')
        self.assertNotIn(notice.id, self._announce_ids(pending))

    def test_old_operator_notice_uses_approved_rank(self):
        legacy = Announcement.objects.create(
            operator=self.op, title='Old version announcement', body='Before rank field',
            created_by=self.operator,
        )
        self.assertIn(legacy.id, self._announce_ids(self.ungoye_driver_user))
        self.assertNotIn(legacy.id, self._announce_ids(self.durban_driver_user))

    def test_expired_and_deactivated_announcements_are_hidden(self):
        old = Announcement.objects.create(
            rank=self.ungoye, title='Expired', body='Not shown',
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        inactive = Announcement.objects.create(
            rank=self.ungoye, title='Inactive', body='Not shown', active=False,
        )
        ids = self._announce_ids(self.ungoye_driver_user)
        self.assertNotIn(old.id, ids)
        self.assertNotIn(inactive.id, ids)

    def test_rank_admin_publishes_for_own_rank_only(self):
        from accounts.models import AdminProfile
        admin_user = User.objects.create_user('0899999991', 'Passw0rd!', role='admin')
        AdminProfile.objects.create(user=admin_user, institution_name='Ungoye office', rank=self.ungoye)
        self.client.force_authenticate(admin_user)
        created = self.client.post('/transport/api/admin/announcements/', {
            'title': 'Ungoye boarding notice', 'body': 'Please check the boarding area',
            'rank_id': self.durban.id,  # malicious cross-rank request is ignored
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['rank_id'], self.ungoye.id)
        self.assertIn(created.data['id'], self._announce_ids(self.ungoye_driver_user))
        self.assertNotIn(created.data['id'], self._announce_ids(self.durban_driver_user))



class AutomaticDriverNoShowRefundTests(TripWorkflowTests):
    """New driver GPS grace-period policy: T+15, whole fare, once per trip."""

    def setUp(self):
        super().setUp()
        origin = self.trip.route.departure
        origin.latitude = '-28.742000'
        origin.longitude = '31.893000'
        origin.save(update_fields=['latitude', 'longitude'])
        self.driver_user = self.trip.driver.user

    def set_time(self, now, minutes_from_now):
        departure = timezone.localtime(now + timedelta(minutes=minutes_from_now))
        self.trip.departure_date = departure.date()
        self.trip.expected_departure_time = departure.time().replace(microsecond=0)
        self.trip.save(update_fields=['departure_date', 'expected_departure_time'])

    def test_full_refund_at_t_plus_15_and_idempotent(self):
        from .services.auto_no_show import refund_overdue_trip
        now = timezone.now().replace(microsecond=0)
        self.set_time(now, -16)
        paid = Booking.objects.create(
            trip=self.trip, passenger=self.passenger,
            payment_method=Booking.PaymentMethod.CARD,
            payment_status=Booking.PaymentStatus.PAID,
            fare_amount='25.00', amount_paid='25.00',
        )
        companion = Booking.objects.create(trip=self.trip, group_leader=paid,
                                            companion_first_name='One')
        unpaid = Booking.objects.create(trip=self.trip, walk_in_name='Cash',
            payment_method=Booking.PaymentMethod.CASH,
            payment_status=Booking.PaymentStatus.PENDING)
        result = refund_overdue_trip(self.trip.id, now=now)
        self.assertEqual(result['status'], 'refunded')
        self.assertEqual(result['refunded'], [paid.id])
        paid.refresh_from_db(); unpaid.refresh_from_db(); companion.refresh_from_db(); self.trip.refresh_from_db()
        self.assertEqual(str(paid.refund_amount), '25.00')
        self.assertEqual(str(paid.cancellation_fee), '0.00')
        self.assertEqual(paid.payment_status, 'refunded')
        self.assertEqual(paid.status, 'cancelled')
        self.assertEqual(unpaid.status, 'cancelled')
        self.assertEqual(companion.status, 'cancelled')
        self.assertEqual(self.trip.status, 'flagged')
        self.assertEqual(self.trip.driver_location_status, 'no_show')
        self.assertEqual(refund_overdue_trip(self.trip.id, now=now)['status'], 'already_processed')
        paid.refresh_from_db(); self.assertEqual(str(paid.refund_amount), '25.00')

    def test_no_refund_before_grace_expires(self):
        from .services.auto_no_show import refund_overdue_trip
        now = timezone.now().replace(microsecond=0)
        self.set_time(now, -14)
        booking = Booking.objects.create(trip=self.trip, passenger=self.passenger,
            payment_status='paid', fare_amount='25.00', amount_paid='25.00')
        self.assertEqual(refund_overdue_trip(self.trip.id, now=now)['status'], 'too_early')
        booking.refresh_from_db(); self.assertEqual(booking.payment_status, 'paid')

    def test_valid_rank_check_in_prevents_refund(self):
        from .services.auto_no_show import refund_overdue_trip
        from .services.driver_location import record_driver_location
        now = timezone.now().replace(microsecond=0)
        self.set_time(now, 10)
        record_driver_location(self.trip, -28.742, 31.893)
        self.set_time(now, -16)
        booking = Booking.objects.create(trip=self.trip, passenger=self.passenger,
            payment_status='paid', fare_amount='25.00', amount_paid='25.00')
        self.assertEqual(refund_overdue_trip(self.trip.id, now=now)['status'], 'checked_in')
        booking.refresh_from_db(); self.assertEqual(booking.payment_status, 'paid')

    def test_operator_cannot_refund_early_with_force_argument(self):
        now = timezone.now().replace(microsecond=0)
        self.set_time(now, 10)
        self.client.force_authenticate(self.operator)
        url = f'/transport/api/my-trips/{self.trip.pk}/driver-no-show-refunds/'
        r = self.client.post(url, {'force': True}, format='json')
        self.assertEqual(r.status_code, 400, r.data)

    def test_driver_cannot_trigger_refunds(self):
        now = timezone.now().replace(microsecond=0)
        self.set_time(now, -16)
        self.client.force_authenticate(self.driver_user)
        url = f'/transport/api/my-trips/{self.trip.pk}/driver-no-show-refunds/'
        r = self.client.post(url, {'force': True}, format='json')
        self.assertEqual(r.status_code, 403, r.data)

    def test_scheduled_job_processes_trip_without_open_dashboard(self):
        from .services.scheduled_departures import start_due_trips
        now = timezone.now().replace(microsecond=0)
        self.set_time(now, -16)
        Booking.objects.create(trip=self.trip, passenger=self.passenger,
            payment_status='paid', fare_amount='25.00', amount_paid='25.00')
        self.assertEqual(start_due_trips(now), [])  # Was not engaged and ready.
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.status, 'flagged')
        self.assertEqual(self.trip.bookings.first().payment_status, 'refunded')
