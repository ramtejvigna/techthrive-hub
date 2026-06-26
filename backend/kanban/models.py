import uuid

from django.conf import settings
from django.db import models

DEFAULT_COLUMNS = ["Not started", "In progress", "Done"]
DEFAULT_COLUMN_COLORS = ["#64748b", "#0284c7", "#059669", "#d97706", "#7c3aed", "#db2777"]


class Board(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="boards",
    )
    title = models.CharField(max_length=255)
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="primary_boards",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title


class Column(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    board = models.ForeignKey(
        Board,
        on_delete=models.CASCADE,
        related_name="columns",
    )
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default="#64748b")
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position"]

    def __str__(self):
        return f"{self.board.title} — {self.name}"


class Card(models.Model):
    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    column = models.ForeignKey(
        Column,
        on_delete=models.CASCADE,
        related_name="cards",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )
    due_date = models.DateField(null=True, blank=True)
    column_entered_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    position = models.PositiveIntegerField(default=0)
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cards",
    )
    milestone = models.OneToOneField(
        "projects.Milestone",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="card",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position"]

    def __str__(self):
        return self.title
