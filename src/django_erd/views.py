"""Views for the Django ERD app."""

from __future__ import annotations

import json
from importlib import resources
from pathlib import Path

from django.conf import settings
from django.contrib.admin.views.decorators import staff_member_required
from django.http import HttpRequest, HttpResponse
from django.template import loader

from django_erd.graph import build_graph
from django_erd.introspect import extract_models

ERD_FIXTURE_FILENAME = ".erd_fixture.json"


def _get_app_filters() -> tuple[list[str] | None, list[str] | None]:
    """Read include/exclude app filters from Django settings."""
    include = getattr(settings, "ERD_INCLUDE_APPS", None)
    exclude = getattr(settings, "ERD_EXCLUDE_APPS", None)
    return include, exclude


def _get_fixture_path() -> Path | None:
    """Return the fixture file path if one exists."""
    # Explicit setting takes priority
    explicit = getattr(settings, "ERD_FIXTURE_FILE", None)
    if explicit:
        path = Path(explicit)
        if path.exists():
            return path

    # Auto-detect from BASE_DIR
    if hasattr(settings, "BASE_DIR"):
        path = Path(settings.BASE_DIR) / ERD_FIXTURE_FILENAME
        if path.exists():
            return path

    return None


def _load_fixture_components(fixture_path: Path) -> list[_FixtureComponent]:
    """Load graph components from an exported JSON fixture."""
    with open(fixture_path) as f:
        data = json.load(f)

    components = []
    for entry in data["components"]:
        components.append(_FixtureComponent(
            id=entry["id"],
            title=entry["title"],
            central_model_label=entry["centralModelLabel"],
            models_data=entry["nodes"],
            edges_data=entry["edges"],
        ))
    return components


class _FixtureModel:
    """Lightweight stand-in for ModelInfo when loaded from a fixture file."""

    def __init__(self, data: dict):
        self.model_name = data.get("label", "")
        self.app_label = data.get("app", "")
        self.label = data.get("id", "")


class _FixtureComponent:
    """Lightweight stand-in for GraphComponent when loaded from a fixture file."""

    def __init__(self, id, title, central_model_label, models_data, edges_data):
        self.id = id
        self.title = title
        self.central_model_label = central_model_label
        self._nodes = models_data
        self._edges = edges_data
        self.models = [_FixtureModel(n) for n in models_data]
        self.edges = edges_data

    @property
    def central_model_name(self) -> str:
        return self.central_model_label.split(".")[-1] if self.central_model_label else ""

    def to_dict(self) -> dict:
        return {
            "nodes": self._nodes,
            "edges": self._edges,
            "centralNode": self.central_model_label,
        }


def _get_components():
    """Return graph components from fixture file if available, otherwise introspect."""
    fixture_path = _get_fixture_path()
    if fixture_path:
        return _load_fixture_components(fixture_path)

    include, exclude = _get_app_filters()
    models = extract_models(include_apps=include, exclude_apps=exclude)
    return build_graph(models)


@staff_member_required
def index(request: HttpRequest) -> HttpResponse:
    """Landing page listing all ERD graphs."""
    components = _get_components()
    total_models = sum(len(c.models) for c in components)

    template = loader.get_template("django_erd/index.html")
    context = {
        "components": components,
        "total_models": total_models,
    }
    return HttpResponse(template.render(context, request))


@staff_member_required
def erd_detail(request: HttpRequest, component_id: int) -> HttpResponse:
    """Individual ERD page with graph and detail panel."""
    components = _get_components()

    if component_id < 0 or component_id >= len(components):
        from django.http import Http404
        raise Http404("ERD graph not found")

    component = components[component_id]
    graph_json = json.dumps(component.to_dict())

    template = loader.get_template("django_erd/erd.html")
    context = {
        "component": component,
        "graph_json": graph_json,
    }
    return HttpResponse(template.render(context, request))


@staff_member_required
def serve_css(request: HttpRequest) -> HttpResponse:
    """Serve the CSS file."""
    content = (resources.files("django_erd") / "static" / "django_erd" / "style.css").read_text()
    return HttpResponse(content, content_type="text/css")


@staff_member_required
def serve_js(request: HttpRequest) -> HttpResponse:
    """Serve the JS file."""
    content = (resources.files("django_erd") / "static" / "django_erd" / "erd.js").read_text()
    return HttpResponse(content, content_type="application/javascript")
