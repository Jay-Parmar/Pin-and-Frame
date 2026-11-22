import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [("catalog", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="ImportRun",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("source", models.CharField(choices=[("device", "Phone or camera"), ("takeout", "Google Takeout"), ("instagram", "Instagram")], max_length=12)),
                ("status", models.CharField(choices=[("running", "Running"), ("completed", "Completed"), ("interrupted", "Interrupted")], default="running", max_length=12)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("trip", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="catalog.trip")),
            ],
            options={"ordering": ["-created_at", "id"]},
        ),
        migrations.CreateModel(
            name="ImportItem",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("result", models.CharField(choices=[("imported", "Imported"), ("reused", "Reused"), ("skipped", "Skipped"), ("failed", "Failed")], max_length=8)),
                ("issue", models.CharField(blank=True, max_length=240)),
                ("caption", models.TextField(blank=True)),
                ("captured_on", models.DateField(blank=True, null=True)),
                ("captured_at", models.DateTimeField(blank=True, null=True)),
                ("capture_text", models.CharField(blank=True, max_length=64)),
                ("published_at", models.DateTimeField(blank=True, null=True)),
                ("latitude", models.FloatField(blank=True, null=True)),
                ("longitude", models.FloatField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("photo", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="import_items", to="catalog.photo")),
                ("run", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="imports.importrun")),
            ],
            options={
                "ordering": ["created_at", "id"],
                "indexes": [models.Index(fields=["run", "result"], name="imports_run_result_idx")],
            },
        ),
    ]
