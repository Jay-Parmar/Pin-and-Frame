import hashlib
import os
import warnings
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from tempfile import NamedTemporaryFile, SpooledTemporaryFile

from django.core.files.storage import default_storage
from PIL import ExifTags, Image, ImageOps
from pillow_heif import register_heif_opener

from .sources import SourceError, coordinates


register_heif_opener()

MAX_SOURCE_BYTES = 128 * 1024 * 1024
COPY_CHUNK_BYTES = 1024 * 1024
PHOTO_FORMATS = ("JPEG", "PNG", "WEBP", "HEIF")


def copy_source(open_file):
    content = SpooledTemporaryFile(max_size=8 * COPY_CHUNK_BYTES, mode="w+b")
    checksum = hashlib.sha256()
    size = 0
    try:
        with open_file() as source:
            while chunk := source.read(COPY_CHUNK_BYTES):
                size += len(chunk)
                if size > MAX_SOURCE_BYTES:
                    raise SourceError("Photo exceeds the 128 MB source limit.")
                checksum.update(chunk)
                content.write(chunk)
        content.seek(0)
        return content, checksum.hexdigest()
    except BaseException:
        content.close()
        raise


def open_image(content):
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        return Image.open(content, formats=PHOTO_FORMATS)


def exif_date(timestamp, offset):
    if not isinstance(timestamp, str):
        return None, None
    try:
        value = datetime.strptime(timestamp, "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None, None
    captured_at = None
    if isinstance(offset, str):
        try:
            captured_at = datetime.strptime(timestamp + offset, "%Y:%m:%d %H:%M:%S%z")
        except ValueError:
            pass
    return value.date(), captured_at


def gps_degrees(values, direction):
    if not values or len(values) != 3 or direction not in {"N", "E", "S", "W"}:
        return None
    try:
        degrees, minutes, seconds = map(float, values)
    except (TypeError, ValueError, ZeroDivisionError, OverflowError):
        return None
    if degrees < 0 or not (0 <= minutes < 60 and 0 <= seconds < 60):
        return None
    result = degrees + minutes / 60 + seconds / 3600
    return -result if direction in {"S", "W"} else result


def with_file_metadata(item, image, *, use_matching_local_date=False):
    try:
        exif = image.getexif()
        camera = exif.get_ifd(ExifTags.IFD.Exif)
        gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
        timestamp = camera.get(36867) or exif.get(36867) or camera.get(36868)
        offset = camera.get(36881) or exif.get(36881)
        captured_on, captured_at = exif_date(timestamp, offset)
        latitude, longitude = coordinates(
            gps_degrees(gps.get(2), gps.get(1)), gps_degrees(gps.get(4), gps.get(3))
        )
    except (OSError, TypeError, ValueError, ZeroDivisionError, OverflowError):
        return item

    capture_text = timestamp if isinstance(timestamp, str) else ""
    if item.captured_on is not None:
        matching_instant = item.captured_at is not None and item.captured_at == captured_at
        if not (use_matching_local_date and matching_instant):
            captured_on = item.captured_on
        captured_at = item.captured_at
    if item.latitude is not None:
        latitude, longitude = item.latitude, item.longitude
    return replace(
        item,
        captured_on=captured_on,
        captured_at=captured_at,
        capture_text=item.capture_text or capture_text,
        latitude=latitude,
        longitude=longitude,
    )


def media_keys(checksum):
    folder = f"photos/{checksum[:2]}/{checksum}"
    return f"{folder}/thumbnail.webp", f"{folder}/display.webp"


def write_variant(image, key, max_size, quality):
    resized = image.copy()
    resized.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    out = Path(default_storage.path(key))
    out.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with NamedTemporaryFile(dir=out.parent, delete=False) as temporary:
            temp_path = Path(temporary.name)
            resized.save(temporary, format="WEBP", quality=quality)
        os.replace(temp_path, out)
    finally:
        resized.close()
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def write_media(image, thumbnail_key, display_key):
    with ImageOps.exif_transpose(image) as oriented:
        has_alpha = "A" in oriented.getbands() or "transparency" in oriented.info
        with oriented.convert("RGBA" if has_alpha else "RGB") as pixels:
            pixels.info.clear()
            write_variant(pixels, thumbnail_key, 400, 78)
            write_variant(pixels, display_key, 2048, 86)
            return pixels.size
