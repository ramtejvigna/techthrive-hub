from rest_framework import serializers

from projects.models import Project

import re

from .models import Board, Card, Column, DEFAULT_COLUMNS, DEFAULT_COLUMN_COLORS

HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


class CardSerializer(serializers.ModelSerializer):
    column_id = serializers.UUIDField(source="column.id", read_only=True)
    project_id = serializers.UUIDField(source="project.id", read_only=True, allow_null=True)
    milestone_id = serializers.UUIDField(source="milestone.id", read_only=True, allow_null=True)
    project_name = serializers.CharField(source="project.name", read_only=True, allow_null=True)

    class Meta:
        model = Card
        fields = (
            "id",
            "title",
            "description",
            "priority",
            "due_date",
            "position",
            "column",
            "column_id",
            "project",
            "project_id",
            "project_name",
            "milestone",
            "milestone_id",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "milestone", "created_at", "updated_at")

    def validate_project(self, project):
        if project is None:
            return project
        user = self.context["request"].user
        if project.user_id != user.id:
            raise serializers.ValidationError("Project not found.")
        return project


def validate_hex_color(value):
    if not HEX_COLOR_RE.match(value):
        raise serializers.ValidationError("Color must be a hex value like #0284c7.")
    return value.lower()


class ColumnSerializer(serializers.ModelSerializer):
    cards = CardSerializer(many=True, read_only=True)

    class Meta:
        model = Column
        fields = ("id", "name", "color", "position", "cards")
        read_only_fields = ("id",)

    def validate_color(self, value):
        return validate_hex_color(value)


class LinkedProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ("id", "name", "status")


class BoardListSerializer(serializers.ModelSerializer):
    column_count = serializers.IntegerField(read_only=True)
    card_count = serializers.IntegerField(read_only=True)
    project_id = serializers.UUIDField(source="project.id", read_only=True, allow_null=True)

    class Meta:
        model = Board
        fields = (
            "id",
            "title",
            "project",
            "project_id",
            "column_count",
            "card_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class BoardDetailSerializer(serializers.ModelSerializer):
    columns = ColumnSerializer(many=True, read_only=True)
    project_id = serializers.UUIDField(source="project.id", read_only=True, allow_null=True)
    linked_projects = LinkedProjectSerializer(many=True, read_only=True)

    class Meta:
        model = Board
        fields = (
            "id",
            "title",
            "project",
            "project_id",
            "linked_projects",
            "columns",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_project(self, project):
        if project is None:
            return project
        user = self.context["request"].user
        if project.user_id != user.id:
            raise serializers.ValidationError("Project not found.")
        return project


class BoardCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Board
        fields = ("id", "title", "project")
        read_only_fields = ("id",)

    def create(self, validated_data):
        board = Board.objects.create(**validated_data)
        for index, name in enumerate(DEFAULT_COLUMNS):
            Column.objects.create(
                board=board,
                name=name,
                position=index,
                color=DEFAULT_COLUMN_COLORS[index % len(DEFAULT_COLUMN_COLORS)],
            )
        return board


class ColumnCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Column
        fields = ("id", "name", "color", "position")
        read_only_fields = ("id",)

    def validate_color(self, value):
        return validate_hex_color(value)

    def validate(self, attrs):
        board = self.context["board"]
        if "position" not in attrs:
            max_pos = board.columns.order_by("-position").values_list("position", flat=True).first()
            attrs["position"] = (max_pos + 1) if max_pos is not None else 0
        if "color" not in attrs:
            attrs["color"] = DEFAULT_COLUMN_COLORS[attrs["position"] % len(DEFAULT_COLUMN_COLORS)]
        return attrs


class ReorderItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    position = serializers.IntegerField(min_value=0)


class ReorderSerializer(serializers.Serializer):
    columns = ReorderItemSerializer(many=True, required=False)
    cards = serializers.ListField(
        child=serializers.DictField(),
        required=False,
    )

    def validate_cards(self, value):
        for item in value:
            if "id" not in item or "column_id" not in item or "position" not in item:
                raise serializers.ValidationError(
                    "Each card must have id, column_id, and position."
                )
        return value
