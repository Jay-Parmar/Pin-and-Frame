import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from imports.takeout import takeout_items


class TakeoutTests(TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()

    def photo(self, folder, name):
        directory = self.root / folder
        directory.mkdir(parents=True, exist_ok=True)
        (directory / name).touch()

    def sidecar(self, folder, name, title, longitude):
        directory = self.root / folder
        directory.mkdir(parents=True, exist_ok=True)
        metadata = {
            "title": title,
            "photoTakenTime": {"timestamp": "1735689600"},
            "geoData": {"latitude": 0, "longitude": 0},
            "geoDataExif": {"latitude": 0, "longitude": longitude},
        }
        (directory / name).write_text(json.dumps(metadata), encoding="utf-8")

    def test_matches_same_album_across_split_parts(self):
        self.photo("part-1/Takeout/Google Photos/Album A", "photo.jpg")
        self.photo("part-1/Takeout/Google Photos/Album B", "photo.jpg")
        self.sidecar(
            "part-2/Takeout/Google Photos/Album A",
            "photo.jpg.supplemental-metadata.json",
            "photo.jpg",
            4,
        )
        self.sidecar(
            "part-2/Takeout/Google Photos/Album B",
            "photo.jpg.supplemental-metadata.json",
            "photo.jpg",
            7,
        )
        album_a, album_b = sorted(takeout_items(self.root), key=lambda item: item.longitude)
        self.assertEqual((album_a.longitude, album_b.longitude), (4, 7))
        self.assertEqual(album_a.latitude, 0)
        self.assertEqual(album_a.captured_at, datetime(2025, 1, 1, tzinfo=timezone.utc))

    def test_duplicate_suffix_pairs_with_the_corresponding_sidecar(self):
        self.photo("Album", "photo.jpg")
        self.photo("Album", "photo(1).jpg")
        self.sidecar("Album", "photo.jpg.supplemental-metadata(1).json", "photo.jpg", 2)
        items = {item.name: item for item in takeout_items(self.root)}
        self.assertEqual(items["photo(1).jpg"].longitude, 2)
        self.assertIsNone(items["photo.jpg"].longitude)

    def test_does_not_apply_one_sidecar_to_colliding_photos_in_the_same_album(self):
        local = "part-1/Takeout/Google Photos/Album"
        split = "part-2/Takeout/Google Photos/Album"
        self.photo(local, "photo.jpg")
        self.photo(split, "photo.jpg")
        self.sidecar(local, "photo.jpg.supplemental-metadata.json", "photo.jpg", 4)
        items = list(takeout_items(self.root))
        self.assertEqual([item.longitude for item in items if item.longitude is not None], [4])
        self.assertEqual(sum(bool(item.issue) for item in items), 1)

    def test_ambiguous_title_leaves_file_metadata_as_fallback(self):
        self.photo("Photos", "photo.jpg")
        self.sidecar("Album A", "truncated.json", "photo.jpg", 2)
        self.sidecar("Album B", "truncated.json", "photo.jpg", 3)
        (item,) = takeout_items(self.root)
        self.assertIn("Multiple Takeout files", item.issue)
        self.assertIsNone(item.latitude)
        self.assertIsNone(item.captured_at)
