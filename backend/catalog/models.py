from uuid import uuid4

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q


class Trip(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    title = models.CharField(max_length=200)
    start_date = models.DateField()
    end_date = models.DateField()

    class Meta:
        ordering = ["-start_date", "-end_date", "title", "id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_date__gte=F("start_date")),
                name="trip_end_on_or_after_start",
            )
        ]

    def __str__(self):
        return self.title


class Place(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=200)
    latitude = models.FloatField(
        validators=[MinValueValidator(-90), MaxValueValidator(90)]
    )
    longitude = models.FloatField(
        validators=[MinValueValidator(-180), MaxValueValidator(180)]
    )

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(latitude__range=(-90, 90), longitude__range=(-180, 180)),
                name="place_coordinates_in_range",
            )
        ]

    def __str__(self):
        return self.name


class Visit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    trip = models.ForeignKey(Trip, on_delete=models.PROTECT, related_name="visits")
    place = models.ForeignKey(Place, on_delete=models.PROTECT, related_name="visits")
    visited_on = models.DateField()
    position = models.PositiveIntegerField(validators=[MinValueValidator(1)])

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["trip", "position"], name="visit_trip_position"
            ),
            models.CheckConstraint(
                condition=Q(position__gte=1), name="visit_positive_position"
            ),
        ]

    def __str__(self):
        return f"{self.place} on {self.visited_on}"


class Photo(models.Model):
    class State(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        IGNORED = "ignored", "Ignored"

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    sha256 = models.CharField(max_length=64, unique=True)
    caption = models.TextField(blank=True)
    captured_at = models.DateTimeField(null=True, blank=True)
    captured_on = models.DateField(null=True, blank=True)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    thumbnail_key = models.CharField(max_length=255)
    display_key = models.CharField(max_length=255)
    visit = models.ForeignKey(
        Visit, on_delete=models.PROTECT, related_name="photos", null=True, blank=True
    )
    state = models.CharField(max_length=8, choices=State.choices, default=State.PENDING)

    class Meta:
        ordering = [F("captured_on").asc(nulls_last=True), "id"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(state="approved", visit__isnull=False)
                    | Q(state__in=["pending", "ignored"], visit__isnull=True)
                ),
                name="photo_assignment_matches_state",
            ),
            models.CheckConstraint(
                condition=Q(width__gte=1, height__gte=1),
                name="photo_dimensions_positive",
            ),
        ]
