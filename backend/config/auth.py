import json

from django.contrib.auth import authenticate, login, logout
from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from rest_framework.permissions import BasePermission


SIGN_IN_CACHE_KEY = "owner-sign-in-attempts"
SIGN_IN_ATTEMPT_LIMIT = 8
SIGN_IN_WINDOW_SECONDS = 60


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


def sign_in_attempt_available():
    cache.add(SIGN_IN_CACHE_KEY, 0, SIGN_IN_WINDOW_SECONDS)
    try:
        return cache.incr(SIGN_IN_CACHE_KEY) <= SIGN_IN_ATTEMPT_LIMIT
    except ValueError:
        return cache.add(SIGN_IN_CACHE_KEY, 1, SIGN_IN_WINDOW_SECONDS)


@require_GET
@ensure_csrf_cookie
def session(request):
    return JsonResponse(session_data(request))


@require_POST
@csrf_protect
def sign_in(request):
    try:
        credentials = json.loads(request.body)
    except (ValueError, RecursionError):
        return JsonResponse({"detail": "Use a JSON object."}, status=400)

    if not isinstance(credentials, dict):
        return JsonResponse({"detail": "Use a JSON object."}, status=400)

    username = credentials.get("username")
    password = credentials.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return JsonResponse({"detail": "Enter your username and password."}, status=400)

    if not sign_in_attempt_available():
        response = JsonResponse({"detail": "Too many sign-in attempts. Try again in a minute."}, status=429)
        response["Retry-After"] = str(SIGN_IN_WINDOW_SECONDS)
        return response

    user = authenticate(request, username=username, password=password)
    if user is None or not is_owner(user):
        return JsonResponse({"detail": "Invalid username or password."}, status=401)

    login(request, user)
    cache.delete(SIGN_IN_CACHE_KEY)
    return JsonResponse(session_data(request))


@require_POST
@csrf_protect
def sign_out(request):
    logout(request)
    return JsonResponse(session_data(request))
