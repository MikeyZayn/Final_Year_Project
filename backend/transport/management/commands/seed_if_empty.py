import os
from django.core.management.base import BaseCommand
from transport.models import Route


class Command(BaseCommand):
    help = 'Seeds the database if empty, or if FORCE_SEED is set'

    def handle(self, *args, **options):
        force = os.environ.get('FORCE_SEED', '').lower() in ('true', '1', 'yes')

        if Route.objects.exists() and not force:
            self.stdout.write(self.style.WARNING(
                'Database already seeded — skipping. Set FORCE_SEED=true to force.'
            ))
            return

        if force:
            self.stdout.write(self.style.WARNING('FORCE_SEED set. Re-seeding...'))
        else:
            self.stdout.write('Database is empty. Running seed...')

        namespace = {'__name__': '__seed__', '__file__': 'seed.py'}
        with open('seed.py', encoding='utf-8') as f:
            code = compile(f.read(), 'seed.py', 'exec')
        exec(code, namespace)

        from init_dot_registry import DB_PATH, main as init_registry
        from django.core.management import call_command
        if not DB_PATH.exists():
            init_registry()
        call_command('prepare_demo_drivers')
        self.stdout.write(self.style.SUCCESS('Seed complete.'))