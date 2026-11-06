from django.core.management.base import BaseCommand
from transport.services.scheduled_departures import start_due_trips

class Command(BaseCommand):
    help = 'Start verified departures, process driver no-show refunds, and cancel overdue unfinished trips.'

    def handle(self, *args, **options):
        changed = start_due_trips()
        self.stdout.write(f'Automatically started {len(changed)} trip(s): {changed}')
