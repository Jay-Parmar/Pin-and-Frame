import json

from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from rest_framework.permissions import BasePermission


def is_owner(user):
    return user.is_authenticated and user.is_active and user.is_superuser


class IsOwner(BasePermission):
    def has_permission(self, request, view):
        return is_owner(request.user)


def session_data(request):
    owner = is_owner(request.user)
    return {
        "authenticated": owner,
        "username": request.user.get_username() if owner else None,
    }


@require_GET
@ensure_csrf_cookie
def session(request):
    return JsonResponse(session_data(request))


@require_POST
@csrf_protect
def sign_in(request):
    try:
        credentials = json.loads(request.body)
    except ValueError:
        return JsonResponse({"detail": "Use a JSON object."}, status=400)

    if not isinstance(credentials, dict):
        return JsonResponse({"detail": "Use a JSON object."}, status=400)

    username = credentials.get("username")
    password = credentials.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return JsonResponse({"detail": "Enter your username and password."}, status=400)

    user = authenticate(request, username=username, password=password)
    if user is None or not is_owner(user):
        return JsonResponse({"detail": "Invalid username or password."}, status=401)

    login(request, user)
    return JsonResponse(session_data(request))


@require_POST
@csrf_protect
def sign_out(request):
    logout(request)
    return JsonResponse(session_data(request))
