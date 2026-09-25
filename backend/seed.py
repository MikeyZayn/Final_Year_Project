from datetime import date, time, timedelta
from django.utils import timezone
from accounts.models import User, PassengerProfile, OperatorProfile, RankCode, AdminProfile, DriverProfile
from transport.models import (
    Rank, Destination, OperatorAtRank, Route,
    Vehicle, DriverVehicle, Trip,
)

# ---- Clear ----
AdminProfile.objects.update(rank=None)
Trip.objects.all().delete()
DriverVehicle.objects.all().delete()
Vehicle.objects.all().delete()
Route.objects.all().delete()
OperatorAtRank.objects.all().delete()
Destination.objects.all().delete()
Rank.objects.all().delete()
print("cleared")

# ---- Rank codes ----
for code, name in [
    ("KDL001", "Kwa-Dlangezwa Taxi Association"),
    ("ESK001", "eSikhawini Taxi Association"),
    ("RBY001", "Richards Bay Taxi Association"),
    ("EMP001", "Empangeni Taxi Association"),
]:
    RankCode.objects.update_or_create(
        code=code,
        defaults={"association_name": name, "operating_region": "King Cetshwayo", "is_active": True},
    )
print("rank codes ready")

# ---- Ranks ----
RANK_SPECS = [
    ("Ongoye Main Rank",       "Kwa-Dlangezwa", -28.844, 31.895),
    ("eSikhawini Main Rank",   "eSikhawini",    -28.879, 31.899),
    ("Richards Bay Main Rank", "Richards Bay",  -28.780, 32.038),
    ("Empangeni Rank 1",       "Empangeni",     -28.742, 31.893),
    ("Empangeni Rank 2",       "Empangeni",     -28.742, 31.893),
    ("Empangeni Rank 3",       "Empangeni",     -28.742, 31.893),
    ("Empangeni Rank 4",       "Empangeni",     -28.742, 31.893),
]
ranks_by_name = {}
for name, area, lat, lng in RANK_SPECS:
    r = Rank.objects.create(name=name, area=area, latitude=lat, longitude=lng)
    ranks_by_name[name] = r
print(f"ranks: {len(ranks_by_name)}")

# ---- Admins (one per rank) ----
ADMIN_SPECS = [
    ("0700000001", "Sizwe",  "Nkosi",   "Ongoye Main Rank",       "Kwa-Dlangezwa Taxi Association"),
    ("0700000002", "Andile", "Mabaso",  "eSikhawini Main Rank",   "eSikhawini Taxi Association"),
    ("0700000003", "Lerato", "Molefe",  "Richards Bay Main Rank", "Richards Bay Taxi Association"),
    ("0700000004", "Dumi",   "Cele",    "Empangeni Rank 1",       "Empangeni Taxi Association"),
    ("0700000005", "Nandi",  "Zulu",    "Empangeni Rank 2",       "Empangeni Taxi Association"),
    ("0700000006", "Pieter", "van Wyk", "Empangeni Rank 3",       "Empangeni Taxi Association"),
    ("0700000007", "Grace",  "Mthembu", "Empangeni Rank 4",       "Empangeni Taxi Association"),
]
admins_by_rank = {}
for phone, first, last, rank_name, institution in ADMIN_SPECS:
    user, created = User.objects.get_or_create(
        phone=phone, defaults={"role": "admin", "username": phone},
    )
    user.first_name, user.last_name, user.role = first, last, "admin"
    if created or not user.has_usable_password():
        user.set_password("Passw0rd!")
    user.save()
    profile, _ = AdminProfile.objects.update_or_create(
        user=user, defaults={"institution_name": institution, "rank": ranks_by_name[rank_name]},
    )
    admins_by_rank[rank_name] = profile
print(f"admins: {len(admins_by_rank)}")

# ---- Operators + memberships ----
OPERATOR_SPECS = [
    ("0820000003", "Nqobile", "Zondi",    "KDL001", "Ongoye Main Rank"),
    ("0820000004", "Sipho",   "Ndlovu",   "ESK001", "eSikhawini Main Rank"),
    ("0820000006", "Mjijimi", "Cele",     "RBY001", "Richards Bay Main Rank"),
    ("0820000005", "Thabo",   "Khumalo",  "EMP001", "Empangeni Rank 1"),
    ("0820000010", "Mpho",    "Radebe",   "EMP001", "Empangeni Rank 1"),
    ("0820000007", "Bheki",   "Mahlangu", "EMP001", "Empangeni Rank 2"),
    ("0820000008", "Lindiwe", "Ncube",    "EMP001", "Empangeni Rank 3"),
    ("0820000011", "Zanele",  "Mkhize",   "EMP001", "Empangeni Rank 3"),
    ("0820000009", "Musa",    "Dube",     "EMP001", "Empangeni Rank 4"),
]
operators_by_phone = {}
for phone, first, last, code, rank_name in OPERATOR_SPECS:
    user, created = User.objects.get_or_create(
        phone=phone, defaults={"role": "operator", "username": phone},
    )
    user.first_name, user.last_name, user.role = first, last, "operator"
    if created or not user.has_usable_password():
        user.set_password("Passw0rd!")
    user.save()
    rc = RankCode.objects.get(code=code)
    profile, _ = OperatorProfile.objects.update_or_create(user=user, defaults={"association": rc})
    operators_by_phone[phone] = profile

    OperatorAtRank.objects.create(
        operator=profile, rank=ranks_by_name[rank_name],
        status=OperatorAtRank.Status.ACTIVE,
        approved_by=admins_by_rank[rank_name],
        approved_at=timezone.now(),
    )

