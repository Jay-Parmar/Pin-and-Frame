import json
from datetime import date, datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from zipfile import ZipFile

from imports.instagram import instagram_items
from imports.sources import SourceError


class InstagramTests(TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()

    def test_reads_both_manifest_names_and_streams_media(self):
        source = self.root / "sample.zip"
        with ZipFile(source, "w") as archive:
            archive.writestr(
                "your_instagram_activity/media/posts.json",
                json.dumps([{
                    "creation_timestamp": 1735689600,
                    "title": "Synthetic caption",
                    "media": [
                        {
                            "uri": "media/posts/sample.webp",
                            "media_metadata": {
                                "photo_metadata": {
                                    "exif_data": [{
                                        "latitude": 0,
                                        "longitude": 1,
                                        "date_time_original": "2024:10:01 11:00:00",
                                    }],
                                },
                            },
                        },
                        {"uri": "media/posts/sample.mp4"},
                    ],
                }]),
            )
            archive.writestr(
                "your_instagram_activity/media/posts_1.json",
                json.dumps([{"media": [{"uri": "media/posts/other.heic"}]}]),
            )
            archive.writestr("media/posts/sample.webp", b"first")
            archive.writestr("media/posts/other.heic", b"second")

        items = instagram_items(source)
        first = next(items)
        self.assertEqual(first.name, "sample.webp")
        self.assertEqual(first.caption, "Synthetic caption")
        self.assertEqual(first.published_at, datetime(2025, 1, 1, tzinfo=timezone.utc))
        self.assertEqual(first.captured_on, date(2024, 10, 1))
        self.assertIsNone(first.captured_at)
        self.assertEqual((first.latitude, first.longitude), (0, 1))
        with first.open_file() as file:
            self.assertEqual(file.read(), b"first")
        self.assertTrue(next(items).skipped)
        other = next(items)
        with other.open_file() as file:
            self.assertEqual(file.read(), b"second")
        self.assertIsNone(other.captured_on)
        self.assertEqual(list(items), [])

    def test_rejects_media_paths_outside_the_export(self):
        source = self.root / "sample.zip"
        with ZipFile(source, "w") as archive:
            archive.writestr(
                "posts.json",
                json.dumps([{"media": [{"uri": "../sample.jpg"}, {"uri": "C:/sample.jpg"}]}]),
            )
        items = list(instagram_items(source))
        self.assertEqual(len(items), 2)
        self.assertTrue(all(item.open_file is None for item in items))

    def test_imports_an_extracted_folder(self):
        path = self.root / "posts.json"
        path.write_text(json.dumps([{"media": [{"uri": "sample.jpg"}]}]), encoding="utf-8")
        (self.root / "sample.jpg").write_bytes(b"sample")
        (item,) = instagram_items(self.root)
        with item.open_file() as file:
            self.assertEqual(file.read(), b"sample")

    def test_reports_missing_posts_manifest(self):
        with self.assertRaisesRegex(SourceError, "No Instagram posts JSON"):
            list(instagram_items(self.root))
