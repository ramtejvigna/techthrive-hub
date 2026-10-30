from django.db import transaction
from django.db.models import Max

from projects.models import Milestone, Project

from .column_moves import apply_card_to_column, column_to_bucket_status
from .models import Board, Card, Column


def get_default_todo_column(board: Board) -> Column | None:
    columns = list(board.columns.order_by("position"))
    if not columns:
        return None

    for column in columns:
        name = column.name.lower().strip()
        if any(token in name for token in ("to do", "todo", "not started", "backlog")):
            return column

    return columns[0]


def apply_bucket_status_to_milestone(milestone: Milestone, column: Column) -> None:
    columns = list(column.board.columns.all())
    status = column_to_bucket_status(column, columns)
    milestone.bucket_status = status
    milestone.completed = status == Milestone.BucketStatus.DONE
    milestone.save(update_fields=["bucket_status", "completed", "updated_at"])


def sync_card_milestone_status(card: Card) -> None:
    if not card.milestone_id:
        return
    apply_bucket_status_to_milestone(card.milestone, card.column)


def _next_card_position(column: Column) -> int:
    max_pos = column.cards.aggregate(max_pos=Max("position"))["max_pos"]
    return (max_pos + 1) if max_pos is not None else 0


@transaction.atomic
def create_card_for_milestone(milestone: Milestone) -> Card | None:
    project = milestone.project
    if not project.board_id:
        return None

    board = project.board
    column = get_default_todo_column(board)
    if not column:
        return None

    existing = Card.objects.filter(milestone=milestone).first()
    if existing:
        if existing.column.board_id != board.id:
            apply_card_to_column(
                existing,
                column,
                position=_next_card_position(column),
                columns=list(board.columns.all()),
            )
            sync_card_milestone_status(existing)
        return existing

    card = Card.objects.create(
        column=column,
        title=milestone.title,
        due_date=milestone.target_date,
        project=project,
        milestone=milestone,
        position=_next_card_position(column),
    )
    apply_card_to_column(
        card,
        column,
        columns=list(board.columns.all()),
    )
    apply_bucket_status_to_milestone(milestone, column)
    return card


def linked_project_for_card(card: Card) -> Project | None:
    """The card's own project if linked to its board, else the oldest linked one."""
    projects = list(Project.objects.filter(board_id=card.column.board_id).order_by("created_at"))
    fallback = projects[0] if projects else None
    return next((project for project in projects if project.id == card.project_id), fallback)


@transaction.atomic
def create_milestone_for_card(card: Card) -> Milestone | None:
    """Tickets on a project-linked board are that project's milestones."""
    if card.milestone_id:
        return card.milestone

    project = linked_project_for_card(card)
    if not project:
        return None

    milestone = Milestone.objects.create(
        project=project,
        title=card.title,
        target_date=card.due_date,
        from_ticket=True,
    )
    card.project = project
    card.milestone = milestone
    card.save(update_fields=["project", "milestone", "updated_at"])
    apply_bucket_status_to_milestone(milestone, card.column)
    return milestone


@transaction.atomic
def sync_board_tickets_to_milestones(board: Board) -> None:
    cards = Card.objects.filter(column__board=board, milestone__isnull=True)
    for card in cards.select_related("column"):
        create_milestone_for_card(card)


@transaction.atomic
def sync_project_milestones_to_board(project: Project) -> None:
    if not project.board_id:
        return

    for milestone in project.milestones.all():
        create_card_for_milestone(milestone)
    sync_board_tickets_to_milestones(project.board)


@transaction.atomic
def sync_board_linked_projects(board: Board) -> None:
    projects = Project.objects.filter(board=board).prefetch_related("milestones")
    for project in projects:
        sync_project_milestones_to_board(project)


@transaction.atomic
def release_ticket_milestones(project: Project) -> None:
    """Turn milestones born from tickets back into plain tickets, keeping the tickets."""
    milestones = project.milestones.filter(from_ticket=True)
    Card.objects.filter(milestone__in=milestones).update(project=None, milestone=None)
    milestones.delete()


@transaction.atomic
def delete_milestone_cards_for_project(project: Project) -> None:
    release_ticket_milestones(project)
    Card.objects.filter(project=project, milestone__isnull=False).delete()


def unassign_cards_without_access(board_id) -> None:
    """Clear assignees who can no longer see the board (e.g. removed members)."""
    from projects.access import board_users

    board = Board.objects.filter(pk=board_id).first()
    if board is None:
        return
    Card.objects.filter(column__board=board, assignee__isnull=False).exclude(
        assignee__in=board_users(board)
    ).update(assignee=None)


@transaction.atomic
def sync_milestone_card_content(milestone: Milestone) -> None:
    card = Card.objects.filter(milestone=milestone).first()
    if not card:
        create_card_for_milestone(milestone)
        return

    card.title = milestone.title
    card.due_date = milestone.target_date
    card.save(update_fields=["title", "due_date", "updated_at"])
