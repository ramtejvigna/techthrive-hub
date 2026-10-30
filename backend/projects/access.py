"""Who can see what.

A project is visible to its owner and its members. A board is visible to its
owner and to members of any project linked to it, so adding someone to a
project also shares that project's board. A canvas is visible to its owner and
to anyone who can see its project.

Membership checks use subqueries rather than joins so they never duplicate
rows, which would inflate the Count() annotations the list views use.
"""

from django.db.models import Q

from .models import Project


def member_project_ids(user):
    return Project.members.through.objects.filter(user=user).values("project_id")


def accessible_projects(user):
    return Project.objects.filter(Q(user=user) | Q(pk__in=member_project_ids(user)))


def accessible_boards(user):
    from kanban.models import Board

    shared_board_ids = Project.objects.filter(
        pk__in=member_project_ids(user), board__isnull=False
    ).values("board_id")
    return Board.objects.filter(Q(user=user) | Q(pk__in=shared_board_ids))


def accessible_canvases(user):
    from canvases.models import Canvas

    return Canvas.objects.filter(
        Q(user=user) | Q(project__in=accessible_projects(user).values("pk"))
    )


def project_users(project):
    """The project's owner plus its members."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    member_ids = Project.members.through.objects.filter(project=project).values("user_id")
    return User.objects.filter(Q(pk=project.user_id) | Q(pk__in=member_ids)).order_by("email")


def board_users(board):
    """Everyone who can see the board: its owner plus linked projects' members."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    member_ids = Project.members.through.objects.filter(project__board=board).values("user_id")
    return User.objects.filter(Q(pk=board.user_id) | Q(pk__in=member_ids)).order_by("email")
