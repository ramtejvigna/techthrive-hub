import uuid

from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Kind(models.TextChoices):
        CARD_ASSIGNED = "card_assigned", "Assigned to an issue"
        CARD_COMMENT = "card_comment", "Comment on an issue"
        CARD_STATUS = "card_status", "Issue status changed"
        MENTION = "mention", "Mentioned"
        PROJECT_ADDED = "project_added", "Added to a project"
        PROJECT_REMOVED = "project_removed", "Removed from a project"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    # Text is snapshotted when the notification is sent, so it still reads
    # correctly after the card or project is renamed or deleted.
    title = models.CharField(max_length=255)
    message = models.CharField(max_length=500)
    url = models.CharField(max_length=500)
    # Plain ids (not foreign keys) so notifications outlive what they point
    # at. The frontend uses them to refresh the affected data.
    project_id = models.UUIDField(null=True, blank=True)
    board_id = models.UUIDField(null=True, blank=True)
    card_id = models.UUIDField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["recipient", "read_at"])]

    def __str__(self):
        return f"{self.get_kind_display()} → {self.recipient}"


class WebSocketConnection(models.Model):
    """An open socket held by API Gateway (or the local stand-in)."""

    connection_id = models.CharField(max_length=128, primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="websocket_connections",
    )
    connected_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.connection_id} ({self.user})"
