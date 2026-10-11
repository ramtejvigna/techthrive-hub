import hmac
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification, WebSocketConnection
from .serializers import NotificationSerializer

NOTIFICATION_LIST_LIMIT = 50
TICKET_SALT = "notifications.ws-ticket"
TICKET_MAX_AGE_SECONDS = 60
# API Gateway closes every WebSocket after two hours, so older rows are dead.
CONNECTION_MAX_AGE = timedelta(hours=2)


class NotificationListView(APIView):
    """The latest notifications plus the unread count, in one request."""

    def get(self, request):
        notifications = Notification.objects.filter(recipient=request.user).select_related("actor")
        return Response(
            {
                "results": NotificationSerializer(
                    notifications[:NOTIFICATION_LIST_LIMIT], many=True
                ).data,
                "unread_count": notifications.filter(read_at__isnull=True).count(),
            }
        )


class NotificationReadView(APIView):
    def post(self, request, pk):
        notification = get_object_or_404(Notification, pk=pk, recipient=request.user)
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationReadAllView(APIView):
    def post(self, request):
        Notification.objects.filter(recipient=request.user, read_at__isnull=True).update(
            read_at=timezone.now()
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class WebSocketTicketView(APIView):
    """Where to connect, and a short-lived ticket proving who is connecting.

    Browsers can't set headers on a WebSocket, so the JWT would otherwise have
    to go in the URL (and into gateway logs). The ticket is useless after a
    minute. `url` is null when realtime delivery isn't configured; the
    frontend then polls instead.
    """

    def post(self, request):
        if not settings.WEBSOCKET_PUBLIC_URL:
            return Response({"url": None, "ticket": None})
        ticket = signing.TimestampSigner(salt=TICKET_SALT).sign(str(request.user.pk))
        return Response({"url": settings.WEBSOCKET_PUBLIC_URL, "ticket": ticket})


class GatewayCallbackView(APIView):
    """Base for the `$connect` / `$disconnect` callbacks from the gateway.

    These aren't called by browsers. API Gateway (or the local stand-in)
    forwards the connection id and ticket as headers, plus a shared secret so
    nobody else can register connections.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        secret = request.headers.get("X-WS-Secret", "")
        if not settings.WEBSOCKET_SHARED_SECRET or not hmac.compare_digest(
            secret, settings.WEBSOCKET_SHARED_SECRET
        ):
            self.permission_denied(request, message="Invalid gateway secret.")

    def connection_id(self, request):
        return request.headers.get("X-Connection-Id", "").strip()


class WebSocketConnectView(GatewayCallbackView):
    def post(self, request):
        connection_id = self.connection_id(request)
        try:
            user_id = signing.TimestampSigner(salt=TICKET_SALT).unsign(
                request.headers.get("X-WS-Ticket", ""), max_age=TICKET_MAX_AGE_SECONDS
            )
        except signing.BadSignature:
            # A non-2xx answer makes the gateway refuse the connection.
            return Response({"detail": "Invalid or expired ticket."}, status=status.HTTP_403_FORBIDDEN)
        user = get_user_model().objects.filter(pk=user_id, is_active=True).first()
        if user is None or not connection_id:
            return Response(status=status.HTTP_403_FORBIDDEN)

        WebSocketConnection.objects.filter(connected_at__lt=timezone.now() - CONNECTION_MAX_AGE).delete()
        WebSocketConnection.objects.update_or_create(
            connection_id=connection_id, defaults={"user": user}
        )
        return Response(status=status.HTTP_200_OK)


class WebSocketDisconnectView(GatewayCallbackView):
    def post(self, request):
        WebSocketConnection.objects.filter(connection_id=self.connection_id(request)).delete()
        return Response(status=status.HTTP_200_OK)
