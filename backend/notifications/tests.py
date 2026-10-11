from unittest import mock

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from kanban.models import Board, Card, Column
from projects.models import Milestone, Project

from .models import Notification, WebSocketConnection
from .services import mentioned_emails

User = get_user_model()
SECRET = "test-secret"


class NotificationTriggerTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner@example.com", "pw-owner-123")
        self.dev = User.objects.create_user("dev@example.com", "pw-dev-123")
        self.qa = User.objects.create_user("qa@example.com", "pw-qa-123")
        self.outsider = User.objects.create_user("outsider@example.com", "pw-outsider-123")

        self.board = Board.objects.create(user=self.owner, title="Launch", key="LCH")
        self.todo = Column.objects.create(board=self.board, name="To Do", position=0)
        self.doing = Column.objects.create(board=self.board, name="In Progress", position=1)
        self.project = Project.objects.create(user=self.owner, name="Launch", board=self.board)
        self.project.members.add(self.dev, self.qa)
        self.card = Card.objects.create(column=self.todo, title="Fix login")

    def as_user(self, user):
        self.client.force_authenticate(user)

    def kinds_for(self, user):
        return sorted(Notification.objects.filter(recipient=user).values_list("kind", flat=True))

    def comment(self, body, user=None):
        self.as_user(user or self.owner)
        response = self.client.post(f"/api/boards/cards/{self.card.id}/comments/", {"body": body})
        self.assertEqual(response.status_code, 201)

    def test_mention_parsing(self):
        self.assertEqual(
            mentioned_emails(r"hi @Dev@Example.com, cc @first\_last@x.io. mail me@x.com"),
            {"dev@example.com", "first_last@x.io"},
        )

    def test_assigning_notifies_the_assignee_not_the_actor(self):
        self.as_user(self.owner)
        self.client.patch(f"/api/boards/cards/{self.card.id}/", {"assignee": self.dev.id})
        self.assertEqual(self.kinds_for(self.dev), ["card_assigned"])
        notification = Notification.objects.get(recipient=self.dev)
        self.assertEqual(notification.title, "LCH-1 · Fix login")
        self.assertEqual(
            notification.url, f"/dashboard/kanban/{self.board.id}?issue={self.card.id}"
        )

        self.client.patch(f"/api/boards/cards/{self.card.id}/", {"assignee": self.owner.id})
        self.assertEqual(self.kinds_for(self.owner), [])

    def test_moving_an_assigned_card_notifies_the_assignee(self):
        self.card.assignee = self.dev
        self.card.save()
        self.as_user(self.qa)
        self.client.patch(
            f"/api/boards/{self.board.id}/reorder/",
            {"cards": [{"id": str(self.card.id), "column_id": str(self.doing.id), "position": 0}]},
            format="json",
        )
        notification = Notification.objects.get(recipient=self.dev)
        self.assertEqual(notification.kind, "card_status")
        self.assertIn("To Do to In Progress", notification.message)

    def test_comment_notifies_assignee_and_participants_with_mentions_first(self):
        self.card.assignee = self.dev
        self.card.save()
        self.comment("First!", user=self.qa)
        self.assertEqual(self.kinds_for(self.dev), ["card_comment"])

        # The owner mentions dev: dev gets the mention only, qa (an earlier
        # commenter) gets a comment notification, the outsider gets nothing.
        self.comment("@dev@example.com can you look? @outsider@example.com")
        self.assertEqual(self.kinds_for(self.dev), ["card_comment", "mention"])
        self.assertEqual(self.kinds_for(self.qa), ["card_comment"])
        self.assertEqual(self.kinds_for(self.outsider), [])

    def test_description_mentions_only_notify_new_people(self):
        self.as_user(self.owner)
        url = f"/api/boards/cards/{self.card.id}/"
        self.client.patch(url, {"description": "ask @dev@example.com"})
        self.client.patch(url, {"description": "ask @dev@example.com and @qa@example.com"})
        self.assertEqual(self.kinds_for(self.dev), ["mention"])
        self.assertEqual(self.kinds_for(self.qa), ["mention"])

    def test_project_mentions_and_membership(self):
        milestone = Milestone.objects.create(project=self.project, title="Beta")
        self.as_user(self.dev)
        self.client.post(
            f"/api/projects/{self.project.id}/milestones/{milestone.id}/comments/",
            {"body": "@qa@example.com please test"},
        )
        self.client.post(
            f"/api/projects/{self.project.id}/phases/testing/updates/",
            {"body": "@owner@example.com done"},
        )
        self.assertEqual(self.kinds_for(self.qa), ["mention"])
        self.assertEqual(self.kinds_for(self.owner), ["mention"])

        self.as_user(self.owner)
        self.client.post(f"/api/projects/{self.project.id}/members/", {"email": self.outsider.email})
        self.client.delete(f"/api/projects/{self.project.id}/members/{self.outsider.id}/")
        self.assertEqual(self.kinds_for(self.outsider), ["project_added", "project_removed"])

        # Leaving on your own doesn't notify anyone.
        self.as_user(self.qa)
        self.client.delete(f"/api/projects/{self.project.id}/members/{self.qa.id}/")
        self.assertEqual(self.kinds_for(self.qa), ["mention"])

    def test_list_and_mark_read(self):
        self.as_user(self.owner)
        self.client.patch(f"/api/boards/cards/{self.card.id}/", {"assignee": self.dev.id})
        self.comment("ping")

        self.as_user(self.dev)
        data = self.client.get("/api/notifications/").json()
        self.assertEqual(data["unread_count"], 2)
        self.assertEqual([n["kind"] for n in data["results"]], ["card_comment", "card_assigned"])

        self.client.post(f"/api/notifications/{data['results'][0]['id']}/read/")
        self.assertEqual(self.client.get("/api/notifications/").json()["unread_count"], 1)
        self.client.post("/api/notifications/read-all/")
        self.assertEqual(self.client.get("/api/notifications/").json()["unread_count"], 0)

        # Other people's notifications are invisible.
        self.as_user(self.qa)
        other = Notification.objects.filter(recipient=self.dev).first()
        self.assertEqual(self.client.post(f"/api/notifications/{other.id}/read/").status_code, 404)


