from django.urls import path

from . import views
urlpatterns = [
    path("register/passenger/", views.register_passenger, name="register_passenger"),
    path("register/driver/", views.register_driver, name="register_driver"),
    path("register/admin/", views.register_admin, name="register_admin"),
    path("register/operator/", views.register_operator, name="register_operator"),
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("dashboard/", views.dashboard, name="dashboard"),
    # accounts/api_urls.py or inside accounts/urls.py
    path("api/register/passenger/", views.api_register_passenger),
    path("api/register/driver/", views.api_register_driver),
    path("api/register/operator/", views.api_register_operator),
    path("api/login/", views.api_login),
    path("api/logout/", views.api_logout),
    path("api/me/", views.api_me),   
]