# second membership: KDL operator also approved at Empangeni Rank 1 (demo)
OperatorAtRank.objects.create(
    operator=operators_by_phone["0820000003"],
    rank=ranks_by_name["Empangeni Rank 1"],
    status=OperatorAtRank.Status.ACTIVE,
    approved_by=admins_by_rank["Empangeni Rank 1"],
    approved_at=timezone.now(),
)
print(f"operators + memberships: {len(operators_by_phone)}")

# ---- Destinations ----
for name, area, lat, lng in [
    ("Empangeni",     "King Cetshwayo", -28.742, 31.893),
    ("Kwa-Dlangezwa", "uMhlathuze",     -28.844, 31.895),
    ("eSikhawini",    "King Cetshwayo", -28.879, 31.899),
    ("Richards Bay",  "King Cetshwayo", -28.780, 32.038),
]:
    Destination.objects.create(name=name, area=area, latitude=lat, longitude=lng)
dest = {d.name: d for d in Destination.objects.all()}
print(f"destinations: {len(dest)}")

# ---- Routes (shared corridors) ----
ROUTE_SPECS = [
    ("Ongoye Main Rank",       "Empangeni",     24),
    ("Ongoye Main Rank",       "eSikhawini",    16),
    ("Ongoye Main Rank",       "Richards Bay",  34),
    ("eSikhawini Main Rank",   "Empangeni",     24),
    ("eSikhawini Main Rank",   "Kwa-Dlangezwa", 16),
    ("eSikhawini Main Rank",   "Richards Bay",  16),
    ("Richards Bay Main Rank", "Empangeni",     24),
    ("Richards Bay Main Rank", "Kwa-Dlangezwa", 34),
    ("Richards Bay Main Rank", "eSikhawini",    16),
    ("Empangeni Rank 1",       "Kwa-Dlangezwa", 24),
    ("Empangeni Rank 2",       "Kwa-Dlangezwa", 24),
    ("Empangeni Rank 3",       "eSikhawini",    24),
    ("Empangeni Rank 3",       "Richards Bay",  24),
    ("Empangeni Rank 4",       "eSikhawini",    24),
    ("Empangeni Rank 4",       "Richards Bay",  24),
]
routes_by_key = {}
for dep_name, dest_name, fare in ROUTE_SPECS:
    r = Route.objects.create(
        departure=ranks_by_name[dep_name],
        destination=dest[dest_name],
        fare=fare,
        service_category=Route.ServiceCategory.STRUCTURED,
        active=True,
    )
    routes_by_key[(dep_name, dest_name)] = r
print(f"routes: {len(routes_by_key)}")

# ---- Vehicles (standalone assets) ----
VEHICLE_SPECS = [
    ("ND 123-456", "Toyota", "Quantum", 15),
    ("ND 234-567", "Toyota", "HiAce",   15),
    ("ND 345-678", "Nissan", "NV350",   15),
    ("ND 456-789", "Toyota", "Quantum", 15),
    ("ND 567-890", "Toyota", "Quantum", 15),
    ("ND 678-901", "Toyota", "HiAce",   15),
]
vehicles = []
for plate, make, model, seats in VEHICLE_SPECS:
    v = Vehicle.objects.create(
        plate_number=plate, make=make, model=model,
        seat_capacity=seats, roadworthy=True,
    )
    vehicles.append(v)
print(f"vehicles: {len(vehicles)}")

