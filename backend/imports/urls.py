from django.urls import path

from .views import ImportItemList, ImportRunList, ReviewPhotos


urlpatterns = [
    path("", ImportRunList.as_view(), name="import-list"),
    path("<uuid:run_id>/items/", ImportItemList.as_view(), name="import-items"),
    path("review/", ReviewPhotos.as_view(), name="photo-review"),
]
