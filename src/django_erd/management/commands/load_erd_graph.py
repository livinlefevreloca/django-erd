"""Management command to load exported ERD graph data for local viewing."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from django_erd.views import ERD_FIXTURE_FILENAME


class Command(BaseCommand):
    help = "Load an exported ERD JSON file so the ERD views display it instead of introspecting local models."

    def add_arguments(self, parser):
        parser.add_argument(
            "input",
            help="Path to the JSON file created by export_erd_graph.",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Remove the loaded fixture so views revert to live introspection.",
        )

    def handle(self, *args, **options):
        base_dir = Path(settings.BASE_DIR) if hasattr(settings, "BASE_DIR") else Path(".")
        dest = base_dir / ERD_FIXTURE_FILENAME

        if options["clear"]:
            if dest.exists():
                dest.unlink()
                self.stdout.write(self.style.SUCCESS(f"Removed {dest}"))
            else:
                self.stdout.write("No fixture file to remove.")
            return

        input_path = Path(options["input"])
        if not input_path.exists():
            raise CommandError(f"File not found: {input_path}")

        # Validate JSON structure
        with open(input_path) as f:
            data = json.load(f)

        if "components" not in data:
            raise CommandError("Invalid ERD export file: missing 'components' key.")

        count = len(data["components"])
        shutil.copy2(input_path, dest)
        self.stdout.write(self.style.SUCCESS(
            f"Loaded {count} component(s) from {input_path} -> {dest}"
        ))
