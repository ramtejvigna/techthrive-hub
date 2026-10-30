from django.db import migrations


def bucket_status(column, columns):
    # Frozen copy of kanban.column_moves.column_to_bucket_status, so later edits don't change this migration.
    name = column.name.lower().strip()
    if any(token in name for token in ("done", "complete", "completed")):
        return "done"
    if any(token in name for token in ("progress", "doing", "review", "active", "planning")):
        return "in_progress"
    if any(token in name for token in ("to do", "todo", "not started", "backlog")):
        return "todo"

    index = next((i for i, item in enumerate(columns) if item.id == column.id), 0)
    if index == 0:
        return "todo"
    if index == len(columns) - 1:
        return "done"
    return "in_progress"


def backfill(apps, schema_editor):
    Card = apps.get_model("kanban", "Card")
    Column = apps.get_model("kanban", "Column")
    Milestone = apps.get_model("projects", "Milestone")
    Project = apps.get_model("projects", "Project")

    board_ids = Project.objects.filter(board__isnull=False).values_list("board_id", flat=True)
    for board_id in set(board_ids):
        projects = list(Project.objects.filter(board_id=board_id).order_by("created_at"))
        columns = list(Column.objects.filter(board_id=board_id).order_by("position"))
        for column in columns:
            status = bucket_status(column, columns)
            for card in Card.objects.filter(column=column, milestone__isnull=True):
                project = next((p for p in projects if p.id == card.project_id), projects[0])
                card.milestone = Milestone.objects.create(
                    project=project,
                    title=card.title,
                    target_date=card.due_date,
                    bucket_status=status,
                    completed=status == "done",
                    from_ticket=True,
                )
                card.project = project
                card.save(update_fields=["milestone", "project"])


def unlink(apps, schema_editor):
    Card = apps.get_model("kanban", "Card")
    Milestone = apps.get_model("projects", "Milestone")

    milestones = Milestone.objects.filter(from_ticket=True)
    Card.objects.filter(milestone__in=milestones).update(milestone=None)
    milestones.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("kanban", "0009_ticket_structure"),
        ("projects", "0008_milestone_from_ticket"),
    ]

    operations = [
        migrations.RunPython(backfill, unlink),
    ]
