from django.contrib.auth import get_user_model
from django.test import Client, TestCase


class OwnerSessionTests(TestCase):
    def setUp(self):
        self.browser = Client(enforce_csrf_checks=True)
        self.password = "test-owner-login"
        get_user_model().objects.create_superuser(username="owner", password=self.password)

    def post(self, path, data, token=None):
        headers = {"X-CSRFToken": token} if token else {}
        return self.browser.post(path, data, content_type="application/json", headers=headers)

    def test_owner_signs_in_and_out_with_csrf(self):
        session_url = "/api/v1/session/"
        login_url = "/api/v1/session/login/"
        credentials = {"username": "owner", "password": self.password}
        self.assertEqual(self.browser.get(session_url).json(), {"authenticated": False, "username": None})
        self.assertEqual(self.post(login_url, credentials).status_code, 403)

        token = self.browser.cookies["csrftoken"].value
        response = self.post(login_url, credentials, token)
        self.assertEqual(response.json(), {"authenticated": True, "username": "owner"})
        self.assertTrue(response.cookies["sessionid"]["httponly"])
        self.assertEqual(response.cookies["sessionid"]["samesite"], "Strict")
        self.assertEqual(response.cookies["csrftoken"]["samesite"], "Strict")
        self.assertTrue(self.browser.get(session_url).json()["authenticated"])

        token = self.browser.cookies["csrftoken"].value
        response = self.post("/api/v1/session/logout/", {}, token)
        self.assertFalse(response.json()["authenticated"])
        self.assertFalse(self.browser.get(session_url).json()["authenticated"])

    def test_regular_users_cannot_sign_in(self):
        get_user_model().objects.create_user(username="viewer", password=self.password)
        self.browser.get("/api/v1/session/")
        token = self.browser.cookies["csrftoken"].value
        response = self.post(
            "/api/v1/session/login/",
            {"username": "viewer", "password": self.password},
            token,
        )
        self.assertEqual(response.status_code, 401)


class PrivateApiTests(TestCase):
    def test_api_data_and_errors_use_private_response_headers(self):
        for response in (
            self.client.get("/api/v1/trips/"),
            self.client.get("/api/v1/session/"),
        ):
            self.assertIn("no-store", response["Cache-Control"])
            self.assertIn("private", response["Cache-Control"])
            self.assertEqual(response["Cross-Origin-Resource-Policy"], "same-origin")

        owner = get_user_model().objects.create_superuser(username="owner")
        self.client.force_login(owner)
        response = self.client.get("/api/v1/trips/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("no-store", response["Cache-Control"])
        self.assertEqual(response["Cross-Origin-Resource-Policy"], "same-origin")

    def test_non_loopback_peer_cannot_access_the_api(self):
        response = self.client.get(
            "/api/v1/session/",
            REMOTE_ADDR="192.0.2.10",
            HTTP_X_FORWARDED_FOR="127.0.0.1",
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("no-store", response["Cache-Control"])

    def test_oversized_api_body_is_rejected(self):
        with self.settings(DATA_UPLOAD_MAX_MEMORY_SIZE=64):
            response = self.client.post(
                "/api/v1/trips/", {"title": "A" * 160}, content_type="application/json"
            )
        self.assertEqual(response.status_code, 413)
        self.assertIn("no-store", response["Cache-Control"])
