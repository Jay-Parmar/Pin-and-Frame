from ipaddress import ip_address

from django.conf import settings
from django.http import JsonResponse
from django.utils.cache import add_never_cache_headers


def is_loopback(peer):
    try:
        return ip_address(peer).is_loopback
    except ValueError:
        return False


def private_api(get_response):
    def middleware(request):
        if not request.path_info.startswith("/api/"):
            return get_response(request)

        if not is_loopback(request.META.get("REMOTE_ADDR", "")):
            response = JsonResponse({"detail": "Open Pin & Frame on this computer."}, status=403)
        else:
            try:
                length = int(request.META.get("CONTENT_LENGTH") or 0)
            except ValueError:
                length = -1
            if length < 0:
                response = JsonResponse({"detail": "Invalid request size."}, status=400)
            elif length > settings.DATA_UPLOAD_MAX_MEMORY_SIZE:
                response = JsonResponse({"detail": "Request is too large."}, status=413)
            else:
                response = get_response(request)

        add_never_cache_headers(response)
        response["Cross-Origin-Resource-Policy"] = "same-origin"
        return response

    return middleware