@override_settings(
    WEBSOCKET_PUBLIC_URL="wss://ws.example.com/prod",
    WEBSOCKET_MANAGEMENT_URL="https://ws.example.com/prod",
    WEBSOCKET_SHARED_SECRET=SECRET,
)
class WebSocketHandshakeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("dev@example.com", "pw-dev-123")
        self.other = User.objects.create_user("qa@example.com", "pw-qa-123")

    def ticket(self):
        self.client.force_authenticate(self.user)
        data = self.client.post("/api/notifications/ws/ticket/").json()
        self.client.force_authenticate(None)
        self.assertEqual(data["url"], "wss://ws.example.com/prod")
        return data["ticket"]

    def connect(self, ticket, secret=SECRET, connection_id="conn-1"):
        return self.client.post(
            "/api/notifications/ws/connect/",
            HTTP_X_WS_SECRET=secret,
            HTTP_X_CONNECTION_ID=connection_id,
            HTTP_X_WS_TICKET=ticket,
        )

    def test_connect_registers_the_ticket_owner(self):
        self.assertEqual(self.connect(self.ticket()).status_code, 200)
        self.assertEqual(WebSocketConnection.objects.get().user, self.user)

        self.client.post(
            "/api/notifications/ws/disconnect/",
            HTTP_X_WS_SECRET=SECRET,
            HTTP_X_CONNECTION_ID="conn-1",
        )
        self.assertFalse(WebSocketConnection.objects.exists())

    def test_connect_rejects_bad_secret_or_ticket(self):
        ticket = self.ticket()
        self.assertEqual(self.connect(ticket, secret="wrong").status_code, 403)
        self.assertEqual(self.connect(ticket + "x").status_code, 403)
        self.assertEqual(self.connect("").status_code, 403)
        self.assertFalse(WebSocketConnection.objects.exists())

    @override_settings(WEBSOCKET_PUBLIC_URL="")
    def test_ticket_reports_realtime_off(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(
            self.client.post("/api/notifications/ws/ticket/").json(), {"url": None, "ticket": None}
        )

    def test_push_reaches_only_the_recipient_and_drops_gone_sockets(self):
        WebSocketConnection.objects.create(connection_id="dev-live", user=self.user)
        WebSocketConnection.objects.create(connection_id="dev-gone", user=self.user)
        WebSocketConnection.objects.create(connection_id="qa-live", user=self.other)
        board = Board.objects.create(user=self.user, title="B")
        column = Column.objects.create(board=board, name="To Do")
        card = Card.objects.create(column=column, title="T", assignee=self.user)

        with mock.patch(
            "notifications.push._send", side_effect=lambda cid, data: cid != "dev-gone"
        ) as send, self.captureOnCommitCallbacks(execute=True):
            from .services import notify_card_assigned

            notify_card_assigned(card, self.other)

        self.assertEqual(sorted(call.args[0] for call in send.call_args_list), ["dev-gone", "dev-live"])
        self.assertIn(b'"type": "notification"', send.call_args_list[0].args[1])
        self.assertEqual(
            sorted(WebSocketConnection.objects.values_list("connection_id", flat=True)),
            ["dev-live", "qa-live"],
        )
