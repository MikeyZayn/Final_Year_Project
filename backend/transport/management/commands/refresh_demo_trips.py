from django.core.management.base import BaseCommand
from django.utils import timezone
from transport.models import Trip, DriverAtRank


class Command(BaseCommand):
    help = 'Add dated demo departures from existing trip assignments without deleting any records.'

    def handle(self, *args, **options):
        today = timezone.localdate()
        templates = list(Trip.objects.filter(driver__status='verified', vehicle__roadworthy=True).exclude(driver__external_verification_status__in=['failed', 'suspended']).select_related('route', 'vehicle', 'driver'))
        seen = set()
        count = 0
        for template in templates:
            key = (template.operator_id, template.route_id, template.driver_id, template.vehicle_id)
            if key in seen:
                continue
            seen.add(key)
            if not DriverAtRank.objects.filter(driver_id=template.driver_id, rank_id=template.route.departure_id, status='active').exists():
                continue
            code = f'DEMO-{today:%Y%m%d}-{template.pk}'
            _, created = Trip.objects.get_or_create(trip_code=code, defaults={
                'operator_id': template.operator_id, 'route_id': template.route_id,
                'driver_id': template.driver_id, 'vehicle_id': template.vehicle_id,
                'departure_date': today, 'expected_departure_time': template.expected_departure_time,
                'seat_capacity': template.vehicle.seat_capacity, 'status': Trip.Status.SCHEDULED,
            })
            count += created
        self.stdout.write(f'Added {count} demo departures for {today}; existing records preserved.')
