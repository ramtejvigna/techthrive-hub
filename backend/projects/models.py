import uuid

from django.conf import settings
from django.db import models


class Project(models.Model):
    class Status(models.TextChoices):
        PLANNING = "planning", "Planning"
        ACTIVE = "active", "Active"
        ON_HOLD = "on_hold", "On Hold"
        COMPLETED = "completed", "Completed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="projects",
    )
    # People the owner has shared the project with. Members can work on the
    # project and see its linked board; only the owner manages membership.
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="shared_projects",
        blank=True,
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PLANNING,
    )
    due_date = models.DateField(null=True, blank=True)
    board = models.ForeignKey(
        "kanban.Board",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_projects",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        creating = self._state.adding
        super().save(*args, **kwargs)
        if creating:
            ProjectPhase.ensure_for_project(self)

    COMPLETED_PHASE = "completed"

    @property
    def current_phase(self):
        """First in-progress phase, else first not-started one, else "completed"."""
        phases = list(self.phases.all())
        for wanted in (ProjectPhase.Status.IN_PROGRESS, ProjectPhase.Status.NOT_STARTED):
            for phase in phases:
                if phase.status == wanted:
                    return phase.key
        return self.COMPLETED_PHASE if phases else None

    def set_current_phase(self, key):
        """Mark earlier phases done, `key` in progress and later ones not started."""
        keys = ProjectPhase.Key.values
        target = len(keys) if key == self.COMPLETED_PHASE else keys.index(key)
        for index, phase_key in enumerate(keys):
            if index < target:
                status = ProjectPhase.Status.DONE
            elif index == target:
                status = ProjectPhase.Status.IN_PROGRESS
            else:
                status = ProjectPhase.Status.NOT_STARTED
            self.phases.filter(key=phase_key).exclude(status=status).update(status=status)
        self.sync_status_from_phases()

    def sync_status_from_phases(self):
        statuses = set(self.phases.values_list("status", flat=True))
        if statuses == {ProjectPhase.Status.DONE}:
            status = self.Status.COMPLETED
        elif statuses == {ProjectPhase.Status.NOT_STARTED}:
            status = self.Status.PLANNING
        else:
            status = self.Status.ACTIVE
        if status != self.status:
            self.status = status
            self.save(update_fields=["status", "updated_at"])


class ProjectPhase(models.Model):
    """One SDLC stage of a project. Every project gets all six on creation."""

    class Key(models.TextChoices):
        REQUIREMENTS = "requirements", "Requirements"
        DESIGN = "design", "Design"
        DEVELOPMENT = "development", "Development"
        TESTING = "testing", "Testing"
        DEPLOYMENT = "deployment", "Deployment"
        MAINTENANCE = "maintenance", "Maintenance"

    class Status(models.TextChoices):
        NOT_STARTED = "not_started", "Not Started"
        IN_PROGRESS = "in_progress", "In Progress"
        DONE = "done", "Done"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="phases",
    )
    key = models.CharField(max_length=20, choices=Key.choices)
    order = models.PositiveSmallIntegerField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NOT_STARTED,
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order"]
        constraints = [
            models.UniqueConstraint(fields=["project", "key"], name="unique_project_phase"),
        ]

    def __str__(self):
        return f"{self.project.name} · {self.get_key_display()}"

    @classmethod
    def ensure_for_project(cls, project):
        existing = set(project.phases.values_list("key", flat=True))
        cls.objects.bulk_create(
            cls(project=project, key=key, order=index)
            for index, key in enumerate(cls.Key.values)
            if key not in existing
        )


class PhaseUpdate(models.Model):
    class Kind(models.TextChoices):
        NOTE = "note", "Note"
        STATUS_CHANGE = "status_change", "Status Change"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phase = models.ForeignKey(
        ProjectPhase,
        on_delete=models.CASCADE,
        related_name="updates",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="phase_updates",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.NOTE)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Update on {self.phase} by {self.user}"


class Milestone(models.Model):
    class BucketStatus(models.TextChoices):
        TODO = "todo", "To Do"
        IN_PROGRESS = "in_progress", "In Progress"
        DONE = "done", "Done"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="milestones",
    )
    phase = models.ForeignKey(
        ProjectPhase,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="milestones",
    )
    title = models.CharField(max_length=255)
    target_date = models.DateField(null=True, blank=True)
    bucket_status = models.CharField(
        max_length=20,
        choices=BucketStatus.choices,
        default=BucketStatus.TODO,
    )
    completed = models.BooleanField(default=False)
    # Born from a ticket on the linked board, rather than added on the project.
    # Such a ticket outlives its milestone when the board is unlinked.
    from_ticket = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["target_date", "created_at"]

    def __str__(self):
        return self.title


class MilestoneComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    milestone = models.ForeignKey(
        Milestone,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="milestone_comments",
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment on {self.milestone.title} by {self.user}"
