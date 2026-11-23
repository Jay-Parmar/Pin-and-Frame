from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Event

from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.test import TransactionTestCase, skipUnlessDBFeature
from rest_framework.test import APIClient

from catalog.models import Place, Trip, Visit


@skipUnlessDBFeature("has_select_for_update")
class TripVisitConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_superuser("owner")
        self.trip = Trip.objects.create(
            title="Sample trip", start_date=date(2025, 5, 1), end_date=date(2025, 5, 2)
        )
        self.place = Place.objects.create(name="Garden", latitude=0, longitude=12)

    def request_after_trip_write(self, write, request):
        waiting = Event()

        def observe_lock(execute, sql, params, many, context):
            if '"catalog_trip"' in sql and "FOR UPDATE" in sql:
                waiting.set()
            return execute(sql, params, many, context)

        def send_request():
            client = APIClient()
            client.force_authenticate(self.owner)
            try:
                with connection.execute_wrapper(observe_lock):
                    return request(client)
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=1) as executor:
            with transaction.atomic():
                trip = Trip.objects.select_for_update().get(pk=self.trip.pk)
                write(trip)
                future = executor.submit(send_request)
                self.assertTrue(
                    waiting.wait(timeout=5), "Request did not lock the trip."
                )
            return future.result(timeout=5)

    def test_visit_checks_dates_after_trip_changes(self):
        def shorten(trip):
            trip.end_date = trip.start_date
            trip.save(update_fields=["end_date"])

        response = self.request_after_trip_write(
            shorten,
            lambda client: client.post(
                "/api/v1/visits/",
                {
                    "trip": self.trip.pk,
                    "place": self.place.pk,
                    "visited_on": self.trip.end_date,
                    "position": 1,
                },
            ),
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("visited_on", response.data)
        self.assertFalse(Visit.objects.exists())

    def test_trip_checks_visits_added_by_another_transaction(self):
        def add_visit(trip):
            Visit.objects.create(
                trip=trip, place=self.place, visited_on=trip.end_date, position=1
            )

        response = self.request_after_trip_write(
            add_visit,
            lambda client: client.patch(
                f"/api/v1/trips/{self.trip.pk}/", {"end_date": self.trip.start_date}
            ),
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Trip.objects.get(pk=self.trip.pk).end_date, self.trip.end_date)
