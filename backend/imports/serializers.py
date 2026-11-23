from math import asin, cos, radians, sin, sqrt

from rest_framework import serializers

from catalog.models import Photo, Visit
from catalog.serializers import PhotoSerializer

from .models import ImportItem, ImportRun


class ImportRunSerializer(serializers.ModelSerializer):
    counts = serializers.SerializerMethodField()

    class Meta:
        model = ImportRun
        fields = ["id", "source", "trip", "status", "created_at", "finished_at", "counts"]

    def get_counts(self, run):
        return {result: getattr(run, result) for result in ImportItem.Result.values}


class ReviewPhotoSerializer(PhotoSerializer):
    class Meta(PhotoSerializer.Meta):
        fields = [*PhotoSerializer.Meta.fields, "state"]


def distance_km(lat_a, lon_a, lat_b, lon_b):
    lat_a, lon_a, lat_b, lon_b = map(radians, (lat_a, lon_a, lat_b, lon_b))
    value = sin((lat_b - lat_a) / 2) ** 2 + cos(lat_a) * cos(lat_b) * sin((lon_b - lon_a) / 2) ** 2
    return 12742 * asin(min(1, sqrt(value)))


class ImportItemSerializer(serializers.ModelSerializer):
    photo = ReviewPhotoSerializer(read_only=True)
    suggested_visit = serializers.UUIDField(read_only=True, allow_null=True)
    suggestion_reason = serializers.CharField(read_only=True, allow_null=True)

    class Meta:
        model = ImportItem
        fields = [
            "id", "name", "result", "issue", "captured_on", "captured_at", "published_at",
            "latitude", "longitude", "photo", "suggested_visit", "suggestion_reason",
        ]

    def to_representation(self, item):
        item.suggested_visit, item.suggestion_reason = self.suggest_visit(item)
        return super().to_representation(item)

    def suggest_visit(self, item):
        if item.photo is None or item.photo.state != Photo.State.PENDING:
            return None, None
        visits = self.context["candidate_visits"]
        if item.latitude is not None and item.longitude is not None:
            nearby = [
                visit for visit in visits
                if distance_km(
                    item.latitude, item.longitude, visit.place.latitude, visit.place.longitude
                ) <= 5
            ]
            same_day = [visit for visit in nearby if visit.visited_on == item.captured_on]
            matches = same_day or nearby
            reason = "Nearby GPS"
        else:
            day = item.captured_on
            reason = "Capture date"
            if day is None and item.published_at is not None:
                day = item.published_at.date()
                reason = "Instagram publication date"
            matches = [visit for visit in visits if visit.visited_on == day]
        if len(matches) == 1:
            return matches[0].pk, reason
        return None, None


class ReviewSerializer(serializers.Serializer):
    photo_ids = serializers.ListField(
        child=serializers.UUIDField(), min_length=1, max_length=200
    )
    state = serializers.ChoiceField(choices=Photo.State.choices)
    visit = serializers.PrimaryKeyRelatedField(
        queryset=Visit.objects.all(), allow_null=True, required=False
    )
    captured_on = serializers.DateField(allow_null=True, required=False)

    def validate(self, values):
        approved = values["state"] == Photo.State.APPROVED
        assigned = values.get("visit") is not None
        if approved != assigned:
            message = "Choose a visit to approve photos." if approved else "Clear the visit before changing the state."
            raise serializers.ValidationError({"visit": message})
        return values
