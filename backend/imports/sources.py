from dataclasses import dataclass
from datetime import date, datetime, timezone
from math import isfinite
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Callable


PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}


class SourceError(ValueError):
    pass


@dataclass(frozen=True)
class SourceImage:
    name: str
    open_file: Callable[[], BinaryIO] | None = None
    caption: str = ""
    captured_on: date | None = None
    captured_at: datetime | None = None
    capture_text: str = ""
    published_at: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    issue: str = ""
    skipped: bool = False


def coordinates(latitude, longitude):
    try:
        latitude, longitude = float(latitude), float(longitude)
    except (ValueError, TypeError, OverflowError):
        return None, None
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return None, None
    return latitude, longitude


def unix_timestamp(value):
    try:
        seconds = float(value)
        return datetime.fromtimestamp(seconds, tz=timezone.utc) if isfinite(seconds) else None
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def member_path(value):
    if not isinstance(value, str) or not value or any(char in value for char in ("\\", ":", "\x00")):
        return None
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or not path.name:
        return None
    return path


def contained_file(root, path):
    try:
        resolved = path.resolve(strict=True)
        if resolved.is_relative_to(root) and resolved.is_file():
            return resolved
    except (OSError, RuntimeError, ValueError):
        return None
    return None


def device_items(root):
    for path in root.rglob("*"):
        if path.suffix.lower() not in PHOTO_EXTENSIONS:
            continue
        resolved = contained_file(root, path)
        if resolved:
            yield SourceImage(path.name, lambda path=resolved: path.open("rb"))
        else:
            yield SourceImage(path.name, issue="File is unavailable in the source folder.")
