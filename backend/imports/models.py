import uuid

from django.db import models


class ImportRun(models.Model):
    class Source(models.TextChoices):
        DEVICE = "device", "Phone or camera"
        TAKEOUT = "takeout", "Google Takeout"
        INSTAGRAM = "instagram", "Instagram"

    class Status(models.TextChoices):
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        INTERRUPTED = "interrupted", "Interrupted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source = models.CharField(max_length=12, choices=Source.choices)
    trip = models.ForeignKey("catalog.Trip", on_delete=models.PROTECT)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.RUNNING)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "id"]


class ImportItem(models.Model):
    class Result(models.TextChoices):
        IMPORTED = "imported", "Imported"
        REUSED = "reused", "Reused"
        SKIPPED = "skipped", "Skipped"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(ImportRun, on_delete=models.CASCADE, related_name="items")
    name = models.CharField(max_length=255)
    result = models.CharField(max_length=8, choices=Result.choices)
    issue = models.CharField(max_length=240, blank=True)
    photo = models.ForeignKey(
        "catalog.Photo", on_delete=models.SET_NULL, null=True, related_name="import_items"
    )
    caption = models.TextField(blank=True)
    captured_on = models.DateField(null=True, blank=True)
    captured_at = models.DateTimeField(null=True, blank=True)
    capture_text = models.CharField(max_length=64, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["run", "result"], name="imports_run_result_idx")]
