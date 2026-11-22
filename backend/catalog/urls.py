from django.urls import path
from rest_framework.routers import SimpleRouter

from catalog.views import PlaceViewSet, TripViewSet, VisitViewSet, photo_media

router = SimpleRouter(use_regex_path=False)
router.register("trips", TripViewSet)
router.register("places", PlaceViewSet)
router.register("visits", VisitViewSet)

urlpatterns = [
    path("photos/<uuid:photo_id>/<str:variant>/", photo_media, name="photo-media"),
    *router.urls,
]
