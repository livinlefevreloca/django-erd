"""Graph analysis: connected components and centrality computation."""

from collections import Counter, defaultdict, deque

from django_erd.schema import EdgeInfo, GraphComponent, ModelInfo, RelationType


def _build_edges(models: list[ModelInfo]) -> list[EdgeInfo]:
    """Extract all relationship edges from the model list."""
    model_labels = {m.label for m in models}
    edges: list[EdgeInfo] = []

    for model in models:
        for field in model.fields:
            if field.is_relation and field.related_model_label in model_labels:
                edges.append(
                    EdgeInfo(
                        source=model.label,
                        target=field.related_model_label,
                        relation_type=field.relation_type or RelationType.FOREIGN_KEY,
                        field_name=field.name,
                    )
                )
    return edges


def _find_connected_components(
    model_labels: set[str],
    edges: list[EdgeInfo],
) -> list[set[str]]:
    """Find connected components using BFS on an undirected view of the graph."""
    adjacency: dict[str, set[str]] = defaultdict(set)
    for edge in edges:
        adjacency[edge.source].add(edge.target)
        adjacency[edge.target].add(edge.source)

    visited: set[str] = set()
    components: list[set[str]] = []

    for label in model_labels:
        if label in visited:
            continue
        component: set[str] = set()
        queue: deque[str] = deque([label])
        while queue:
            node = queue.popleft()
            if node in visited:
                continue
            visited.add(node)
            component.add(node)
            for neighbor in adjacency[node]:
                if neighbor not in visited:
                    queue.append(neighbor)
        components.append(component)

    return components


def _compute_central_model(component_labels: set[str], edges: list[EdgeInfo]) -> str:
    """Find the model with the highest in-degree (most referenced) in a component."""
    in_degree: Counter[str] = Counter()
    for label in component_labels:
        in_degree[label] = 0
    for edge in edges:
        if edge.target in component_labels:
            in_degree[edge.target] += 1

    return in_degree.most_common(1)[0][0]


def _generate_title(models: list[ModelInfo]) -> str:
    """Generate a human-readable title for a component based on its most common app."""
    app_counts: Counter[str] = Counter(m.app_label for m in models)
    dominant_app = app_counts.most_common(1)[0][0]

    if len(app_counts) == 1:
        return dominant_app.replace("_", " ").title()

    other_apps = [app for app, _ in app_counts.most_common() if app != dominant_app]
    others = ", ".join(a.replace("_", " ").title() for a in other_apps[:2])
    suffix = " & more" if len(other_apps) > 2 else ""
    return f"{dominant_app.replace('_', ' ').title()}, {others}{suffix}"


def build_graph(models: list[ModelInfo]) -> list[GraphComponent]:
    """Analyze models and return a list of connected graph components.

    Each component becomes a separate ERD page. Components are sorted
    by model count descending (largest graph first).
    """
    if not models:
        return []

    model_map = {m.label: m for m in models}
    edges = _build_edges(models)
    components = _find_connected_components(set(model_map.keys()), edges)

    # Sort components: largest first
    components.sort(key=len, reverse=True)

    result: list[GraphComponent] = []
    for idx, component_labels in enumerate(components):
        component_models = [model_map[label] for label in sorted(component_labels)]
        component_edges = [
            e for e in edges if e.source in component_labels and e.target in component_labels
        ]
        central = _compute_central_model(component_labels, component_edges)
        title = _generate_title(component_models)

        result.append(
            GraphComponent(
                id=idx,
                models=component_models,
                edges=component_edges,
                central_model_label=central,
                title=title,
            )
        )

    return result
