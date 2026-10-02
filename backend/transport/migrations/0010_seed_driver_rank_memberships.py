from django.db import migrations


def seed_existing_memberships(apps, schema_editor):
    Driver = apps.get_model('accounts', 'DriverProfile')
    Membership = apps.get_model('transport', 'DriverAtRank')
    OperatorMembership = apps.get_model('transport', 'OperatorAtRank')
    Trip = apps.get_model('transport', 'Trip')
    db = schema_editor.connection.alias
    for driver in Driver.objects.using(db).all():
        ranks = set(Trip.objects.using(db).filter(driver_id=driver.pk).values_list('route__departure_id', flat=True))
        if driver.association_id:
            ranks.update(OperatorMembership.objects.using(db).filter(operator__association_id=driver.association_id, status='active').values_list('rank_id', flat=True))
        for rank_id in ranks:
            Membership.objects.using(db).get_or_create(driver_id=driver.pk, rank_id=rank_id, defaults={'status': 'active', 'notes': 'Existing rank access carried forward during migration.'})


class Migration(migrations.Migration):
    dependencies = [('transport', '0009_booking_companion_first_name_and_more')]
    operations = [migrations.RunPython(seed_existing_memberships, migrations.RunPython.noop)]
