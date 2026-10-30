import json
import re

from accounts.serializers import UserSerializer
from django.db import transaction
from rest_framework import serializers, status
from rest_framework.exceptions import APIException

from projects.access import accessible_projects

from .models import Canvas

MAX_SCENE_BYTES = 2 * 1024 * 1024
MAX_THUMBNAIL_BYTES = 256 * 1024
THUMBNAIL_RE = re.compile(r"^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$")


class CanvasConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This canvas was changed elsewhere."
    default_code = "canvas_conflict"


class CanvasAccessFields(serializers.Serializer):
    """Owner, the viewer's role and project, shared by the list and detail serializers."""

    owner = UserSerializer(source="user", read_only=True)
    is_owner = serializers.SerializerMethodField()
    project_name = serializers.CharField(source="project.name", read_only=True, allow_null=True)

    def get_is_owner(self, canvas):
        return canvas.user_id == self.context["request"].user.id


class CanvasSerializer(CanvasAccessFields, serializers.ModelSerializer):
    base_version = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = Canvas
        fields = (
            "id",
            "title",
            "project",
            "project_name",
            "owner",
            "is_owner",
            "scene",
            "scene_text",
            "thumbnail",
            "version",
            "base_version",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "version", "created_at", "updated_at")
        # Clearing the title box must not fail the autosave; see validate_title.
        extra_kwargs = {"title": {"allow_blank": True}}

    def validate_title(self, value):
        return value.strip() or "Untitled canvas"

    def validate_scene(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Scene must be an object.")
        if not isinstance(value.get("elements", []), list):
            raise serializers.ValidationError("Scene elements must be a list.")
        if len(json.dumps(value)) > MAX_SCENE_BYTES:
            raise serializers.ValidationError("Canvas is too large (2 MB max).")
        return value

    def validate_thumbnail(self, value):
        if len(value) > MAX_THUMBNAIL_BYTES:
            raise serializers.ValidationError("Thumbnail is too large.")
        if value and not THUMBNAIL_RE.match(value):
            raise serializers.ValidationError("Thumbnail must be a PNG data URL.")
        return value

    def validate_project(self, project):
        user = self.context["request"].user
        if self.instance is not None and self.instance.user_id != user.id:
            # Linking a project shares the canvas, so only its owner may change
            # that. Members' edit forms resend the current value.
            if project != self.instance.project:
                raise serializers.ValidationError("Only the canvas owner can change its project.")
            return project
        if project is not None and not accessible_projects(user).filter(pk=project.pk).exists():
            raise serializers.ValidationError("Project not found.")
        return project

    def validate(self, attrs):
        if self.instance is not None and "scene" in attrs and "base_version" not in attrs:
            raise serializers.ValidationError({"base_version": "Required when saving the scene."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("base_version", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        base_version = validated_data.pop("base_version", None)
        with transaction.atomic():
            current = Canvas.objects.select_for_update().get(pk=instance.pk)
            if "scene" in validated_data:
                if base_version != current.version:
                    raise CanvasConflict()
                validated_data["version"] = current.version + 1
            return super().update(current, validated_data)


class CanvasListSerializer(CanvasAccessFields, serializers.ModelSerializer):
    class Meta:
        model = Canvas
        fields = (
            "id",
            "title",
            "project",
            "project_name",
            "owner",
            "is_owner",
            "thumbnail",
            "created_at",
            "updated_at",
        )
