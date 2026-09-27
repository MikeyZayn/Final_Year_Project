from django.core.management.base import BaseCommand
from transport.models import Route


class Command(BaseCommand):
    help = 'Runs seed.py only if the database is empty'

    def handle(self, *args, **options):
        if Route.objects.exists():
            self.stdout.write(self.style.WARNING(
                'Database already seeded — skipping.'
            ))
            return
        self.stdout.write('Database is empty. Running seed...')
        exec(open('seed.py', encoding='utf-8').read())
        self.stdout.write(self.style.SUCCESS('Seed complete.'))