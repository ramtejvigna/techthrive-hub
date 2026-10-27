from django.db import transaction
from django.db.models import Count, Max, Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import generics, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications import services as notifications
from projects.access import accessible_boards, accessible_projects

from .models import Board, Card, CardComment, Column
from .serializers import (
    BoardCreateSerializer,
    BoardDetailSerializer,
    BoardListSerializer,
    CardCommentSerializer,
    CardSerializer,
    ColumnCreateSerializer,
    ColumnSerializer,
    ReorderSerializer,
)


def annotated_cards():
    return (
        Card.objects.select_related("column__board", "project", "milestone", "assignee")
        .prefetch_related("dependencies")
        .annotate(comment_count=Count("comments"))
        # The aggregate drops Meta.ordering, so restore it explicitly.
        .order_by("position")
    )


class BoardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = accessible_boards(self.request.user).select_related("user")
        if self.action == "list":
            return qs.annotate(
                column_count=Count("columns", distinct=True),
                card_count=Count("columns__cards", distinct=True),
            ).order_by("-updated_at")  # the aggregate drops Meta.ordering
        return qs.prefetch_related(
            Prefetch("columns__cards", queryset=annotated_cards()),
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

    def perform_destroy(self, instance):
        if instance.user_id != self.request.user.id:
            raise PermissionDenied("Only the board owner can delete it.")
        instance.delete()

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
        moved_cards: list[tuple[Card, Column, Column]] = []

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
                        from_column = column_map.get(str(card.column_id))
                        apply_card_to_column(
                            card,
                            column,
                            position=item["position"],
                            columns=board_columns,
                        )
                        if moved and card.milestone_id:
                            moved_milestone_cards.append(card)
                        if moved and from_column:
                            moved_cards.append((card, from_column, column))

            for card in moved_milestone_cards:
                sync_card_milestone_status(card)

            for card, from_column, to_column in moved_cards:
                notifications.notify_card_moved(card, request.user, from_column, to_column)

        board = self.get_queryset().get(pk=board.pk)
        return Response(BoardDetailSerializer(board, context={"request": request}).data)


class ColumnListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_board(self):
        return get_object_or_404(accessible_boards(self.request.user), id=self.kwargs["board_id"])

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
            board__in=accessible_boards(self.request.user),
        ).prefetch_related("cards")


class CardDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CardSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return annotated_cards().filter(column__board__in=accessible_boards(self.request.user))

    def perform_update(self, serializer):
        from .column_moves import apply_card_to_column
        from .sync import sync_card_milestone_status

        save_kwargs = {}
        if "project" in self.request.data:
            project_id = self.request.data.get("project")
            save_kwargs["project"] = (
                accessible_projects(self.request.user).filter(id=project_id).first()
                if project_id
                else None
            )
        previous = serializer.instance
        previous_assignee_id = previous.assignee_id
        previous_column = previous.column
        previous_description = previous.description
        # Column changes go through apply_card_to_column so timestamps,
        # position and the linked milestone's status stay in sync.
        new_column = serializer.validated_data.pop("column", None)
        card = serializer.save(**save_kwargs)
        if new_column and new_column.id != card.column_id:
            max_pos = new_column.cards.aggregate(max_pos=Max("position"))["max_pos"]
            apply_card_to_column(
                card,
                new_column,
                position=(max_pos + 1) if max_pos is not None else 0,
                columns=list(new_column.board.columns.all()),
            )
            sync_card_milestone_status(card)
        if card.milestone_id:
            milestone = card.milestone
            milestone.title = card.title
            milestone.target_date = card.due_date
            milestone.save(update_fields=["title", "target_date", "updated_at"])

        actor = self.request.user
        if card.assignee_id and card.assignee_id != previous_assignee_id:
            notifications.notify_card_assigned(card, actor)
        elif card.column_id != previous_column.id:
            # A newly assigned person doesn't also need to hear it moved.
            notifications.notify_card_moved(card, actor, previous_column, card.column)
        if card.description != previous_description:
            notifications.notify_card_description_mentions(card, actor, previous_description)


class CardCreateView(generics.CreateAPIView):
    serializer_class = CardSerializer
    permission_classes = [IsAuthenticated]

    def get_column(self):
        if not hasattr(self, "_column"):
            self._column = get_object_or_404(
                Column.objects.select_related("board"),
                id=self.request.data.get("column"),
                board__in=accessible_boards(self.request.user),
            )
        return self._column

    def get_serializer_context(self):
        # validate_assignee needs the board a new card is going onto.
        return {**super().get_serializer_context(), "board": self.get_column().board}

    def perform_create(self, serializer):
        from .column_moves import apply_card_to_column

        column = self.get_column()
        max_pos = column.cards.order_by("-position").values_list("position", flat=True).first()
        position = (max_pos + 1) if max_pos is not None else 0
        project = None
        project_id = self.request.data.get("project")
        if project_id:
            project = accessible_projects(self.request.user).filter(id=project_id).first()
        card = serializer.save(column=column, position=position, project=project)
        apply_card_to_column(
            card,
            column,
            columns=list(column.board.columns.all()),
        )
        notifications.notify_card_assigned(card, self.request.user)
        notifications.notify_card_description_mentions(card, self.request.user)


class CardCommentListCreateView(generics.ListCreateAPIView):
    serializer_class = CardCommentSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return CardComment.objects.filter(
            card_id=self.kwargs["card_id"],
            card__column__board__in=accessible_boards(self.request.user),
        ).select_related("user")

    def perform_create(self, serializer):
        card = get_object_or_404(
            Card,
            id=self.kwargs["card_id"],
            column__board__in=accessible_boards(self.request.user),
        )
        comment = serializer.save(user=self.request.user, card=card)
        notifications.notify_card_comment(comment, self.request.user)


class CardCommentDetailView(generics.DestroyAPIView):
    serializer_class = CardCommentSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "comment_id"

    def get_queryset(self):
        return CardComment.objects.filter(
            card_id=self.kwargs["card_id"],
            card__column__board__in=accessible_boards(self.request.user),
        )

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if obj.user_id != request.user.id:
            raise PermissionDenied("You can only delete your own comments.")
