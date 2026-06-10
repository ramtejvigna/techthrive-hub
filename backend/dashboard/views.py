from datetime import date

from django.db.models import Count, Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from kanban.models import Board, Card
from projects.models import Milestone, Project


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        today = date.today()

        active_projects = Project.objects.filter(
            user=user,
            status=Project.Status.ACTIVE,
        ).count()

        overdue_milestones = Milestone.objects.filter(
            project__user=user,
            completed=False,
            target_date__lt=today,
        ).count()

        total_boards = Board.objects.filter(user=user).count()

        recent_cards = (
            Card.objects.filter(column__board__user=user)
            .select_related("column", "column__board")
            .order_by("-updated_at")[:5]
        )

        return Response(
            {
                "active_projects": active_projects,
                "overdue_milestones": overdue_milestones,
                "total_boards": total_boards,
                "total_projects": Project.objects.filter(user=user).count(),
                "recent_activity": [
                    {
                        "id": str(card.id),
                        "title": card.title,
                        "board_id": str(card.column.board_id),
                        "board_title": card.column.board.title,
                        "column_name": card.column.name,
                        "updated_at": card.updated_at.isoformat(),
                    }
                    for card in recent_cards
                ],
            }
        )
