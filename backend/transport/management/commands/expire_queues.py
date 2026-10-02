from django.core.management.base import BaseCommand
from transport.services.queue_expiry import expire_queues

class Command(BaseCommand):
    help = "Expire queue entries and unstarted departures after 24 hours, preserving history."
    def handle(self, *args, **options):
        self.stdout.write(str(expire_queues()))
