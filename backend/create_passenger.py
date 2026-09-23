from accounts.models import User, PassengerProfile

phone = "0821111111"
if User.objects.filter(phone=phone).exists():
    u = User.objects.get(phone=phone)
    u.set_password("Passw0rd!")
    u.save()
    print(f"{phone} existed — password reset")
else:
    u = User.objects.create_user(phone=phone, password="Passw0rd!", role="passenger")
    u.first_name = "Sibusiso"
    u.last_name = "Dlamini"
    u.save()
    PassengerProfile.objects.create(
        user=u,
        next_of_kin_name="Nandi Dlamini",
        next_of_kin_phone="0822222222",
    )
    print(f"created passenger: {phone} / Passw0rd!")