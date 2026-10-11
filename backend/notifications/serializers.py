from accounts.serializers import UserSerializer
from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor = UserSerializer(read_only=True)
    read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = (
            "id",
            "kind",
            "actor",
            "title",
            "message",
            "url",
            "project_id",
            "board_id",
            "card_id",
            "read",
            "created_at",
        )

    def get_read(self, notification):
        return notification.read_at is not None
