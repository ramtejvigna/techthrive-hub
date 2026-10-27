import re
import uuid

from django.conf import settings
from django.db import models, transaction

DEFAULT_COLUMNS = ["To Do", "In Progress", "Done"]
DEFAULT_COLUMN_COLORS = ["#64748b", "#0284c7", "#059669", "#d97706", "#7c3aed", "#db2777"]


def derive_board_key(title: str) -> str:
    """Jira-style key from a title: initials of multi-word titles, else the first letters."""
    words = re.findall(r"[A-Za-z0-9]+", title)
    if len(words) >= 2:
        key = "".join(word[0] for word in words[:4])
    elif words:
        key = words[0][:3]
    else:
        key = ""
    key = key.upper()
    return key if len(key) >= 2 else (key + "BRD")[:3]


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
    key = models.CharField(max_length=10, blank=True)
    issue_counter = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.key:
            self.key = derive_board_key(self.title)
        super().save(*args, **kwargs)


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
    wip_limit = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["position"]

    def __str__(self):
        return f"{self.board.title} — {self.name}"


class Card(models.Model):
    class Priority(models.TextChoices):
        LOWEST = "lowest", "Lowest"
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        HIGHEST = "highest", "Highest"

    class IssueType(models.TextChoices):
        TASK = "task", "Task"
        STORY = "story", "Story"
        BUG = "bug", "Bug"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    column = models.ForeignKey(
        Column,
        on_delete=models.CASCADE,
        related_name="cards",
    )
    number = models.PositiveIntegerField(null=True, blank=True)
    issue_type = models.CharField(
        max_length=10,
        choices=IssueType.choices,
        default=IssueType.TASK,
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # Ticket structure: the outcome, what's expected, how to get there and when it's done.
    objective = models.TextField(blank=True)
    requirements = models.TextField(blank=True)
    subtasks = models.JSONField(default=list, blank=True)
    acceptance_criteria = models.JSONField(default=list, blank=True)
    dependencies = models.ManyToManyField(
        "self",
        symmetrical=False,
        blank=True,
        related_name="dependents",
    )
    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )
    due_date = models.DateField(null=True, blank=True)
    story_points = models.PositiveSmallIntegerField(null=True, blank=True)
    labels = models.JSONField(default=list, blank=True)
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_cards",
    )
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

    def save(self, *args, **kwargs):
        if self._state.adding and self.number is None:
            with transaction.atomic():
                board = Board.objects.select_for_update().get(pk=self.column.board_id)
                board.issue_counter += 1
                board.save(update_fields=["issue_counter"])
                self.number = board.issue_counter
                super().save(*args, **kwargs)
            return
        super().save(*args, **kwargs)

    @property
    def issue_key(self):
        return f"{self.column.board.key}-{self.number}" if self.number else ""


class CardComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="comments")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="card_comments",
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment on {self.card} by {self.user}"
