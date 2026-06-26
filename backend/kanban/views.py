from django.db import transaction
from django.db.models import Count, Prefetch
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from projects.models import Project

from .models import Board, Card, Column
from .serializers import (
    BoardCreateSerializer,
    BoardDetailSerializer,
    BoardListSerializer,
    CardSerializer,
    ColumnCreateSerializer,
    ColumnSerializer,
    ReorderSerializer,
)


class BoardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Board.objects.filter(user=self.request.user)
        if self.action == "list":
            return qs.annotate(
                column_count=Count("columns", distinct=True),
                card_count=Count("columns__cards", distinct=True),
            )
        return qs.prefetch_related(
            Prefetch("columns__cards", queryset=Card.objects.select_related("project", "milestone")),
            "linked_projects",
            "project",
        )

    def get_serializer_class(self):
        if self.action == "list":
            return BoardListSerializer
        if self.action == "create":
            return BoardCreateSerializer
        return BoardDetailSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        from .sync import sync_board_linked_projects

        board = self.get_object()
        sync_board_linked_projects(board)
        board = self.get_object()
        serializer = self.get_serializer(board)
        return Response(serializer.data)

    @action(detail=True, methods=["patch"], url_path="reorder")
    def reorder(self, request, pk=None):
        from .column_moves import apply_card_to_column
        from .sync import sync_card_milestone_status

        board = self.get_object()
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        moved_milestone_cards: list[Card] = []

        with transaction.atomic():
            if "columns" in data:
                column_ids = {str(item["id"]) for item in data["columns"]}
                board_columns = {
                    str(c.id): c
                    for c in board.columns.filter(id__in=column_ids)
                }
                for item in data["columns"]:
                    col = board_columns.get(str(item["id"]))
                    if col:
                        col.position = item["position"]
                        col.save(update_fields=["position"])

            if "cards" in data:
                card_ids = [item["id"] for item in data["cards"]]
                cards = {
                    str(c.id): c
                    for c in Card.objects.filter(
                        id__in=card_ids,
                        column__board=board,
                    )
                }
                column_map = {
                    str(c.id): c
                    for c in board.columns.all()
                }
                board_columns = list(column_map.values())
                for item in data["cards"]:
                    card = cards.get(str(item["id"]))
                    column = column_map.get(str(item["column_id"]))
                    if card and column:
                        moved = card.column_id != column.id
                        apply_card_to_column(
                            card,
                            column,
                            position=item["position"],
                            columns=board_columns,
                        )
                        if moved and card.milestone_id:
                            moved_milestone_cards.append(card)

            for card in moved_milestone_cards:
                sync_card_milestone_status(card)

        board.refresh_from_db()
        return Response(BoardDetailSerializer(board, context={"request": request}).data)


class ColumnListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_board(self):
        return Board.objects.get(
            id=self.kwargs["board_id"],
            user=self.request.user,
        )

    def get_queryset(self):
        board = self.get_board()
        return board.columns.prefetch_related("cards")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ColumnCreateSerializer
        return ColumnSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.request.method == "POST":
            ctx["board"] = self.get_board()
        return ctx

    def perform_create(self, serializer):
        board = self.get_board()
        serializer.save(board=board)


class ColumnDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ColumnSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "column_id"

    def get_queryset(self):
        return Column.objects.filter(
            board_id=self.kwargs["board_id"],
            board__user=self.request.user,
        ).prefetch_related("cards")


class CardDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CardSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Card.objects.filter(column__board__user=self.request.user)

    def perform_update(self, serializer):
        project_id = self.request.data.get("project")
        project = None
        if project_id:
            project = Project.objects.filter(
                id=project_id,
                user=self.request.user,
            ).first()
        card = serializer.instance
        old_column_id = card.column_id
        card = serializer.save(project=project)
        if card.column_id != old_column_id:
            from .column_moves import apply_card_to_column

            apply_card_to_column(card, card.column)
        if card.milestone_id:
            milestone = card.milestone
            milestone.title = card.title
            milestone.target_date = card.due_date
            milestone.save(update_fields=["title", "target_date", "updated_at"])


class CardCreateView(generics.CreateAPIView):
    serializer_class = CardSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        from .column_moves import apply_card_to_column

        column = Column.objects.get(
            id=self.request.data.get("column"),
            board__user=self.request.user,
        )
        max_pos = column.cards.order_by("-position").values_list("position", flat=True).first()
        position = (max_pos + 1) if max_pos is not None else 0
        project = None
        project_id = self.request.data.get("project")
        if project_id:
            project = Project.objects.filter(
                id=project_id,
                user=self.request.user,
            ).first()
        card = serializer.save(column=column, position=position, project=project)
        apply_card_to_column(
            card,
            column,
            columns=list(column.board.columns.all()),
        )
