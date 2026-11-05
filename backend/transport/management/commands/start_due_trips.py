from django.core.management.base import BaseCommand
from transport.services.scheduled_departures import start_due_trips

class Command(BaseCommand):
    help = 'Start eligible trips and process driver no-show refunds after the 15-minute grace period.'

    def handle(self, *args, **options):
        changed = start_due_trips()
        self.stdout.write(f'Automatically started {len(changed)} trip(s): {changed}')
