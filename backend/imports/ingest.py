from collections import Counter
from contextlib import contextmanager
from dataclasses import replace

from django.core.files.storage import default_storage
from django.db import connection, transaction
from django.utils import timezone
from PIL import Image

from catalog.models import Photo

from .media import copy_source, media_keys, open_image, with_file_metadata, write_media
from .models import ImportItem, ImportRun
from .sources import SourceError


IMPORT_LOCK = 0x50494E46


@contextmanager
def import_lock():
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_try_advisory_lock(%s)", [IMPORT_LOCK])
        if not cursor.fetchone()[0]:
            raise SourceError("Another import is running.")
    try:
        yield
    finally:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_unlock(%s)", [IMPORT_LOCK])


def record(run, item, result, issue="", photo=None):
    ImportItem.objects.create(
        run=run,
        name=item.name[:255].replace("\x00", ""),
        result=result,
        issue=issue[:240].replace("\x00", ""),
        photo=photo,
        caption=item.caption.replace("\x00", ""),
        captured_on=item.captured_on,
        captured_at=item.captured_at,
        capture_text=item.capture_text[:64].replace("\x00", ""),
        published_at=item.published_at,
        latitude=item.latitude,
        longitude=item.longitude,
    )
    return result


def outside_window(day, start, end):
    return day is not None and (
        (start is not None and day < start) or (end is not None and day > end)
    )


def source_day(run, item):
    if run.source == ImportRun.Source.INSTAGRAM:
        return item.published_at.date() if item.published_at else None
    return item.captured_on


def ingest_item(run, item, start, end):
    if item.skipped:
        return record(run, item, ImportItem.Result.SKIPPED, item.issue)
    if item.open_file is None:
        return record(run, item, ImportItem.Result.FAILED, item.issue)
    if outside_window(source_day(run, item), start, end):
        return record(run, item, ImportItem.Result.SKIPPED, "Outside the date window.")

    try:
        content, checksum = copy_source(item.open_file)
        with content, open_image(content) as image:
            item = with_file_metadata(item, image)
            day = source_day(run, item)
            if outside_window(day, start, end):
                return record(run, item, ImportItem.Result.SKIPPED, "Outside the date window.")
            if day is None and (start is not None or end is not None):
                item = replace(item, issue=item.issue or "No date to check against the window.")

            photo = Photo.objects.filter(sha256=checksum).first()
            thumbnail_key, display_key = (
                (photo.thumbnail_key, photo.display_key) if photo else media_keys(checksum)
            )
            if photo is None or not all(default_storage.exists(key) for key in (thumbnail_key, display_key)):
                width, height = write_media(image, thumbnail_key, display_key)
    except SourceError as error:
        return record(run, item, ImportItem.Result.FAILED, str(error))
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        return record(run, item, ImportItem.Result.FAILED, "Photo could not be read or saved.")

    with transaction.atomic():
        if photo is not None:
            issue = item.issue
            if photo.visit_id and photo.visit.trip_id != run.trip_id:
                issue = "This photo is already assigned to another trip."
            return record(run, item, ImportItem.Result.REUSED, issue, photo)
        photo = Photo.objects.create(
            sha256=checksum,
            caption=item.caption.replace("\x00", ""),
            captured_on=item.captured_on,
            captured_at=item.captured_at,
            width=width,
            height=height,
            thumbnail_key=thumbnail_key,
            display_key=display_key,
        )
        return record(run, item, ImportItem.Result.IMPORTED, item.issue, photo)


def import_photos(source, trip, items, start=None, end=None):
    with import_lock():
        ImportRun.objects.filter(status=ImportRun.Status.RUNNING).update(
            status=ImportRun.Status.INTERRUPTED, finished_at=timezone.now()
        )
        run = ImportRun.objects.create(source=source, trip=trip)
        status = ImportRun.Status.INTERRUPTED
        try:
            counts = Counter(ingest_item(run, item, start, end) for item in items)
            status = ImportRun.Status.COMPLETED
        finally:
            run.status = status
            run.finished_at = timezone.now()
            run.save(update_fields=["status", "finished_at"])
        return run, counts
