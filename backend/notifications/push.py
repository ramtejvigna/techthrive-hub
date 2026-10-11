"""Deliver messages to users' open WebSockets.

Sockets are held by API Gateway in production and by the local stand-in
(`manage.py run_ws_gateway`) in development. Both expose the same management
API, `POST {WEBSOCKET_MANAGEMENT_URL}/@connections/{id}`, so this module only
needs to know where that is. Delivery is best effort: notifications are
already saved, and clients refetch them whenever they reconnect.
"""

import json
import logging
import urllib.error
import urllib.request
from functools import lru_cache
from urllib.parse import quote

from django.conf import settings

from .models import WebSocketConnection

logger = logging.getLogger(__name__)


def push_to_users(messages_by_user_id):
    """Send `{user_id: message}` to every socket each user has open."""
    if not settings.WEBSOCKET_MANAGEMENT_URL or not messages_by_user_id:
        return
    connections = WebSocketConnection.objects.filter(user_id__in=messages_by_user_id.keys())
    gone = []
    for connection in connections:
        data = json.dumps(messages_by_user_id[connection.user_id], default=str).encode()
        try:
            if not _send(connection.connection_id, data):
                gone.append(connection.connection_id)
        except Exception:  # noqa: BLE001 - one bad socket mustn't fail the request
            logger.exception("WebSocket push to %s failed", connection.connection_id)
    if gone:
        WebSocketConnection.objects.filter(connection_id__in=gone).delete()


def _send(connection_id, data):
    """Return False if the connection no longer exists."""
    endpoint = settings.WEBSOCKET_MANAGEMENT_URL.rstrip("/")
    if endpoint.startswith("http://"):
        return _send_local(f"{endpoint}/@connections/{quote(connection_id)}", data)
    client = _gateway_client(endpoint)
    try:
        client.post_to_connection(ConnectionId=connection_id, Data=data)
    except client.exceptions.GoneException:
        return False
    return True


def _send_local(url, data):
    request = urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=3):
            return True
    except urllib.error.HTTPError as error:
        if error.code == 410:
            return False
        raise


@lru_cache(maxsize=1)
def _gateway_client(endpoint):
    import boto3

    return boto3.client("apigatewaymanagementapi", endpoint_url=endpoint)
