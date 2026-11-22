from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from rest_framework.test import APIClient

from catalog.models import Photo, Place, Trip, Visit


class SessionTests(TestCase):
    def test_owner_login_and_logout_require_csrf(self):
        get_user_model().objects.create_superuser(
            "owner", password="test-only-password"
        )
        client = Client(enforce_csrf_checks=True)
        login_path = "/api/v1/session/login/"
        credentials = {"username": "owner", "password": "test-only-password"}

        self.assertEqual(
            client.get("/api/v1/session/").json(),
            {
                "authenticated": False,
                "username": None,
            },
        )
        self.assertEqual(
            client.post(
                login_path, credentials, content_type="application/json"
            ).status_code,
            403,
        )
        response = client.post(
            login_path,
            credentials,
            content_type="application/json",
            HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
        )
        self.assertEqual(response.json(), {"authenticated": True, "username": "owner"})
        self.assertEqual(client.post("/api/v1/trips/", {}).status_code, 403)
        self.assertEqual(client.post("/api/v1/session/logout/").status_code, 403)
        response = client.post(
            "/api/v1/session/logout/",
            HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
        )
        self.assertEqual(response.json(), {"authenticated": False, "username": None})

    def test_other_accounts_cannot_sign_in(self):
        get_user_model().objects.create_user("visitor", password="test-only-password")
        response = self.client.post(
            "/api/v1/session/login/",
            {"username": "visitor", "password": "test-only-password"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)


class CatalogTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = get_user_model().objects.create_superuser("owner")
        cls.trip = Trip.objects.create(
            title="Spring walk", start_date=date(2025, 4, 7), end_date=date(2025, 4, 9)
        )
        cls.other_trip = Trip.objects.create(
            title="Return walk",
            start_date=date(2026, 4, 17),
            end_date=date(2026, 4, 19),
        )
        cls.place = Place.objects.create(name="Garden", latitude=12.5, longitude=0)
        cls.visit = Visit.objects.create(
            trip=cls.trip, place=cls.place, visited_on=cls.trip.start_date, position=1
        )
        cls.other_visit = Visit.objects.create(
            trip=cls.other_trip,
            place=cls.place,
            visited_on=cls.other_trip.start_date,
            position=1,
        )
        cls.photo = Photo.objects.create(
            sha256="a" * 64,
            caption="First visit",
            captured_on=cls.trip.start_date,
            visit=cls.visit,
            state=Photo.State.APPROVED,
            width=40,
            height=20,
            thumbnail_key="sample/thumbnail.webp",
            display_key="sample/display.webp",
        )
        Photo.objects.create(
            sha256="b" * 64,
            visit=cls.other_visit,
            state=Photo.State.APPROVED,
            width=40,
            height=20,
            thumbnail_key="second/thumbnail.webp",
            display_key="second/display.webp",
        )
        Photo.objects.create(
            sha256="c" * 64,
            width=40,
            height=20,
            thumbnail_key="pending/thumbnail.webp",
            display_key="pending/display.webp",
        )

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(self.owner)

    def test_map_and_gallery_count_repeat_visits(self):
        map_path = "/api/v1/places/map/"
        result = self.api.get(map_path).json()
        self.assertEqual(
            result,
            [
                {
                    "id": str(self.place.id),
                    "name": "Garden",
                    "latitude": 12.5,
                    "longitude": 0,
                    "photo_count": 2,
                }
            ],
        )
        self.assertEqual(
            self.api.get(map_path, {"year": 2025}).json()[0]["photo_count"], 1
        )
        self.assertEqual(
            self.api.get(map_path, {"trip": self.trip.id}).json()[0]["photo_count"], 1
        )
        self.assertEqual(self.api.get(map_path, {"year": 2024}).json(), [])

        gallery_path = f"/api/v1/places/{self.place.id}/photos/"
        self.assertEqual(self.api.get(gallery_path).json()["count"], 2)
        gallery = self.api.get(gallery_path, {"visit": self.visit.id}).json()
        self.assertEqual(gallery["count"], 1)
        photo = gallery["results"][0]
        self.assertEqual(photo["id"], str(self.photo.id))
        self.assertEqual(
            photo["thumbnail_url"], f"/api/v1/photos/{self.photo.id}/thumbnail/"
        )
        self.assertNotIn("thumbnail_key", photo)

    def test_trip_detail_orders_visits_and_year_filters_trips(self):
        new_place = Place.objects.create(name="Lake", latitude=0, longitude=0)
        later = Visit.objects.create(
            trip=self.trip, place=new_place, visited_on=self.trip.end_date, position=2
        )
        trip = self.api.get(f"/api/v1/trips/{self.trip.id}/").json()
        self.assertEqual(
            [stop["id"] for stop in trip["visits"]], [str(self.visit.id), str(later.id)]
        )
        self.assertEqual(trip["visits"][1]["place"]["name"], "Lake")
        results = self.api.get("/api/v1/trips/", {"year": 2025}).json()
        self.assertEqual(
            [entry["id"] for entry in results["results"]], [str(self.trip.id)]
        )

    def test_invalid_dates_coordinates_and_duplicate_positions(self):
        response = self.api.post(
            "/api/v1/trips/",
            {
                "title": "Invalid",
                "start_date": "2026-06-01",
                "end_date": "2026-05-31",
            },
        )
        self.assertEqual(response.status_code, 400)
        response = self.api.post(
            "/api/v1/places/", {"name": "Invalid", "latitude": "NaN", "longitude": 0}
        )
        self.assertEqual(response.status_code, 400)
        response = self.api.post(
            "/api/v1/visits/",
            {
                "trip": self.trip.id,
                "place": self.place.id,
                "visited_on": self.trip.start_date,
                "position": 1,
            },
        )
        self.assertEqual(response.status_code, 400)
        response = self.api.post(
            "/api/v1/visits/",
            {
                "trip": self.trip.id,
                "place": self.place.id,
                "visited_on": self.other_trip.start_date,
                "position": 2,
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_existing_photo_protects_visits_from_deletion(self):
        response = self.api.delete(f"/api/v1/visits/{self.visit.id}/")
        self.assertEqual(response.status_code, 409)
        self.assertTrue(Visit.objects.filter(pk=self.visit.pk).exists())

    def test_media_checks_the_owner_and_never_exposes_source_keys(self):
        media_url = f"/api/v1/photos/{self.photo.id}/thumbnail/"
        self.assertEqual(self.client.get(media_url).status_code, 403)
        self.assertEqual(self.client.get("/api/v1/trips/").status_code, 403)
        with TemporaryDirectory() as media_root, self.settings(MEDIA_ROOT=media_root):
            photo_path = Path(media_root) / self.photo.thumbnail_key
            photo_path.parent.mkdir()
            photo_path.write_bytes(b"test image")
            response = self.api.get(media_url)
            self.assertEqual(b"".join(response.streaming_content), b"test image")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Content-Type"], "image/webp")
            self.assertIn("no-store", response["Cache-Control"])
            self.assertEqual(
                self.api.get(f"/api/v1/photos/{self.photo.id}/display/").status_code,
                404,
            )
