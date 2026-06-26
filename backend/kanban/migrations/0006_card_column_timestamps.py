from django.db import migrations, models
from django.utils import timezone


def backfill_card_column_timestamps(apps, schema_editor):
    Card = apps.get_model("kanban", "Card")
    Column = apps.get_model("kanban", "Column")
    now = timezone.now()

    for card in Card.objects.select_related("column").iterator():
        columns = list(Column.objects.filter(board_id=card.column.board_id).order_by("position"))
        column = next((item for item in columns if item.id == card.column_id), card.column)
        name = column.name.lower().strip()
        is_done = any(token in name for token in ("done", "complete", "completed"))
        if not is_done and columns:
            index = next((i for i, item in enumerate(columns) if item.id == column.id), 0)
            is_done = index == len(columns) - 1 and len(columns) > 1

        entered_at = card.updated_at or card.created_at or now
        card.column_entered_at = entered_at
        card.completed_at = entered_at if is_done else None
        card.save(update_fields=["column_entered_at", "completed_at"])


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0005_card_milestone"),
    ]

    operations = [
        migrations.AddField(
            model_name="card",
            name="column_entered_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="card",
            name="completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_card_column_timestamps, migrations.RunPython.noop),
    ]
