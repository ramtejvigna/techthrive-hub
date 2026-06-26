from projects.models import Milestone

from .models import Card, Column


def column_to_bucket_status(column: Column, columns: list[Column]) -> str:
    name = column.name.lower().strip()

    if any(token in name for token in ("done", "complete", "completed")):
        return Milestone.BucketStatus.DONE
    if any(token in name for token in ("progress", "doing", "review", "active", "planning")):
        return Milestone.BucketStatus.IN_PROGRESS
    if any(token in name for token in ("to do", "todo", "not started", "backlog")):
        return Milestone.BucketStatus.TODO

    ordered = sorted(columns, key=lambda item: item.position)
    index = next((i for i, item in enumerate(ordered) if item.id == column.id), 0)
    if index == 0:
        return Milestone.BucketStatus.TODO
    if index == len(ordered) - 1:
        return Milestone.BucketStatus.DONE
    return Milestone.BucketStatus.IN_PROGRESS


def is_completed_column(column: Column, columns: list[Column] | None = None) -> bool:
    board_columns = columns if columns is not None else list(column.board.columns.all())
    return column_to_bucket_status(column, board_columns) == Milestone.BucketStatus.DONE


def apply_card_to_column(
    card: Card,
    column: Column,
    *,
    position: int | None = None,
    columns: list[Column] | None = None,
) -> None:
    from django.utils import timezone

    moved = card.column_id != column.id
    update_fields: list[str] = []

    card.column = column
    update_fields.append("column")

    if position is not None:
        card.position = position
        update_fields.append("position")

    if moved or not card.column_entered_at:
        now = timezone.now()
        card.column_entered_at = now
        update_fields.extend(["column_entered_at", "completed_at"])
        board_columns = columns if columns is not None else list(column.board.columns.all())
        card.completed_at = now if is_completed_column(column, board_columns) else None

    card.save(update_fields=[*update_fields, "updated_at"])
