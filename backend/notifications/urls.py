from django.urls import path

from .views import (
    NotificationListView,
    NotificationReadAllView,
    NotificationReadView,
    WebSocketConnectView,
    WebSocketDisconnectView,
    WebSocketTicketView,
)

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("read-all/", NotificationReadAllView.as_view(), name="notification-read-all"),
    path("<uuid:pk>/read/", NotificationReadView.as_view(), name="notification-read"),
    path("ws/ticket/", WebSocketTicketView.as_view(), name="notification-ws-ticket"),
    path("ws/connect/", WebSocketConnectView.as_view(), name="notification-ws-connect"),
    path("ws/disconnect/", WebSocketDisconnectView.as_view(), name="notification-ws-disconnect"),
]
