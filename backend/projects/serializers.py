from accounts.serializers import UserSerializer
from rest_framework import serializers

from .models import Milestone, MilestoneComment, PhaseUpdate, Project, ProjectPhase


class MilestoneCommentSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = MilestoneComment
        fields = ("id", "body", "user", "created_at", "updated_at")
        read_only_fields = ("id", "user", "created_at", "updated_at")


class PhaseUpdateSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = PhaseUpdate
        fields = ("id", "kind", "body", "user", "created_at")
        read_only_fields = ("id", "kind", "user", "created_at")


class ProjectPhaseSerializer(serializers.ModelSerializer):
    label = serializers.CharField(source="get_key_display", read_only=True)
    update_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = ProjectPhase
        fields = (
            "id",
            "key",
            "label",
            "order",
            "status",
            "notes",
            "update_count",
            "updated_at",
        )
        read_only_fields = ("id", "key", "label", "order", "update_count", "updated_at")


class ProjectPhaseSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectPhase
        fields = ("key", "status")


class MilestoneSerializer(serializers.ModelSerializer):
    phase = serializers.PrimaryKeyRelatedField(
        queryset=ProjectPhase.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Milestone
        fields = (
            "id",
            "phase",
            "title",
            "target_date",
            "bucket_status",
            "completed",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "bucket_status", "completed", "created_at", "updated_at")

    def validate_phase(self, phase):
        if phase is None:
            return phase
        project_id = self.context["view"].kwargs["project_id"]
        if str(phase.project_id) != str(project_id):
            raise serializers.ValidationError("Phase does not belong to this project.")
        return phase


class AddMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ProjectAccessFields(serializers.Serializer):
    """Owner and the viewer's role, shared by the list and detail serializers."""

    owner = UserSerializer(source="user", read_only=True)
    is_owner = serializers.SerializerMethodField()

    def get_is_owner(self, project):
        return project.user_id == self.context["request"].user.id


CURRENT_PHASE_CHOICES = [
    *ProjectPhase.Key.choices,
    (Project.COMPLETED_PHASE, "All phases complete"),
]


class ProjectSerializer(ProjectAccessFields, serializers.ModelSerializer):
    members = UserSerializer(many=True, read_only=True)
    current_phase = serializers.ChoiceField(choices=CURRENT_PHASE_CHOICES, required=False)
    milestones = MilestoneSerializer(many=True, read_only=True)
    phases = ProjectPhaseSerializer(many=True, read_only=True)
    board_id = serializers.UUIDField(source="board.id", read_only=True, allow_null=True)
    board_title = serializers.CharField(source="board.title", read_only=True, allow_null=True)

    class Meta:
        model = Project
        fields = (
            "id",
            "name",
            "description",
            "status",
            "current_phase",
            "due_date",
            "board",
            "board_id",
            "board_title",
            "owner",
            "is_owner",
            "members",
            "phases",
            "milestones",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "status", "created_at", "updated_at")

    def validate_board(self, board):
        user = self.context["request"].user
        if self.instance is not None and self.instance.user_id != user.id:
            # Linking a board shares it with every member, so only the owner
            # may change it. Members' edit forms resend the current value.
            if board != self.instance.board:
                raise serializers.ValidationError(
                    "Only the project owner can change the linked board."
                )
            return board
        if board is not None and board.user_id != user.id:
            raise serializers.ValidationError("Board not found.")
        return board

    def create(self, validated_data):
        from kanban.sync import sync_project_milestones_to_board

        current_phase = validated_data.pop("current_phase", ProjectPhase.Key.REQUIREMENTS)
        project = super().create(validated_data)
        project.set_current_phase(current_phase)
        if project.board_id:
            sync_project_milestones_to_board(project)
        return project

    def update(self, instance, validated_data):
        from kanban.sync import (
            delete_milestone_cards_for_project,
            sync_project_milestones_to_board,
            unassign_cards_without_access,
        )

        old_board_id = instance.board_id
        current_phase = validated_data.pop("current_phase", None)
        project = super().update(instance, validated_data)
        if current_phase and current_phase != project.current_phase:
            project.set_current_phase(current_phase)

        if old_board_id and old_board_id != project.board_id:
            delete_milestone_cards_for_project(project)
            # Members of this project may no longer see the old board.
            unassign_cards_without_access(old_board_id)

        if project.board_id:
            sync_project_milestones_to_board(project)

        return project


class ProjectListSerializer(ProjectAccessFields, serializers.ModelSerializer):
    # People the project is shared with, not counting the owner.
    member_count = serializers.IntegerField(read_only=True)
    milestone_count = serializers.IntegerField(read_only=True)
    completed_milestone_count = serializers.IntegerField(read_only=True)
    todo_milestone_count = serializers.IntegerField(read_only=True)
    in_progress_milestone_count = serializers.IntegerField(read_only=True)
    done_milestone_count = serializers.IntegerField(read_only=True)
    phases = ProjectPhaseSummarySerializer(many=True, read_only=True)
    current_phase = serializers.CharField(read_only=True)
    board_id = serializers.UUIDField(source="board.id", read_only=True, allow_null=True)

    class Meta:
        model = Project
        fields = (
            "id",
            "name",
            "description",
            "status",
            "current_phase",
            "due_date",
            "board_id",
            "owner",
            "is_owner",
            "member_count",
            "milestone_count",
            "completed_milestone_count",
            "todo_milestone_count",
            "in_progress_milestone_count",
            "done_milestone_count",
            "phases",
            "created_at",
            "updated_at",
        )