# ---- Drivers ----
DRIVER_SPECS = [
    ("0830000001", "Bongani", "Mthembu",  "NDL 001", "ND 123-456"),
    ("0830000002", "Sipho",   "Ndlovu",   "NDL 002", "ND 234-567"),
    ("0830000003", "Thabo",   "Khumalo",  "NDL 003", "ND 345-678"),
    ("0830000004", "Musa",    "Dube",     "NDL 004", "ND 456-789"),
    ("0830000005", "Lucky",   "Mahlangu", "NDL 005", "ND 567-890"),
    ("0830000006", "Peter",   "Ncube",    "NDL 006", "ND 678-901"),
]
drivers = []
for phone, first, last, lic, plate in DRIVER_SPECS:
    user, created = User.objects.get_or_create(
        phone=phone, defaults={"role": "driver", "username": phone},
    )
    user.first_name, user.last_name, user.role = first, last, "driver"
    if created or not user.has_usable_password():
        user.set_password("Passw0rd!")
    user.save()

    from django.core.files.base import ContentFile
    # tiny placeholder image so ImageField doesn't fail on non-null
    dp, _ = DriverProfile.objects.get_or_create(
        user=user,
        defaults={
            "license_number": lic,
            "photo": ContentFile(b"placeholder", name=f"{phone}.jpg"),
            "status": DriverProfile.VerificationStatus.VERIFIED,
        },
    )
    drivers.append(dp)

    # link driver to vehicle
    vehicle = Vehicle.objects.get(plate_number=plate)
    DriverVehicle.objects.get_or_create(driver=dp, vehicle=vehicle, active=True)
print(f"drivers: {len(drivers)}")

# ---- Trips (per operator) ----
today = date.today()
tomorrow = today + timedelta(days=1)

def make_trip(operator_phone, dep_name, dest_name, day, t):
    op = operators_by_phone[operator_phone]
    route = routes_by_key[(dep_name, dest_name)]
    driver = drivers[0]  # fixed for demo
    vehicle = vehicles[0]
    prefix = f"TRP-{route.id:03d}-"
    import random, string
    code = prefix + "".join(random.choices(string.ascii_uppercase, k=4))
    while Trip.objects.filter(trip_code=code).exists():
        code = prefix + "".join(random.choices(string.ascii_uppercase, k=4))
    Trip.objects.create(
        operator=op, route=route,
        departure_date=day, expected_departure_time=t,
        seat_capacity=vehicle.seat_capacity,
        trip_code=code, driver=driver, vehicle=vehicle,
        status=Trip.Status.SCHEDULED,
    )

# Today's trips
make_trip("0820000003", "Ongoye Main Rank", "Empangeni",     today, time(7, 0))
make_trip("0820000003", "Ongoye Main Rank", "eSikhawini",    today, time(9, 0))
make_trip("0820000004", "eSikhawini Main Rank", "Empangeni", today, time(7, 30))
make_trip("0820000005", "Empangeni Rank 1", "Kwa-Dlangezwa", today, time(8, 0))
make_trip("0820000010", "Empangeni Rank 1", "Kwa-Dlangezwa", today, time(10, 0))

# Tomorrow's trips
make_trip("0820000003", "Ongoye Main Rank", "Richards Bay",  tomorrow, time(7, 0))
make_trip("0820000003", "Ongoye Main Rank", "Empangeni",     tomorrow, time(8, 0))
make_trip("0820000006", "Richards Bay Main Rank", "Empangeni", tomorrow, time(9, 0))
make_trip("0820000008", "Empangeni Rank 3", "Richards Bay",  tomorrow, time(11, 0))
make_trip("0820000009", "Empangeni Rank 4", "eSikhawini",    tomorrow, time(13, 0))


# ---- Ensure superuser exists ----
su_phone = "0813109193"
su, created = User.objects.get_or_create(
    phone=su_phone,
    defaults={"username": su_phone, "role": "admin", "is_staff": True, "is_superuser": True},
)
if created:
    su.set_password("AdminPass123!")
    su.save()
    print(f"superuser ready: {su_phone} / AdminPass123!")
else:
    print(f"superuser exists: {su_phone}")
print("\n=== FINAL STATE ===")
print("Ranks:            ", Rank.objects.count())
print("Admins:           ", AdminProfile.objects.count())
print("Operators:        ", OperatorProfile.objects.count())
print("Memberships:      ", OperatorAtRank.objects.count())
print("Destinations:     ", Destination.objects.count())
print("Routes:           ", Route.objects.count())
print("Vehicles:         ", Vehicle.objects.count())
print("Drivers:          ", DriverProfile.objects.count())
print("Trips:            ", Trip.objects.count())


# ---- Demo passengers ----
for phone, first, last in [
    ("0821111111", "Sibusiso", "Dlamini"),
    ("0821111112", "Thandi",   "Mkhize"),
    ("0821111113", "Sipho",    "Nkosi"),
]:
    user, created = User.objects.get_or_create(
        phone=phone, defaults={"role": "passenger", "username": phone},
    )
    user.first_name, user.last_name, user.role = first, last, "passenger"
    if created or not user.has_usable_password():
        user.set_password("Passw0rd!")
    user.save()
    PassengerProfile.objects.get_or_create(
        user=user,
        defaults={
            "next_of_kin_name": "Family Contact",
            "next_of_kin_phone": "0822222222",
        },
    )
print("passengers ready")


