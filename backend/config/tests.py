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
