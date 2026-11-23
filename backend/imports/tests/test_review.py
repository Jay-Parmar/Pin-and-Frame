from datetime import date, datetime, timezone
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from catalog.models import Photo, Place, Trip, Visit
from imports.models import ImportItem, ImportRun


class ImportReviewTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_superuser(
            username="owner", password="local-test-passphrase"
        )
        self.client.force_authenticate(user=self.owner)
        self.day = date(2025, 5, 3)
        self.trip = Trip.objects.create(title="Sample trip", start_date=self.day, end_date=self.day)
        self.place = Place.objects.create(name="Sample stop", latitude=0, longitude=1)
        self.visit = Visit.objects.create(
            trip=self.trip, place=self.place, visited_on=self.day, position=1
        )
        self.photo = Photo.objects.create(
            sha256="a" * 64, width=800, height=400,
            thumbnail_key="thumb.webp", display_key="display.webp"
        )
        self.run = ImportRun.objects.create(
            trip=self.trip, source=ImportRun.Source.INSTAGRAM, status=ImportRun.Status.COMPLETED
        )
        ImportItem.objects.create(
            run=self.run, result=ImportItem.Result.IMPORTED, name="sample.jpg",
            photo=self.photo, published_at=datetime(2025, 5, 3, tzinfo=timezone.utc),
        )
        self.items_url = reverse("import-items", args=[self.run.pk])
        self.review_url = reverse("photo-review")

    def test_lists_source_metadata_and_pending_assignment(self):
        response = self.client.get(self.items_url, {"status": "pending"})
        self.assertEqual(response.status_code, 200)
        item = response.data["results"][0]
        self.assertEqual(item["suggested_visit"], str(self.visit.pk))
        self.assertEqual(item["suggestion_reason"], "Instagram publication date")
        self.assertIsNone(item["photo"]["captured_on"])
        self.assertEqual(item["photo"]["state"], "pending")

        response = self.client.get(reverse("import-list"))
        self.assertEqual(response.data["results"][0]["counts"]["imported"], 1)

    def test_assigns_photo_and_can_undo_assignment(self):
        response = self.client.post(
            self.review_url,
            {
                "photo_ids": [str(self.photo.pk)],
                "state": "approved",
                "visit": str(self.visit.pk),
                "captured_on": self.day.isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.data, {"updated": 1})
        self.photo.refresh_from_db()
        self.assertEqual(self.photo.visit, self.visit)
        self.assertEqual(self.photo.captured_on, self.day)
        pending = self.client.get(self.items_url, {"status": "pending"})
        self.assertEqual(pending.data["count"], 0)

        response = self.client.post(
            self.review_url, {"photo_ids": [str(self.photo.pk)], "state": "ignored"}, format="json"
        )
        self.assertEqual(response.data, {"updated": 1})
        self.photo.refresh_from_db()
        self.assertEqual(self.photo.state, Photo.State.IGNORED)
        self.assertIsNone(self.photo.visit)

    def test_unknown_photo_rejects_atomic_batch(self):
        response = self.client.post(
            self.review_url,
            {"photo_ids": [str(self.photo.pk), str(uuid4())], "state": "ignored"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.photo.refresh_from_db()
        self.assertEqual(self.photo.state, Photo.State.PENDING)

    def test_import_details_require_owner_session(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.items_url).status_code, 403)
