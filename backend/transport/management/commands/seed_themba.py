"""
Single seed: Rank → Route(+geometry) → Vehicle → Trip → optional Booking.
Demo users password: themba123
"""
from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import (
    AdminProfile,
    DriverProfile,
    OperatorProfile,
    PassengerProfile,
    RankCode,
)
from transport.models import (
    Booking,
    Destination,
    DriverVehicle,
    OperatorAtRank,
    Rank,
    Route,
    RouteStop,
    TaxiFareRule,
    Trip,
    Vehicle,
    VerificationCode,
)

DEMO_PASSWORD = "themba123"
User = get_user_model()


class Command(BaseCommand):
    help = "Seed THEMBA demo data for multi-device testing"

    def handle(self, *args, **options):
        self.stdout.write("Seeding THEMBA…")

        # Associations
        codes = {}
        for code, name in [
            ("KDL001", "Kwa-Dlangezwa Taxi Association"),
            ("ESK001", "eSikhawini Taxi Association"),
            ("RBY001", "Richards Bay Taxi Association"),
            ("EMP001", "Empangeni Taxi Association"),
        ]:
            rc, _ = RankCode.objects.update_or_create(
                code=code,
                defaults={
                    "association_name": name,
                    "operating_region": "King Cetshwayo",
                    "is_active": True,
                },
            )
            codes[code] = rc

        # Ranks / destinations — exact themba-search-first PREDETERMINED_PLACES
        # Ongoye (-28.854, 31.846), Empangeni (-28.7808, 31.8925),
        # Esikhawini (-28.883, 31.9), Richards Bay (-28.781, 32.0377)
        place_specs = [
            ("Ongoye", "King Cetshwayo", -28.854, 31.846),
            ("Empangeni", "King Cetshwayo", -28.7808, 31.8925),
            ("Esikhawini", "King Cetshwayo", -28.883, 31.9),
            ("Richards Bay", "King Cetshwayo", -28.781, 32.0377),
        ]
        ranks = {}
        dests = {}
        for name, area, lat, lng in place_specs:
            r, _ = Rank.objects.update_or_create(
                name=name,
                defaults={"area": area, "latitude": lat, "longitude": lng},
            )
            ranks[name] = r
            d, _ = Destination.objects.update_or_create(
                name=name,
                defaults={"area": area, "latitude": lat, "longitude": lng},
            )
            dests[name] = d

        # Routes = original LOCAL_FARES pairs (same names + fares as search-first)
        route_specs = [
            ("TH-ONG-EMP", "Ongoye → Empangeni", "Ongoye", "Empangeni", 24, 18),
            ("TH-ONG-ESI", "Ongoye → Esikhawini", "Ongoye", "Esikhawini", 20, 15),
            ("TH-ONG-RB", "Ongoye → Richards Bay", "Ongoye", "Richards Bay", 34, 35),
            ("TH-ESI-EMP", "Esikhawini → Empangeni", "Esikhawini", "Empangeni", 23, 20),
            ("TH-ESI-RB", "Esikhawini → Richards Bay", "Esikhawini", "Richards Bay", 18, 22),
            ("TH-RB-EMP", "Richards Bay → Empangeni", "Richards Bay", "Empangeni", 21, 25),
        ]
        routes = {}
        for code, name, dep_name, dest_name, fare, mins in route_specs:
            dep, dest = ranks[dep_name], dests[dest_name]
            geom = [
                [float(dep.latitude), float(dep.longitude)],
                [float(dest.latitude), float(dest.longitude)],
            ]
            dist = abs(float(dep.latitude) - float(dest.latitude)) * 111 + abs(
                float(dep.longitude) - float(dest.longitude)
            ) * 95
            route, _ = Route.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "departure": dep,
                    "destination": dest,
                    "fare": fare,
                    "service_category": Route.ServiceCategory.STRUCTURED,
                    "typical_duration_minutes": mins,
                    "geometry": geom,
                    "distance_km": round(dist, 1),
                    "average_speed_kmh": 40,
                    "vehicle_class": Route.VehicleClass.QUANTUM_15,
                    "deviation_threshold_m": 150,
                    "active": True,
                },
            )
            routes[code] = route
            RouteStop.objects.filter(route=route).delete()
            RouteStop.objects.bulk_create(
                [
                    RouteStop(
                        route=route,
                        name=dep.name,
                        lat=float(dep.latitude),
                        lng=float(dep.longitude),
                        order=0,
                        fare_from_origin=0,
                    ),
                    RouteStop(
                        route=route,
                        name=dest.name,
                        lat=float(dest.latitude),
                        lng=float(dest.longitude),
                        order=1,
                        fare_from_origin=fare,
                    ),
                ]
            )

        TaxiFareRule.objects.update_or_create(
            name="Default ad-hoc fare",
            defaults={
                "base_fare": 5,
                "price_per_km": 2,
                "minimum_fare": 10,
                "active": True,
            },
        )

        # Users
        def upsert_user(username, phone, email, role, first, last):
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "phone": phone,
                    "email": email,
                    "role": role,
                    "first_name": first,
                    "last_name": last,
                },
            )
            if not created:
                user.phone = phone
                user.email = email
                user.role = role
                user.first_name = first
                user.last_name = last
            user.set_password(DEMO_PASSWORD)
            user.save()
            return user

        passenger = upsert_user(
            "passenger_demo", "0700001001", "passenger@themba.local", "passenger", "Sibusiso", "Dlamini"
        )
        driver_u = upsert_user(
            "driver_demo", "0700001002", "driver@themba.local", "driver", "Bongani", "Mthembu"
        )
        operator_u = upsert_user(
            "operator_demo", "0700001003", "operator@themba.local", "operator", "Nqobile", "Zondi"
        )
        admin_u = upsert_user(
            "admin_demo", "0700001004", "admin@themba.local", "admin", "THEMBA", "Admin"
        )
        admin_u.is_staff = True
        admin_u.save(update_fields=["is_staff"])

        PassengerProfile.objects.update_or_create(
            user=passenger,
            defaults={
                "next_of_kin_name": "Thandi Dlamini",
                "next_of_kin_phone": "0700002001",
            },
        )
        dp, _ = DriverProfile.objects.update_or_create(
            user=driver_u,
            defaults={
                "license_number": "KZN-DRV-001",
                "status": DriverProfile.VerificationStatus.VERIFIED,
                "association": codes["KDL001"],
                "verified_at": timezone.now(),
            },
        )
        op, _ = OperatorProfile.objects.update_or_create(
            user=operator_u, defaults={"association": codes["KDL001"]}
        )
        AdminProfile.objects.update_or_create(
            user=admin_u,
            defaults={
                "institution_name": "THEMBA Platform",
                "rank": ranks["Ongoye"],
            },
        )
        OperatorAtRank.objects.update_or_create(
            operator=op,
            rank=ranks["Ongoye"],
            defaults={"status": OperatorAtRank.Status.ACTIVE},
        )

        # Vehicles
        v1, _ = Vehicle.objects.update_or_create(
            plate_number="ND 123-456",
            defaults={
                "make": "Toyota",
                "model": "Quantum",
                "seat_capacity": 15,
                "roadworthy": True,
                "status": Vehicle.Status.QUEUED,
            },
        )
        v2, _ = Vehicle.objects.update_or_create(
            plate_number="ND 345-678",
            defaults={
                "make": "Toyota",
                "model": "Quantum",
                "seat_capacity": 15,
                "status": Vehicle.Status.QUEUED,
            },
        )
        DriverVehicle.objects.filter(driver=dp, vehicle=v1).delete()
        DriverVehicle.objects.create(driver=dp, vehicle=v1, active=True)

        # Trips for today + tomorrow
        today = timezone.localdate()
        trip_defs = [
            ("TRP-ONG-EMP-01", "TH-ONG-EMP", time(8, 30), v1, dp),
            ("TRP-ONG-RB-01", "TH-ONG-RB", time(9, 0), v2, None),
            ("TRP-EMP-RB-01", "TH-RB-EMP", time(10, 0), None, None),
        ]
        for code, route_code, t, vehicle, driver in trip_defs:
            Trip.objects.update_or_create(
                trip_code=code,
                defaults={
                    "operator": op,
                    "route": routes[route_code],
                    "departure_date": today,
                    "expected_departure_time": t,
                    "seat_capacity": 15,
                    "status": Trip.Status.SCHEDULED,
                    "vehicle": vehicle,
                    "driver": driver,
                },
            )
            Trip.objects.update_or_create(
                trip_code=code + "-TMR",
                defaults={
                    "operator": op,
                    "route": routes[route_code],
                    "departure_date": today + timedelta(days=1),
                    "expected_departure_time": t,
                    "seat_capacity": 15,
                    "status": Trip.Status.SCHEDULED,
                    "vehicle": vehicle,
                    "driver": driver,
                },
            )

        self.stdout.write(self.style.SUCCESS(
            f"Done. Users password '{DEMO_PASSWORD}'. "
            f"Routes={Route.objects.count()} Trips={Trip.objects.count()} "
            f"Vehicles={Vehicle.objects.count()}"
        ))
        self.stdout.write(
            "Login: passenger_demo | driver_demo | operator_demo | admin_demo "
            "(or phone 0700001001… or *@themba.local)"
        )
