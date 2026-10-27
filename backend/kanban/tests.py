from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Board, Card, Column

User = get_user_model()


class TicketStructureTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner@example.com", "pw-owner-123")
        self.board = Board.objects.create(user=self.owner, title="Launch", key="LCH")
        self.todo = Column.objects.create(board=self.board, name="To Do", position=0)
        self.a = Card.objects.create(column=self.todo, title="A")
        self.b = Card.objects.create(column=self.todo, title="B")
        self.c = Card.objects.create(column=self.todo, title="C")
        self.client.force_authenticate(self.owner)

    def patch(self, card, data):
        return self.client.patch(f"/api/boards/cards/{card.id}/", data, format="json")

    def test_ticket_fields_round_trip_and_checklists_are_normalised(self):
        response = self.patch(
            self.a,
            {
                "objective": "Users can sign in with Google",
                "requirements": "- OAuth via allauth",
                "subtasks": [{"text": "  Add provider  "}, {"text": " "}, {"text": "Wire UI", "done": True}],
                "acceptance_criteria": [{"text": "Login works", "done": False}],
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["objective"], "Users can sign in with Google")
        self.assertEqual(
            response.data["subtasks"],
            [{"text": "Add provider", "done": False}, {"text": "Wire UI", "done": True}],
        )
        self.assertEqual(response.data["acceptance_criteria"], [{"text": "Login works", "done": False}])

    def test_malformed_checklist_is_rejected(self):
        response = self.patch(self.a, {"subtasks": ["just a string"]})
        self.assertEqual(response.status_code, 400)

    def test_dependencies_are_saved_and_listed_on_the_board(self):
        response = self.patch(self.a, {"dependencies": [str(self.b.id), str(self.c.id)]})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertCountEqual(response.data["dependencies"], [self.b.id, self.c.id])

        board = self.client.get(f"/api/boards/{self.board.id}/").data
        cards = {card["id"]: card for card in board["columns"][0]["cards"]}
        self.assertCountEqual(cards[str(self.a.id)]["dependencies"], [self.b.id, self.c.id])

    def test_self_and_circular_dependencies_are_rejected(self):
        self.assertEqual(self.patch(self.a, {"dependencies": [str(self.a.id)]}).status_code, 400)

        self.assertEqual(self.patch(self.a, {"dependencies": [str(self.b.id)]}).status_code, 200)
        self.assertEqual(self.patch(self.b, {"dependencies": [str(self.c.id)]}).status_code, 200)
        # C -> A would close the loop A -> B -> C -> A.
        self.assertEqual(self.patch(self.c, {"dependencies": [str(self.a.id)]}).status_code, 400)

    def test_dependencies_must_be_on_the_same_board(self):
        other = Board.objects.create(user=self.owner, title="Other", key="OTH")
        column = Column.objects.create(board=other, name="To Do", position=0)
        foreign = Card.objects.create(column=column, title="Elsewhere")
        response = self.patch(self.a, {"dependencies": [str(foreign.id)]})
        self.assertEqual(response.status_code, 400)
