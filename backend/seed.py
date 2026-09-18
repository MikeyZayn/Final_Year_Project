from accounts.models import User, OperatorProfile, RankCode
from transport.models import Rank, DeparturePoint, Destination, Route

# ---- Clear transport data ----
Route.objects.all().delete()
DeparturePoint.objects.all().delete()
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

# ---- Ranks (physical places) ----
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
print(f"ranks ready: {len(ranks_by_name)}")

# ---- Operators (phone, first, last, rank code, assigned rank name) ----
OPERATOR_SPECS = [
    ("0820000003", "Nqobile", "Zondi",    "KDL001", "Ongoye Main Rank"),
    ("0820000004", "Sipho",   "Ndlovu",   "ESK001", "eSikhawini Main Rank"),
    ("0820000006", "Mjijimi", "Cele",     "RBY001", "Richards Bay Main Rank"),
    ("0820000005", "Thabo",   "Khumalo",  "EMP001", "Empangeni Rank 1"),
    ("0820000007", "Bheki",   "Mahlangu", "EMP001", "Empangeni Rank 2"),
    ("0820000008", "Lindiwe", "Ncube",    "EMP001", "Empangeni Rank 3"),
    ("0820000009", "Musa",    "Dube",     "EMP001", "Empangeni Rank 4"),
    # second operator at Empangeni Rank 1
    ("0820000010", "Mpho",    "Radebe",   "EMP001", "Empangeni Rank 1"),
    # second operator at Empangeni Rank 3
    ("0820000011", "Zanele",  "Mkhize",   "EMP001", "Empangeni Rank 3"),
]

operators_by_phone = {}
departure_by_phone = {}
for phone, first, last, code, rank_name in OPERATOR_SPECS:
    user, created = User.objects.get_or_create(
        phone=phone,
        defaults={"role": "operator", "username": phone},
    )
    user.first_name, user.last_name, user.role = first, last, "operator"
    if created or not user.has_usable_password():
        user.set_password("Passw0rd!")
    user.save()

    rc = RankCode.objects.get(code=code)
    profile, _ = OperatorProfile.objects.update_or_create(
        user=user, defaults={"association": rc},
    )
    operators_by_phone[phone] = profile

    rank = ranks_by_name[rank_name]
    dp = DeparturePoint.objects.create(
        operator=profile,
        rank=rank,
        name=rank.name,      # legacy mirror for backward compat
        area=rank.area,
        latitude=rank.latitude,
        longitude=rank.longitude,
    )
    departure_by_phone[phone] = dp

print(f"operators + departure points ready: {len(operators_by_phone)}")

# ---- Destinations ----
for name, area, lat, lng in [
    ("Empangeni",     "King Cetshwayo", -28.742, 31.893),
    ("Kwa-Dlangezwa", "uMhlathuze",     -28.844, 31.895),
    ("eSikhawini",    "King Cetshwayo", -28.879, 31.899),
    ("Richards Bay",  "King Cetshwayo", -28.780, 32.038),
]:
    Destination.objects.create(name=name, area=area, latitude=lat, longitude=lng)
destinations = {d.name: d for d in Destination.objects.all()}
print(f"destinations ready: {len(destinations)}")

# ---- Routes ----
ROUTE_SPECS = [
    # Ongoye Main Rank operator
    ("0820000003", "Empangeni",     24),
    ("0820000003", "eSikhawini",    16),
    # eSikhawini Main Rank operator
    ("0820000004", "Empangeni",     24),
    ("0820000004", "Kwa-Dlangezwa", 16),
    # Richards Bay Main Rank operator
    ("0820000006", "Empangeni",     24),
    ("0820000006", "Kwa-Dlangezwa", 34),
    # Empangeni Rank 1 operators (two of them)
    ("0820000005", "Kwa-Dlangezwa", 24),
    ("0820000010", "eSikhawini",    24),
    # Empangeni Rank 2
    ("0820000007", "Kwa-Dlangezwa", 24),
    # Empangeni Rank 3 operators (two of them)
    ("0820000008", "eSikhawini",    24),
    ("0820000008", "Richards Bay",  24),
    ("0820000011", "Kwa-Dlangezwa", 24),
    # Empangeni Rank 4
    ("0820000009", "eSikhawini",    24),
    ("0820000009", "Richards Bay",  24),
]
for phone, dest_name, fare in ROUTE_SPECS:
    Route.objects.create(
        operator=operators_by_phone[phone],
        departure_point=departure_by_phone[phone],
        destination=destinations[dest_name],
        fare=fare,
        service_category="structured",
        active=True,
    )

print("\n=== FINAL STATE ===")
print("Ranks:           ", Rank.objects.count())
print("Operators:       ", OperatorProfile.objects.count())
print("Departure points:", DeparturePoint.objects.count())
print("Destinations:    ", Destination.objects.count())
print("Routes:          ", Route.objects.count())