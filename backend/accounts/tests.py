import sqlite3
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from accounts.dot_adapter import verify_driver
from accounts.models import User, DriverProfile
from init_dot_registry import SCHEMA, SEED

class DOTAdapterTests(TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "registry.db"

        con = sqlite3.connect(self.path)
        try:
            with con:
                con.executescript(SCHEMA)
                con.executemany(
                    """
                    INSERT INTO licensed_drivers (
                        id_number,
                        first_name,
                        last_name,
                        license_number,
                        license_class,
                        pdp_number,
                        pdp_valid_until,
                        license_status,
                        issued_date,
                        license_expiry_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    SEED,
                )
        finally:
            con.close()

        self.override = override_settings(
            DOT_REGISTRY_PATH=self.path
        )
        self.override.enable()
        self.addCleanup(self.override.disable)    
    def test_registry_matches_both_credentials_and_status(self):
        with patch('accounts.dot_adapter.date') as clock:
            from datetime import date
            clock.today.return_value = date(2026, 10, 2)
            clock.fromisoformat.side_effect = date.fromisoformat
            self.assertTrue(verify_driver(SEED[0][0], 'NDL 001')['verified'])
            self.assertEqual(verify_driver(SEED[1][0], 'NDL 002')['reason'], 'license_suspended')
            self.assertEqual(verify_driver(SEED[2][0], 'NDL 003')['reason'], 'license_expired')
            self.assertEqual(verify_driver(SEED[0][0], 'NDL 004')['reason'], 'not_found')

    def test_missing_corrupt_and_malformed_registry_fail_without_crashing(self):
        self.path.unlink()
        self.assertEqual(verify_driver(SEED[0][0], 'NDL 001')['reason'], 'dot_unavailable')
        self.assertFalse(self.path.exists())
        self.path.write_text('broken database')
        self.assertEqual(verify_driver(SEED[0][0], 'NDL 001')['reason'], 'dot_unavailable')
        self.assertEqual(verify_driver('', 'NDL 001')['reason'], 'missing_credentials')

    def test_admin_verification_updates_operational_status(self):
        admin = User.objects.create_user(phone='0829999999', password='test', is_superuser=True)
        driver = User.objects.create_user(phone='0839999999', password='test', role='driver')
        profile = DriverProfile.objects.create(user=driver, license_number='NDL 001', id_number=SEED[0][0])
        client = APIClient(); client.force_authenticate(admin)
        with patch('transport.views.verify_driver', return_value={'verified':True, 'reason':'ok', 'record':None}):
            self.assertEqual(client.post(f'/transport/api/admin/drivers/{profile.pk}/verify/').status_code, 200)
        profile.refresh_from_db(); self.assertEqual(profile.status, 'verified')
        with patch('transport.views.verify_driver', return_value={'verified':False, 'reason':'license_suspended', 'record':None}):
            client.post(f'/transport/api/admin/drivers/{profile.pk}/verify/')
        profile.refresh_from_db(); self.assertEqual(profile.status, 'rejected'); self.assertEqual(profile.external_verification_status, 'suspended')
        with patch('transport.views.verify_driver', return_value={'verified':False, 'reason':'dot_unavailable', 'record':None}):
            client.post(f'/transport/api/admin/drivers/{profile.pk}/verify/')
        profile.refresh_from_db(); self.assertEqual(profile.status, 'rejected')
