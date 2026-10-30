import uuid

from django.db.models import Q
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated

from projects.access import accessible_canvases

from .serializers import CanvasListSerializer, CanvasSerializer


class CanvasViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = accessible_canvases(self.request.user).select_related("user", "project")
        if self.action == "list":
            query = self.request.query_params.get("q", "").strip()
            if query:
                qs = qs.filter(Q(title__icontains=query) | Q(scene_text__icontains=query))
            project = self.request.query_params.get("project")
            if project:
                try:
                    qs = qs.filter(project_id=uuid.UUID(project))
                except ValueError:
                    raise ValidationError({"project": "Must be a valid project id."})
            # The list never needs the full scene.
            qs = qs.defer("scene", "scene_text")
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return CanvasListSerializer
        return CanvasSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        if instance.user_id != self.request.user.id:
            raise PermissionDenied("Only the canvas owner can delete it.")
        instance.delete()
