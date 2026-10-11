from django.contrib import admin

from .models import Notification, WebSocketConnection


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient", "kind", "title", "actor", "read_at", "created_at")
    list_filter = ("kind",)
    search_fields = ("recipient__email", "title")


@admin.register(WebSocketConnection)
class WebSocketConnectionAdmin(admin.ModelAdmin):
    list_display = ("connection_id", "user", "connected_at")
