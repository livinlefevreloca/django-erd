"""Views for the Django ERD app."""

from __future__ import annotations

import json
from importlib import resources

from django.conf import settings
from django.contrib.admin.views.decorators import staff_member_required
from django.http import HttpRequest, HttpResponse
from django.template import loader

from django_erd.graph import build_graph
from django_erd.introspect import extract_models


def _get_app_filters() -> tuple[list[str] | None, list[str] | None]:
    """Read include/exclude app filters from Django settings."""
    include = getattr(settings, "ERD_INCLUDE_APPS", None)
    exclude = getattr(settings, "ERD_EXCLUDE_APPS", None)
    return include, exclude


def _get_components():
    """Introspect models and build graph components."""
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
