"""Who gets notified about what.

Views call the `notify_*` functions after a change is saved. Nobody is ever
notified about their own action, and each person gets at most one
notification per action: a mention takes priority over a plain comment.
"""

import re

from django.contrib.auth import get_user_model
from django.db import transaction

from .models import Notification

User = get_user_model()

# `@someone@example.com`. The lookbehind skips the domain part of a plain
# email address ("me@x.com" mentions nobody).
MENTION_RE = re.compile(r"(?<![\w@.])@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})")
EXCERPT_LENGTH = 140


def mentioned_emails(text):
    # Comments are Markdown, which may escape characters such as "_" in an email.
    unescaped = re.sub(r"\\([^A-Za-z0-9\s])", r"\1", text or "")
    return {email.lower().rstrip(".") for email in MENTION_RE.findall(unescaped)}


def excerpt(text, length=EXCERPT_LENGTH):
    flat = " ".join((text or "").split())
    return flat if len(flat) <= length else flat[: length - 1].rstrip() + "…"


def notify(recipients, *, actor, kind, title, message, url, project_id=None, board_id=None, card_id=None):
    """Save one notification per recipient and push them once the transaction commits."""
    unique = {user.pk: user for user in recipients if user is not None and user.pk != actor.pk}
    if not unique:
        return []
    notifications = Notification.objects.bulk_create(
        Notification(
            recipient=user,
            actor=actor,
            kind=kind,
            title=title[:255],
            message=message[:500],
            url=url,
            project_id=project_id,
            board_id=board_id,
            card_id=card_id,
        )
        for user in unique.values()
    )
    transaction.on_commit(lambda: _push(notifications))
    return notifications


def _push(notifications):
    from .push import push_to_users
    from .serializers import NotificationSerializer

    push_to_users(
        {
            notification.recipient_id: {
                "type": "notification",
                "notification": NotificationSerializer(notification).data,
            }
            for notification in notifications
        }
    )


def _mentioned_users(text, allowed_users, exclude_emails=()):
    emails = mentioned_emails(text) - {email.lower() for email in exclude_emails}
    if not emails:
        return []
    return [user for user in allowed_users if user.email.lower() in emails]


# Cards ---------------------------------------------------------------------


def _card_context(card):
    board = card.column.board
    return {
        "title": f"{card.issue_key} · {card.title}" if card.issue_key else card.title,
        "url": f"/dashboard/kanban/{board.id}?issue={card.id}",
        "project_id": card.project_id,
        "board_id": board.id,
        "card_id": card.id,
    }


def _board_users(card):
    from projects.access import board_users

    return list(board_users(card.column.board))


def notify_card_assigned(card, actor):
    if card.assignee_id is None:
        return
    notify(
        [card.assignee],
        actor=actor,
        kind=Notification.Kind.CARD_ASSIGNED,
        message=f"{actor.email} assigned you to this issue",
        **_card_context(card),
    )


def notify_card_moved(card, actor, from_column, to_column):
    if card.assignee_id is None or from_column.id == to_column.id:
        return
    notify(
        [card.assignee],
        actor=actor,
        kind=Notification.Kind.CARD_STATUS,
        message=f"{actor.email} moved your issue from {from_column.name} to {to_column.name}",
        **_card_context(card),
    )


def notify_card_description_mentions(card, actor, previous_description=""):
    """Only people newly mentioned by this edit are notified."""
    mentioned = _mentioned_users(
        card.description, _board_users(card), exclude_emails=mentioned_emails(previous_description)
    )
    notify(
        mentioned,
        actor=actor,
        kind=Notification.Kind.MENTION,
        message=f"{actor.email} mentioned you in the description",
        **_card_context(card),
    )


def notify_card_comment(comment, actor):
    """Mention the people tagged; tell the assignee and earlier commenters."""
    from kanban.models import CardComment

    card = comment.card
    context = _card_context(card)
    mentioned = _mentioned_users(comment.body, _board_users(card))
    notify(
        mentioned,
        actor=actor,
        kind=Notification.Kind.MENTION,
        message=f"{actor.email} mentioned you: {excerpt(comment.body)}",
        **context,
    )

    participant_ids = set(
        CardComment.objects.filter(card=card).exclude(pk=comment.pk).values_list("user_id", flat=True)
    )
    if card.assignee_id:
        participant_ids.add(card.assignee_id)
    participant_ids -= {user.pk for user in mentioned}
    notify(
        User.objects.filter(pk__in=participant_ids),
        actor=actor,
        kind=Notification.Kind.CARD_COMMENT,
        message=f"{actor.email} commented: {excerpt(comment.body)}",
        **context,
    )


# Projects ------------------------------------------------------------------


def _project_users(project):
    from projects.access import project_users

    return list(project_users(project))


def _project_context(project):
    return {
        "title": project.name,
        "url": f"/dashboard/projects/{project.id}",
        "project_id": project.id,
        "board_id": project.board_id,
    }


def notify_milestone_comment_mentions(comment, actor):
    milestone = comment.milestone
    project = milestone.project
    notify(
        _mentioned_users(comment.body, _project_users(project)),
        actor=actor,
        kind=Notification.Kind.MENTION,
        message=f"{actor.email} mentioned you on “{milestone.title}”: {excerpt(comment.body)}",
        **_project_context(project),
    )


def notify_phase_update_mentions(update, actor):
    phase = update.phase
    project = phase.project
    notify(
        _mentioned_users(update.body, _project_users(project)),
        actor=actor,
        kind=Notification.Kind.MENTION,
        message=f"{actor.email} mentioned you in {phase.get_key_display()}: {excerpt(update.body)}",
        **_project_context(project),
    )


def notify_project_member_added(project, member, actor):
    notify(
        [member],
        actor=actor,
        kind=Notification.Kind.PROJECT_ADDED,
        message=f"{actor.email} added you to this project"
        + (" and its board" if project.board_id else ""),
        **_project_context(project),
    )


def notify_project_member_removed(project, member, actor):
    notify(
        [member],
        actor=actor,
        kind=Notification.Kind.PROJECT_REMOVED,
        message=f"{actor.email} removed you from this project",
        title=project.name,
        url="/dashboard/projects",
        project_id=project.id,
        board_id=project.board_id,
    )
