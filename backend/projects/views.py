from accounts.serializers import UserSerializer
from django.contrib.auth import get_user_model
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from notifications import services as notifications

from .access import accessible_projects
from .models import Milestone, MilestoneComment, PhaseUpdate, Project, ProjectPhase
from .serializers import (
    AddMemberSerializer,
    MilestoneCommentSerializer,
    MilestoneSerializer,
    PhaseUpdateSerializer,
    ProjectListSerializer,
    ProjectPhaseSerializer,
    ProjectSerializer,
)


class ProjectViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = accessible_projects(self.request.user).select_related("user")
        if self.action == "list":
            return qs.annotate(
                milestone_count=Count("milestones"),
                completed_milestone_count=Count(
                    "milestones", filter=Q(milestones__completed=True)
                ),
                todo_milestone_count=Count(
                    "milestones",
                    filter=Q(milestones__bucket_status=Milestone.BucketStatus.TODO),
                ),
                in_progress_milestone_count=Count(
                    "milestones",
                    filter=Q(milestones__bucket_status=Milestone.BucketStatus.IN_PROGRESS),
                ),
                done_milestone_count=Count(
                    "milestones",
                    filter=Q(milestones__bucket_status=Milestone.BucketStatus.DONE),
                ),
            ).prefetch_related("phases").order_by("-updated_at")  # the aggregate drops Meta.ordering
        return qs.prefetch_related(
            "milestones",
            "board",
            "members",
            Prefetch(
                "phases",
                queryset=ProjectPhase.objects.annotate(
                    update_count=Count("updates")
                ).order_by("order"),
            ),
        )

    def get_serializer_class(self):
        if self.action == "list":
            return ProjectListSerializer
        return ProjectSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        if instance.user_id != self.request.user.id:
            raise PermissionDenied("Only the project owner can delete it.")
        from kanban.sync import release_ticket_milestones

        # Cards cascade from their milestone; tickets should outlive the project.
        release_ticket_milestones(instance)
        instance.delete()

    @action(detail=True, methods=["post"], url_path="members")
    def add_member(self, request, pk=None):
        project = self.get_object()
        if project.user_id != request.user.id:
            raise PermissionDenied("Only the project owner can add members.")
        serializer = AddMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        user = get_user_model().objects.filter(email__iexact=email).first()
        if user is None:
            raise ValidationError(
                {"email": "No account uses this email. Ask them to sign up first."}
            )
        if user.id == project.user_id:
            raise ValidationError({"email": "That's the project owner."})
        already_member = project.members.filter(pk=user.pk).exists()
        project.members.add(user)
        if not already_member:
            notifications.notify_project_member_added(project, user, request.user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"members/(?P<user_id>\d+)")
    def remove_member(self, request, pk=None, user_id=None):
        from kanban.sync import unassign_cards_without_access

        project = self.get_object()
        user_id = int(user_id)
        # The owner can remove anyone; a member can only remove (leave) themselves.
        if request.user.id not in (project.user_id, user_id):
            raise PermissionDenied("Only the project owner can remove other members.")
        member = get_object_or_404(project.members, pk=user_id)
        project.members.remove(member)
        if project.board_id:
            unassign_cards_without_access(project.board_id)
        notifications.notify_project_member_removed(project, member, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MilestoneListCreateView(generics.ListCreateAPIView):
    serializer_class = MilestoneSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Milestone.objects.filter(
            project_id=self.kwargs["project_id"],
            project__in=accessible_projects(self.request.user),
        )

    def perform_create(self, serializer):
        from kanban.sync import create_card_for_milestone

        project = get_object_or_404(
            accessible_projects(self.request.user),
            id=self.kwargs["project_id"],
        )
        milestone = serializer.save(project=project)
        create_card_for_milestone(milestone)


class MilestoneDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MilestoneSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "milestone_id"

    def get_queryset(self):
        return Milestone.objects.filter(
            project_id=self.kwargs["project_id"],
            project__in=accessible_projects(self.request.user),
        )

    def perform_update(self, serializer):
        from kanban.sync import sync_milestone_card_content

        milestone = serializer.save()
        sync_milestone_card_content(milestone)


class MilestoneCommentListCreateView(generics.ListCreateAPIView):
    serializer_class = MilestoneCommentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return MilestoneComment.objects.filter(
            milestone_id=self.kwargs["milestone_id"],
            milestone__project_id=self.kwargs["project_id"],
            milestone__project__in=accessible_projects(self.request.user),
        ).select_related("user")

    def perform_create(self, serializer):
        milestone = get_object_or_404(
            Milestone,
            id=self.kwargs["milestone_id"],
            project_id=self.kwargs["project_id"],
            project__in=accessible_projects(self.request.user),
        )
        comment = serializer.save(user=self.request.user, milestone=milestone)
        notifications.notify_milestone_comment_mentions(comment, self.request.user)


class MilestoneCommentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MilestoneCommentSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "comment_id"

    def get_queryset(self):
        return MilestoneComment.objects.filter(
            milestone_id=self.kwargs["milestone_id"],
            milestone__project_id=self.kwargs["project_id"],
            milestone__project__in=accessible_projects(self.request.user),
        ).select_related("user")

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if request.method not in ("GET", "HEAD", "OPTIONS") and obj.user_id != request.user.id:
            raise PermissionDenied("You can only edit your own comments.")


class ProjectPhaseDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = ProjectPhaseSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "key"
    lookup_url_kwarg = "phase_key"

    def get_queryset(self):
        return ProjectPhase.objects.filter(
            project_id=self.kwargs["project_id"],
            project__in=accessible_projects(self.request.user),
        ).annotate(update_count=Count("updates"))

    def perform_update(self, serializer):
        old_status = serializer.instance.status
        phase = serializer.save()
        if phase.status != old_status:
            PhaseUpdate.objects.create(
                phase=phase,
                user=self.request.user,
                kind=PhaseUpdate.Kind.STATUS_CHANGE,
                body=(
                    f"{ProjectPhase.Status(old_status).label} → "
                    f"{ProjectPhase.Status(phase.status).label}"
                ),
            )
            phase.project.sync_status_from_phases()
        phase.update_count = phase.updates.count()


class PhaseUpdateListCreateView(generics.ListCreateAPIView):
    serializer_class = PhaseUpdateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PhaseUpdate.objects.filter(
            phase__key=self.kwargs["phase_key"],
            phase__project_id=self.kwargs["project_id"],
            phase__project__in=accessible_projects(self.request.user),
        ).select_related("user")

    def perform_create(self, serializer):
        phase = get_object_or_404(
            ProjectPhase,
            key=self.kwargs["phase_key"],
            project_id=self.kwargs["project_id"],
            project__in=accessible_projects(self.request.user),
        )
        update = serializer.save(user=self.request.user, phase=phase)
        notifications.notify_phase_update_mentions(update, self.request.user)


class PhaseUpdateDetailView(generics.DestroyAPIView):
    serializer_class = PhaseUpdateSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "update_id"

    def get_queryset(self):
        return PhaseUpdate.objects.filter(
            phase__key=self.kwargs["phase_key"],
            phase__project_id=self.kwargs["project_id"],
            phase__project__in=accessible_projects(self.request.user),
        )

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if obj.user_id != request.user.id:
            raise PermissionDenied("You can only delete your own updates.")
