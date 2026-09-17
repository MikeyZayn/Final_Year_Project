from accounts.models import User, OperatorProfile, RankCode
from transport.models import DeparturePoint, Destination, Route

Route.objects.all().delete()
DeparturePoint.objects.all().delete()
Destination.objects.all().delete()
print("cleared routes, departure points, destinations")

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

op_specs = [
    ("0820000003", "Nqobile", "Zondi",    "KDL001"),
    ("0820000004", "Sipho",   "Ndlovu",   "ESK001"),
    ("0820000006", "Mjijimi", "Cele",     "RBY001"),
    ("0820000005", "Thabo",   "Khumalo",  "EMP001"),
    ("0820000007", "Bheki",   "Mahlangu", "EMP001"),
    ("0820000008", "Lindiwe", "Ncube",    "EMP001"),
    ("0820000009", "Musa",    "Dube",     "EMP001"),
]
operators_by_phone = {}
for phone, first, last, code in op_specs:
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
print(f"operators ready: {len(operators_by_phone)}")

dp_specs = [
    ("0820000003", "Ongoye Main Rank",       "Kwa-Dlangezwa"),
    ("0820000004", "eSikhawini Main Rank",   "eSikhawini"),
    ("0820000006", "Richards Bay Main Rank", "Richards Bay"),
    ("0820000005", "Empangeni Rank 1",       "Empangeni"),
    ("0820000007", "Empangeni Rank 2",       "Empangeni"),
    ("0820000008", "Empangeni Rank 3",       "Empangeni"),
    ("0820000009", "Empangeni Rank 4",       "Empangeni"),
]
departure_by_phone = {}
for phone, name, area in dp_specs:
    dp = DeparturePoint.objects.create(
        operator=operators_by_phone[phone], name=name, area=area,
    )
    departure_by_phone[phone] = dp
print(f"departure points ready: {len(departure_by_phone)}")

for name, area in [
    ("Empangeni",     "King Cetshwayo"),
    ("Kwa-Dlangezwa", "uMhlathuze"),
    ("eSikhawini",    "King Cetshwayo"),
    ("Richards Bay",  "King Cetshwayo"),
]:
    Destination.objects.create(name=name, area=area)
destinations = {d.name: d for d in Destination.objects.all()}
print(f"destinations ready: {len(destinations)}")

route_specs = [
    ("0820000003", "Empangeni",     24),
    ("0820000003", "eSikhawini",    16),
    ("0820000004", "Empangeni",     24),
    ("0820000004", "Kwa-Dlangezwa", 16),
    ("0820000006", "Empangeni",     24),
    ("0820000006", "Kwa-Dlangezwa", 34),
    ("0820000005", "Kwa-Dlangezwa", 24),
    ("0820000007", "Kwa-Dlangezwa", 24),
    ("0820000008", "eSikhawini",    24),
    ("0820000008", "Richards Bay",  24),
    ("0820000009", "eSikhawini",    24),
    ("0820000009", "Richards Bay",  24),
]
for phone, dest_name, fare in route_specs:
    Route.objects.create(
        operator=operators_by_phone[phone],
        departure_point=departure_by_phone[phone],
        destination=destinations[dest_name],
        fare=fare,
        service_category="structured",
        active=True,
    )

print("\n=== FINAL STATE ===")
print("Operators:       ", OperatorProfile.objects.count())
print("Departure points:", DeparturePoint.objects.count())
print("Destinations:    ", Destination.objects.count())
print("Routes:          ", Route.objects.count())