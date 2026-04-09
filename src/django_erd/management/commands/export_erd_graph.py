"""Management command to export ERD graph data as JSON."""

from __future__ import annotations

import json
import sys

from django.conf import settings
from django.core.management.base import BaseCommand

from django_erd.graph import build_graph
from django_erd.introspect import extract_models


class Command(BaseCommand):
    help = "Export ERD graph data as JSON for use with load_erd_graph."

    def add_arguments(self, parser):
        parser.add_argument(
            "output",
            nargs="?",
            default="-",
            help="Output file path (default: stdout).",
        )
        parser.add_argument(
            "--include-apps",
            nargs="*",
            help="Only include these app labels (overrides ERD_INCLUDE_APPS setting).",
        )
        parser.add_argument(
            "--exclude-apps",
            nargs="*",
            help="Exclude these app labels (overrides ERD_EXCLUDE_APPS setting).",
        )

    def handle(self, *args, **options):
        include = options["include_apps"] or getattr(settings, "ERD_INCLUDE_APPS", None)
        exclude = options["exclude_apps"] or getattr(settings, "ERD_EXCLUDE_APPS", None)

        models = extract_models(include_apps=include, exclude_apps=exclude)
        components = build_graph(models)

        data = {
            "components": [
                {
                    "id": c.id,
                    "title": c.title,
                    "centralModelLabel": c.central_model_label,
                    **c.to_dict(),
                }
                for c in components
            ],
        }

        output_path = options["output"]
        json_str = json.dumps(data, indent=2)

        if output_path == "-":
            sys.stdout.write(json_str)
            sys.stdout.write("\n")
        else:
            with open(output_path, "w") as f:
                f.write(json_str)
            self.stdout.write(self.style.SUCCESS(f"Exported {len(components)} component(s) to {output_path}"))
