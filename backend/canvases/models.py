import uuid

from django.conf import settings
from django.db import models


class Canvas(models.Model):
    """A diagram. `scene` is the editor's (Excalidraw) elements and app state."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="canvases",
    )
    # Linking a project shares the canvas with the project's owner and members.
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="canvases",
    )
    title = models.CharField(max_length=255, default="Untitled canvas")
    scene = models.JSONField(default=dict, blank=True)
    # Text in the drawing, sent by the editor, for search.
    scene_text = models.TextField(blank=True)
    # A small PNG data URL, sent by the editor, for the canvas list.
    thumbnail = models.TextField(blank=True)
    # Bumped on every scene save so a stale editor can't overwrite newer work.
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title
