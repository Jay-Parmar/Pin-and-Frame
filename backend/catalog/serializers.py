from math import isfinite

from django.urls import reverse
from rest_framework import serializers

from catalog.models import Photo, Place, Trip, Visit


class TripSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = ["id", "title", "start_date", "end_date"]

    def validate(self, attrs):
        if self.instance:
            start = attrs.get("start_date", self.instance.start_date)
            end = attrs.get("end_date", self.instance.end_date)
        else:
            start, end = attrs["start_date"], attrs["end_date"]

        if end < start:
            raise serializers.ValidationError(
                {"end_date": "Use a date on or after the start."}
            )
        if (
            self.instance
            and self.instance.visits.exclude(visited_on__range=(start, end)).exists()
        ):
            raise serializers.ValidationError("Trip dates must include its visits.")
        return attrs


class PlaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Place
        fields = ["id", "name", "latitude", "longitude"]

    def validate(self, attrs):
        for field in ("latitude", "longitude"):
            if field in attrs and not isfinite(attrs[field]):
                raise serializers.ValidationError({field: "Enter a finite coordinate."})
        return attrs


class VisitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Visit
        fields = ["id", "trip", "place", "visited_on", "position"]
        validators = []

    def validate(self, attrs):
        if self.instance:
            source_trip_id = self.instance.trip_id
            trip_id = attrs["trip"].pk if "trip" in attrs else source_trip_id
            day = attrs.get("visited_on", self.instance.visited_on)
            position = attrs.get("position", self.instance.position)
        else:
            trip_id = source_trip_id = attrs["trip"].pk
            day, position = attrs["visited_on"], attrs["position"]

        trips = {
            trip.pk: trip
            for trip in Trip.objects.filter(pk__in={source_trip_id, trip_id})
            .order_by("pk")
            .select_for_update()
        }
        trip = trips.get(trip_id)
        if trip is None:
            raise serializers.ValidationError({"trip": "Choose an existing trip."})

        if not trip.start_date <= day <= trip.end_date:
            raise serializers.ValidationError(
                {"visited_on": "Use a date within the trip."}
            )
        matching = Visit.objects.filter(trip=trip, position=position)
        if self.instance:
            matching = matching.exclude(pk=self.instance.pk)
        if matching.exists():
            raise serializers.ValidationError(
                {"position": "This position is already in use."}
            )
        return attrs


class VisitDetailSerializer(VisitSerializer):
    place = PlaceSerializer(read_only=True)

    class Meta(VisitSerializer.Meta):
        fields = ["id", "place", "visited_on", "position"]


class TripDetailSerializer(TripSerializer):
    visits = VisitDetailSerializer(many=True, read_only=True)

    class Meta(TripSerializer.Meta):
        fields = [*TripSerializer.Meta.fields, "visits"]


class PhotoSerializer(serializers.ModelSerializer):
    thumbnail_url = serializers.SerializerMethodField()
    display_url = serializers.SerializerMethodField()

    class Meta:
        model = Photo
        fields = [
            "id",
            "caption",
            "captured_on",
            "captured_at",
            "width",
            "height",
            "thumbnail_url",
            "display_url",
            "visit",
        ]
        read_only_fields = fields

    def get_thumbnail_url(self, photo):
        return reverse("photo-media", args=[photo.id, "thumbnail"])

    def get_display_url(self, photo):
        return reverse("photo-media", args=[photo.id, "display"])


class MapFilters(serializers.Serializer):
    trip = serializers.UUIDField(required=False)
    year = serializers.IntegerField(required=False, min_value=1, max_value=9999)


class GalleryFilters(MapFilters):
    visit = serializers.UUIDField(required=False)


class MapPlaceSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="place_id")
    name = serializers.CharField(source="place__name")
    latitude = serializers.FloatField(source="place__latitude")
    longitude = serializers.FloatField(source="place__longitude")
    photo_count = serializers.IntegerField()
