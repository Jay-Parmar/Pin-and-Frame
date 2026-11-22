from datetime import date

from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.db.models.deletion import ProtectedError
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from catalog.models import Photo, Place, Trip, Visit
from catalog.serializers import (
    GalleryFilters,
    MapFilters,
    MapPlaceSerializer,
    PhotoSerializer,
    PlaceSerializer,
    TripDetailSerializer,
    TripSerializer,
    VisitSerializer,
)


class CatalogViewSet(viewsets.ModelViewSet):
    lookup_value_converter = "uuid"

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Remove or move the linked records first."},
                status=status.HTTP_409_CONFLICT,
            )


class TripViewSet(CatalogViewSet):
    serializer_class = TripSerializer
    queryset = Trip.objects.all()

    def get_serializer_class(self):
        if self.action == "retrieve":
            return TripDetailSerializer
        return super().get_serializer_class()

    def get_queryset(self):
        trips = super().get_queryset()
        if self.action in {"update", "partial_update"}:
            return trips.select_for_update()
        if self.action == "retrieve":
            return trips.prefetch_related(
                Prefetch("visits", queryset=Visit.objects.select_related("place"))
            )
        if self.action == "list":
            filters = MapFilters(data=self.request.query_params)
            filters.is_valid(raise_exception=True)
            year = filters.validated_data.get("year")
            if year:
                trips = trips.filter(
                    start_date__lte=date(year, 12, 31), end_date__gte=date(year, 1, 1)
                )
        return trips

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)


class PlaceViewSet(CatalogViewSet):
    serializer_class = PlaceSerializer
    queryset = Place.objects.all()

    @action(detail=False, url_path="map")
    def map_places(self, request):
        filters = MapFilters(data=request.query_params)
        filters.is_valid(raise_exception=True)
        visits = Visit.objects.all()
        if "trip" in filters.validated_data:
            visits = visits.filter(trip_id=filters.validated_data["trip"])
        if "year" in filters.validated_data:
            visits = visits.filter(visited_on__year=filters.validated_data["year"])
        places = (
            visits.order_by("place__name", "place_id")
            .values("place_id", "place__name", "place__latitude", "place__longitude")
            .annotate(
                photo_count=Count(
                    "photos", filter=Q(photos__state=Photo.State.APPROVED)
                )
            )
        )
        return Response(MapPlaceSerializer(places, many=True).data)

    @action(detail=True)
    def photos(self, request, pk):
        place = self.get_object()
        filters = GalleryFilters(data=request.query_params)
        filters.is_valid(raise_exception=True)
        photos = Photo.objects.filter(visit__place=place, state=Photo.State.APPROVED)
        if "visit" in filters.validated_data:
            photos = photos.filter(visit_id=filters.validated_data["visit"])
        page = self.paginate_queryset(photos)
        return self.get_paginated_response(PhotoSerializer(page, many=True).data)


class VisitViewSet(CatalogViewSet):
    serializer_class = VisitSerializer
    queryset = Visit.objects.select_related("trip", "place")

    def get_queryset(self):
        visits = super().get_queryset()
        if self.action in {"update", "partial_update"}:
            return visits.select_for_update(of=("self",))
        return visits

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)


@api_view(["GET"])
def photo_media(request, photo_id, variant):
    keys = {"thumbnail": "thumbnail_key", "display": "display_key"}
    if variant not in keys:
        raise NotFound()

    photo = get_object_or_404(Photo, pk=photo_id)
    try:
        file = default_storage.open(getattr(photo, keys[variant]), "rb")
    except FileNotFoundError as error:
        raise NotFound("This photo copy is missing.") from error

    response = FileResponse(file, content_type="image/webp", filename=f"{variant}.webp")
    response["Cache-Control"] = "private, no-store"
    return response
