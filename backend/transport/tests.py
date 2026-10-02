from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import User, RankCode, OperatorProfile, DriverProfile
from .models import Rank, Destination, Route, Vehicle, Trip, Booking, VerificationCode, Feedback


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
        r = self.client.post('/transport/api/my-bookings/', {'trip_id': self.trip.pk}, format='json')
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
        endpoints[admin] = ['admin/me', 'admin/pending-memberships', 'admin/rank-trips', 'admin/queue', 'admin/users', 'admin/drivers']
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
        return self.client.post('/transport/api/my-bookings/', {'trip_id': self.trip.pk, 'companions': companions or [{'first_name': 'Nandi', 'last_name': 'Dube'}]}, format='json')

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

    def test_driver_rank_request_approval_and_scope(self):
        from accounts.models import AdminProfile
        new_rank = Rank.objects.create(name='Another rank')
        driver = self.trip.driver
        self.client.force_authenticate(driver.user)
        url = '/transport/api/driver/memberships/'
        response = self.client.post(url, {'rank_id': new_rank.pk}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        mid = response.data['id']
        self.assertEqual(self.client.post(url, {'rank_id': new_rank.pk}).status_code, 400)
        self.client.force_authenticate(self.admin)
        approve = f'/transport/api/admin/driver-memberships/{mid}/approve/'
        self.assertEqual(self.client.post(approve).status_code, 404)
        AdminProfile.objects.filter(user=self.admin).update(rank=new_rank)
        self.admin.refresh_from_db()
        self.assertEqual(self.client.get('/transport/api/admin/driver-memberships/').data[0]['id'], mid)
        self.assertEqual(self.client.post(approve).status_code, 200)
        assets = self.client.get('/transport/api/admin/available-for-rank/').data
        self.assertIn(driver.pk, [d['id'] for d in assets['drivers']])
        self.client.force_authenticate(driver.user)
        active = self.client.get(url).data
        self.assertEqual(sum(m['status']=='active' for m in active), 2)
        self.client.force_authenticate(self.passenger)
        self.assertEqual(self.client.post(url, {'rank_id': new_rank.pk}).status_code, 403)
        self.assertEqual(self.client.post(approve).status_code, 403)

    def test_driver_rejected_request_can_be_resubmitted(self):
        from .models import DriverAtRank
        driver = self.trip.driver
        m = DriverAtRank.objects.create(driver=driver, rank=Rank.objects.create(name='Retry'), status='rejected')
        self.client.force_authenticate(driver.user)
        response = self.client.post('/transport/api/driver/memberships/', {'rank_id': m.rank_id})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['id'], m.id)
        self.assertEqual(response.data['status'], 'pending')

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
