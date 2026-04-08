"""Introspect Django models using the _meta API."""

from __future__ import annotations

from django.apps import apps

from django_erd.schema import FieldInfo, ModelInfo, RelationType


def _classify_field(field) -> FieldInfo:  # noqa: ANN001
    """Convert a Django field object into a FieldInfo dataclass."""
    is_relation = field.is_relation
    relation_type = None
    related_model_label = None

    if is_relation:
        if field.many_to_one or (field.one_to_one and not field.auto_created):
            if field.many_to_one:
                relation_type = RelationType.FOREIGN_KEY
            else:
                relation_type = RelationType.ONE_TO_ONE
        elif field.many_to_many and not field.auto_created:
            relation_type = RelationType.MANY_TO_MANY

        if field.related_model is not None:
            meta = field.related_model._meta
            related_model_label = f"{meta.app_label}.{meta.object_name}"

    return FieldInfo(
        name=field.name,
        field_type=type(field).__name__,
        is_primary_key=getattr(field, "primary_key", False),
        is_nullable=getattr(field, "null", False),
        max_length=getattr(field, "max_length", None),
        is_relation=is_relation and relation_type is not None,
        relation_type=relation_type,
        related_model_label=related_model_label,
    )


def extract_models(
    include_apps: list[str] | None = None,
    exclude_apps: list[str] | None = None,
) -> list[ModelInfo]:
    """Extract all concrete Django models from the app registry.

    Args:
        include_apps: If set, only include models from these app labels.
        exclude_apps: If set, exclude models from these app labels.

    Returns:
        List of ModelInfo objects representing each model.
    """
    models: list[ModelInfo] = []

    for model in apps.get_models():
        meta = model._meta
        app_label = meta.app_label

        if include_apps and app_label not in include_apps:
            continue
        if exclude_apps and app_label in exclude_apps:
            continue

        fields: list[FieldInfo] = []
        for field in meta.get_fields():
            # Skip reverse relations — we only track forward relations
            if field.auto_created and field.is_relation:
                continue
            fields.append(_classify_field(field))

        model_info = ModelInfo(
            app_label=app_label,
            model_name=meta.object_name,
            label=f"{app_label}.{meta.object_name}",
            db_table=meta.db_table,
            fields=fields,
            verbose_name=str(meta.verbose_name),
        )
        models.append(model_info)

    return models
