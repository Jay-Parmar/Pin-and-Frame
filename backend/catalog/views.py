from datetime import date

from django.core.exceptions import SuspiciousFileOperation
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.db.models.deletion import ProtectedError
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from catalog.media import photo_path
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


def scoped_visits(filters):
    visits = Visit.objects.all()
    if "trip" in filters:
        visits = visits.filter(trip_id=filters["trip"])
    if "year" in filters:
        visits = visits.filter(visited_on__year=filters["year"])
    if "visit" in filters:
        visits = visits.filter(pk=filters["visit"])
    return visits


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
        visits = scoped_visits(filters.validated_data)
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
        visits = scoped_visits(filters.validated_data).filter(place=place)
        photos = Photo.objects.filter(visit__in=visits, state=Photo.State.APPROVED)
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
        file = photo_path(getattr(photo, keys[variant])).open("rb")
    except (OSError, RuntimeError, SuspiciousFileOperation, ValueError):
        raise NotFound("This photo copy is missing.") from None

    return FileResponse(file, content_type="image/webp", filename=f"{variant}.webp")
