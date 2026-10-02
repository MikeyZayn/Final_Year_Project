from django.core.management.base import BaseCommand
from accounts.models import DriverProfile
from accounts.dot_adapter import verify_driver
from init_dot_registry import SEED

class Command(BaseCommand):
    help = 'Match the six seeded demo drivers to simulated DOT IDs; preserve other accounts.'

    def handle(self, *args, **options):
        for index, fixture in enumerate(SEED, start=1):
            d = DriverProfile.objects.filter(user__phone=f'083000000{index}', license_number=fixture[3]).first()
            if not d:
                continue
            d.id_number = fixture[0]
            result = verify_driver(d.id_number, d.license_number)
            d.external_verification_status = ('verified' if result['verified'] else 'unavailable' if result['reason'] == 'dot_unavailable' else 'suspended' if result['reason'] in ['license_suspended', 'license_revoked'] else 'failed')
            if result['verified']:
                d.status = 'verified'
            elif result['reason'] != 'dot_unavailable':
                d.status = 'rejected'
            d.external_verification_reason = result['reason']
            if result['record']:
                d.pdp_number = result['record'].get('pdp_number') or ''
            d.save()
            self.stdout.write(f'{d.user.first_name}: {d.status} / {d.external_verification_status}')
        existing = DriverProfile.objects.filter(user__phone='0711111111', id_number='9203035800090', license_number='NDL 004').first()
        if existing:
            result = verify_driver(existing.id_number, existing.license_number)
            if result['verified']:
                existing.external_verification_status = 'verified'
                existing.external_verification_reason = 'ok'
                existing.pdp_number = result['record'].get('pdp_number') or ''
                existing.status = 'verified'
                existing.save()
        from transport.models import Trip
        count = Trip.objects.filter(trip_code__startswith='DEMO-', status='scheduled', driver__external_verification_status__in=['failed', 'suspended'], bookings__isnull=True).update(status='cancelled')
        self.stdout.write(f'Cancelled {count} unbooked demo departures assigned to failed drivers; historical records preserved.')
