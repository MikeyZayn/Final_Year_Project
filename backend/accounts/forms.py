from django import forms
from django.contrib.auth.forms import UserCreationForm
from .models import DriverProfile, PassengerProfile, User
from .models import PassengerProfile, User
from django.conf import settings
from .models import AdminProfile, DriverProfile, OperatorProfile, PassengerProfile, RankCode, User
INPUT_CLASSES = "w-full px-2.5 py-1.5 rounded-xl glass-input text-xs"

class PassengerSignUpForm(UserCreationForm):
    first_name = forms.CharField(max_length=150, label="Name")
    last_name = forms.CharField(max_length=150, label="Surname")
    next_of_kin_name = forms.CharField(max_length=150, label="Emergency contact — name")
    next_of_kin_phone = forms.CharField(max_length=15, label="Emergency contact — phone")
    second_next_of_kin_name = forms.CharField(max_length=150, required=False, label="Second emergency contact — name (optional)")
    second_next_of_kin_phone = forms.CharField(max_length=15, required=False, label="Second emergency contact — phone (optional)")

    class Meta:
        model = User
        fields = ["first_name", "last_name", "email", "phone"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["email"].required = False
        for field in self.fields.values():
            field.widget.attrs.update({"class": INPUT_CLASSES})

    def save(self, commit=True):
        user = super().save(commit=False)
        user.role = User.Role.PASSENGER
        user.username = user.phone
        if commit:
            user.save()
            PassengerProfile.objects.create(
                user=user,
                next_of_kin_name=self.cleaned_data["next_of_kin_name"],
                next_of_kin_phone=self.cleaned_data["next_of_kin_phone"],
                second_next_of_kin_name=self.cleaned_data.get("second_next_of_kin_name", ""),
                second_next_of_kin_phone=self.cleaned_data.get("second_next_of_kin_phone", ""),
            )
        return user
    
class DriverSignUpForm(UserCreationForm):
    first_name = forms.CharField(max_length=150, label="Name")
    last_name = forms.CharField(max_length=150, label="Surname")
    license_number = forms.CharField(max_length=30)
    photo = forms.ImageField()
    rank_code = forms.CharField(max_length=20, label="Rank code (your taxi association)")

    class Meta:
        model = User
        fields = ["first_name", "last_name", "email", "phone"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["email"].required = False
        for field in self.fields.values():
            field.widget.attrs.update({"class": INPUT_CLASSES})

    def clean_rank_code(self):
        entered = self.cleaned_data["rank_code"]
        try:
            code = RankCode.objects.get(code=entered, is_active=True)
        except RankCode.DoesNotExist:
            raise forms.ValidationError("Invalid or inactive rank code.")
        self.rank_code_obj = code
        return entered

    def save(self, commit=True):
        user = super().save(commit=False)
        user.role = User.Role.DRIVER
        user.username = user.phone
        if commit:
            user.save()
            DriverProfile.objects.create(
                user=user,
                license_number=self.cleaned_data["license_number"],
                photo=self.cleaned_data["photo"],
                association=self.rank_code_obj,
                status=DriverProfile.VerificationStatus.PENDING,
            )
        return user

class AdminSignUpForm(UserCreationForm):
    institution_name = forms.CharField(max_length=150)
    passcode = forms.CharField(widget=forms.PasswordInput, label="Authorization passcode")

    class Meta:
        model = User
        fields = ["username", "email", "phone"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.widget.attrs.update({"class": INPUT_CLASSES})

    def clean_passcode(self):
        entered = self.cleaned_data["passcode"]
        if entered != settings.ADMIN_SIGNUP_PASSCODE:
            raise forms.ValidationError("Incorrect authorization passcode.")
        return entered

    def save(self, commit=True):
        user = super().save(commit=False)
        user.role = User.Role.ADMIN
        if commit:
            user.save()
            AdminProfile.objects.create(
                user=user,
                institution_name=self.cleaned_data["institution_name"],
            )
        return user

class OperatorSignUpForm(UserCreationForm):
    rank_code = forms.CharField(max_length=20, label="Rank code")

    class Meta:
        model = User
        fields = ["username", "email", "phone"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.widget.attrs.update({"class": INPUT_CLASSES})

    def clean_rank_code(self):
        entered = self.cleaned_data["rank_code"]
        try:
            code = RankCode.objects.get(code=entered, is_active=True)
        except RankCode.DoesNotExist:
            raise forms.ValidationError("Invalid or inactive rank code.")
        self.rank_code_obj = code
        return entered

    def save(self, commit=True):
        user = super().save(commit=False)
        user.role = User.Role.OPERATOR
        if commit:
            user.save()
            OperatorProfile.objects.create(
                user=user,
                association=self.rank_code_obj,
            )
        return user

class LoginForm(forms.Form):
    phone = forms.CharField(max_length=15)
    password = forms.CharField(widget=forms.PasswordInput)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.widget.attrs.update({"class": INPUT_CLASSES})