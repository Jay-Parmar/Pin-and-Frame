from pathlib import Path

from django.conf import settings
from django.core.exceptions import SuspiciousFileOperation
from django.core.files.storage import default_storage


def photo_path(key):
    path = Path(default_storage.path(key))
    resolved = path.resolve()
    root = Path(settings.MEDIA_ROOT).resolve()
    if path.is_symlink() or not resolved.parent.is_relative_to(root):
        raise SuspiciousFileOperation("Photo storage is outside the media folder.")
    return resolved
