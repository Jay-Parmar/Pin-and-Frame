from datetime import date
from pathlib import Path
from uuid import UUID

from django.core.management.base import BaseCommand, CommandError

from catalog.models import Trip
from imports.ingest import import_photos
from imports.instagram import instagram_items
from imports.models import ImportItem, ImportRun
from imports.sources import SourceError, device_items
from imports.takeout import takeout_items


SOURCES = {
    ImportRun.Source.DEVICE: device_items,
    ImportRun.Source.TAKEOUT: takeout_items,
    ImportRun.Source.INSTAGRAM: instagram_items,
}


class Command(BaseCommand):
    help = "Import photos into a trip for review."

    def add_arguments(self, parser):
        parser.add_argument("path", type=Path)
        parser.add_argument("--source", required=True, choices=SOURCES)
        parser.add_argument("--trip", required=True, type=UUID)
        parser.add_argument("--from-date", type=date.fromisoformat)
        parser.add_argument("--to-date", type=date.fromisoformat)

    def handle(self, path, source, trip, from_date, to_date, **options):
        if from_date and to_date and from_date > to_date:
            raise CommandError("The start date must be on or before the end date.")
        try:
            root = path.resolve(strict=True)
        except (OSError, RuntimeError):
            raise CommandError("The import source is unavailable.") from None
        instagram_zip = source == ImportRun.Source.INSTAGRAM and root.is_file() and root.suffix.lower() == ".zip"
        if not root.is_dir() and not instagram_zip:
            raise CommandError("Choose an extracted source folder or an Instagram ZIP.")
        try:
            target_trip = Trip.objects.get(pk=trip)
        except Trip.DoesNotExist:
            raise CommandError("The trip does not exist.") from None
        try:
            run, counts = import_photos(source, target_trip, SOURCES[source](root), from_date, to_date)
        except SourceError as error:
            raise CommandError(str(error)) from None
        totals = ", ".join(f"{counts[result]} {result}" for result in ImportItem.Result.values)
        self.stdout.write(f"Import {run.pk} completed: {totals}.")
