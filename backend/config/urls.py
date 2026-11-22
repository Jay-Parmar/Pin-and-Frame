from django.urls import include, path

from config import auth

urlpatterns = [
    path("api/v1/session/", auth.session, name="session"),
    path("api/v1/session/login/", auth.sign_in, name="sign-in"),
    path("api/v1/session/logout/", auth.sign_out, name="sign-out"),
    path("api/v1/", include("catalog.urls")),
]
