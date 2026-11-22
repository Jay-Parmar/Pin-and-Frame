import json
from datetime import date, datetime, timezone
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase
from PIL import Image

from catalog.models import Photo, Place, Trip, Visit
from imports.media import write_variant
from imports.models import ImportItem, ImportRun


class DeviceImportTests(TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.source = root / "source"
        self.source.mkdir()
        self.media = root / "media"
        self.enterContext(self.settings(MEDIA_ROOT=self.media))
        self.trip = Trip.objects.create(
            title="Sample trip", start_date=date(2025, 5, 2), end_date=date(2025, 5, 4)
        )

    def import_source(self, source="device", **options):
        call_command(
            "import_photos",
            str(self.source),
            source=source,
            trip=self.trip.pk,
            stdout=StringIO(),
            **options,
        )
        return ImportRun.objects.first()

    def write_photo(self, name="sample.jpg"):
        exif = Image.Exif()
        exif[274] = 6
        exif[36867] = "2025:05:03 11:00:00"
        with Image.new("RGB", (800, 400), "orange") as image:
            image.save(self.source / name, exif=exif)

    def test_reimport_preserves_review_and_strips_exif(self):
        self.write_photo()
        run = self.import_source()
        photo = Photo.objects.get()
        self.assertEqual(run.items.get().result, ImportItem.Result.IMPORTED)
        self.assertEqual(photo.captured_on, date(2025, 5, 3))
        self.assertIsNone(photo.captured_at)
        self.assertEqual((photo.width, photo.height), (400, 800))
        with Image.open(self.media / photo.thumbnail_key) as thumbnail:
            self.assertEqual(thumbnail.size, (200, 400))
            self.assertFalse(thumbnail.getexif())

        place = Place.objects.create(name="Sample stop", latitude=0, longitude=1)
        visit = Visit.objects.create(
            trip=self.trip, place=place, visited_on=date(2025, 5, 3), position=1
        )
        photo.visit = visit
        photo.state = Photo.State.APPROVED
        photo.captured_on = date(2025, 5, 2)
        photo.save(update_fields=["visit", "state", "captured_on"])
        rerun = self.import_source()
        photo.refresh_from_db()
        self.assertEqual(rerun.items.get().result, ImportItem.Result.REUSED)
        self.assertEqual(photo.visit, visit)
        self.assertEqual(photo.captured_on, date(2025, 5, 2))
        self.assertEqual(Photo.objects.count(), 1)

    def test_malformed_image_does_not_stop_batch(self):
        self.write_photo()
        (self.source / "invalid.jpg").write_bytes(b"invalid")
        run = self.import_source()
        self.assertEqual(run.status, ImportRun.Status.COMPLETED)
        self.assertEqual(
            set(run.items.values_list("result", flat=True)),
            {ImportItem.Result.IMPORTED, ImportItem.Result.FAILED},
        )

    def test_date_window_skips_known_dates_and_keeps_missing_dates_for_review(self):
        self.write_photo()
        with Image.new("RGB", (200, 100), "blue") as image:
            image.save(self.source / "undated.jpg")
        run = self.import_source(from_date=date(2025, 5, 4))
        self.assertEqual(run.items.get(name="sample.jpg").result, ImportItem.Result.SKIPPED)
        undated = run.items.get(name="undated.jpg")
        self.assertEqual(undated.result, ImportItem.Result.IMPORTED)
        self.assertIn("No date", undated.issue)

    def test_rerun_recovers_partial_media_write(self):
        self.write_photo()
        previous = ImportRun.objects.create(source="device", trip=self.trip)

        def fail_display(image, key, max_size, quality):
            if key.endswith("/display.webp"):
                raise OSError("Write interrupted")
            write_variant(image, key, max_size, quality)

        with patch("imports.media.write_variant", side_effect=fail_display):
            run = self.import_source()
        self.assertEqual(run.items.get().result, ImportItem.Result.FAILED)
        self.assertFalse(Photo.objects.exists())
        previous.refresh_from_db()
        self.assertEqual(previous.status, ImportRun.Status.INTERRUPTED)

        self.import_source()
        photo = Photo.objects.get()
        self.assertTrue((self.media / photo.display_key).is_file())
        self.assertTrue((self.media / photo.thumbnail_key).is_file())

    def test_takeout_window_uses_local_date_when_exif_matches_the_sidecar_instant(self):
        local_day = date(2025, 5, 3)
        captured = datetime(2025, 5, 2, 19, 30, tzinfo=timezone.utc)
        exif = Image.Exif()
        exif[36867] = "2025:05:03 01:00:00"
        exif[36881] = "+05:30"
        with Image.new("RGB", (200, 100), "purple") as image:
            image.save(self.source / "local.jpg", exif=exif)
        sidecar = self.source / "local.jpg.supplemental-metadata.json"
        sidecar.write_text(
            json.dumps({"title": "local.jpg", "photoTakenTime": {"timestamp": str(captured.timestamp())}}),
            encoding="utf-8",
        )

        run = self.import_source(source="takeout", from_date=local_day, to_date=local_day)
        photo = run.items.get().photo
        self.assertEqual(photo.captured_on, local_day)
        self.assertEqual(photo.captured_at, captured)

        captured = captured.replace(day=1)
        sidecar.write_text(
            json.dumps({"title": "local.jpg", "photoTakenTime": {"timestamp": str(captured.timestamp())}}),
            encoding="utf-8",
        )
        corrected = self.import_source(source="takeout", from_date=local_day)
        self.assertEqual(corrected.items.get().result, ImportItem.Result.SKIPPED)
