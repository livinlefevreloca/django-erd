"""Data structures for representing Django model introspection results."""

from dataclasses import dataclass, field
from enum import Enum


class RelationType(Enum):
    """Types of relationships between Django models."""

    FOREIGN_KEY = "fk"
    ONE_TO_ONE = "o2o"
    MANY_TO_MANY = "m2m"


@dataclass
class FieldInfo:
    """Represents a single field on a Django model."""

    name: str
    field_type: str
    is_primary_key: bool = False
    is_nullable: bool = False
    max_length: int | None = None
    is_relation: bool = False
    relation_type: RelationType | None = None
    related_model_label: str | None = None

    def to_dict(self) -> dict:
        """Serialize for JSON embedding in HTML templates."""
        d: dict = {
            "name": self.name,
            "type": self.field_type,
            "pk": self.is_primary_key,
            "nullable": self.is_nullable,
        }
        if self.max_length is not None:
            d["maxLength"] = self.max_length
        if self.is_relation:
            d["isRelation"] = True
            d["relationType"] = self.relation_type.value if self.relation_type else None
            d["relatedModel"] = self.related_model_label
        return d


@dataclass
class ModelInfo:
    """Represents a Django model with its fields and metadata."""

    app_label: str
    model_name: str
    label: str  # e.g. "auth.User"
    db_table: str
    fields: list[FieldInfo] = field(default_factory=list)
    verbose_name: str = ""

    def to_dict(self) -> dict:
        """Serialize for JSON embedding in HTML templates."""
        return {
            "id": self.label,
            "label": self.model_name,
            "app": self.app_label,
            "dbTable": self.db_table,
            "verboseName": self.verbose_name,
            "fields": [f.to_dict() for f in self.fields],
        }


@dataclass
class EdgeInfo:
    """Represents a relationship edge between two models."""

    source: str  # source model label
    target: str  # target model label
    relation_type: RelationType
    field_name: str

    def to_dict(self) -> dict:
        """Serialize for JSON embedding in HTML templates."""
        return {
            "source": self.source,
            "target": self.target,
            "type": self.relation_type.value,
            "field": self.field_name,
        }


@dataclass
class GraphComponent:
    """A connected component of the model graph — becomes one ERD page."""

    id: int
    models: list[ModelInfo] = field(default_factory=list)
    edges: list[EdgeInfo] = field(default_factory=list)
    central_model_label: str = ""
    title: str = ""

    @property
    def central_model_name(self) -> str:
        """Just the model name (without app label) of the central model."""
        return self.central_model_label.split(".")[-1] if self.central_model_label else ""

    def to_dict(self) -> dict:
        """Serialize for JSON embedding in HTML templates."""
        return {
            "nodes": [m.to_dict() for m in self.models],
            "edges": [e.to_dict() for e in self.edges],
            "centralNode": self.central_model_label,
        }
