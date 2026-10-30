from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from projects.models import Milestone, Project

from .models import Board, Card, Column

User = get_user_model()


class LinkedBoardTicketMilestoneTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner@example.com", "pw-owner-123")
        self.board = Board.objects.create(user=self.owner, title="Launch", key="LCH")
        self.todo = Column.objects.create(board=self.board, name="To Do", position=0)
        self.done = Column.objects.create(board=self.board, name="Done", position=1)
        self.project = Project.objects.create(user=self.owner, name="Site", board=self.board)
        self.client.force_authenticate(self.owner)

    def create_ticket(self, column=None):
        response = self.client.post(
            "/api/boards/cards/", {"column": str((column or self.todo).id), "title": "Ship it"}
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response

    def test_new_ticket_becomes_a_milestone_of_the_linked_project(self):
        response = self.create_ticket(self.done)
        milestone = Milestone.objects.get(project=self.project)
        self.assertEqual(response.data["milestone_id"], str(milestone.id))
        self.assertEqual(response.data["project_name"], "Site")
        self.assertEqual(milestone.title, "Ship it")
        self.assertEqual(milestone.bucket_status, Milestone.BucketStatus.DONE)
        self.assertTrue(milestone.completed)

    def test_ticket_on_an_unlinked_board_is_not_a_milestone(self):
        other = Board.objects.create(user=self.owner, title="Other", key="OTH")
        column = Column.objects.create(board=other, name="To Do", position=0)
        response = self.create_ticket(column)
        self.assertIsNone(response.data["milestone_id"])
        self.assertFalse(Milestone.objects.exists())

    def test_existing_tickets_become_milestones_when_a_board_is_linked(self):
        other = Board.objects.create(user=self.owner, title="Other", key="OTH")
        column = Column.objects.create(board=other, name="To Do", position=0)
        card = Card.objects.create(column=column, title="Old ticket")

        response = self.client.patch(
            f"/api/projects/{self.project.id}/", {"board": str(other.id)}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        card.refresh_from_db()
        self.assertEqual(card.milestone.project, self.project)
        self.assertEqual(card.project, self.project)

    def test_opening_the_board_converts_tickets_that_predate_the_link(self):
        card = Card.objects.create(column=self.todo, title="Older")
        self.client.get(f"/api/boards/{self.board.id}/")
        self.client.get(f"/api/boards/{self.board.id}/")
        card.refresh_from_db()
        self.assertEqual(card.milestone.title, "Older")
        self.assertEqual(Card.objects.filter(column__board=self.board).count(), 1)
        self.assertEqual(self.project.milestones.count(), 1)

    def test_deleting_a_ticket_removes_its_milestone_for_good(self):
        response = self.create_ticket()
        url = f"/api/boards/cards/{response.data['id']}/"
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.client.get(f"/api/boards/{self.board.id}/")
        self.assertFalse(Card.objects.exists())
        self.assertFalse(Milestone.objects.exists())

    def test_deleting_a_column_does_not_bring_its_tickets_back(self):
        self.create_ticket(self.done)
        url = f"/api/boards/{self.board.id}/columns/{self.done.id}/"
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.client.get(f"/api/boards/{self.board.id}/")
        self.assertFalse(Card.objects.exists())
        self.assertFalse(Milestone.objects.exists())

    def test_unlinking_keeps_tickets_but_removes_only_project_cards(self):
        ticket_id = self.create_ticket().data["id"]
        planned = Milestone.objects.create(project=self.project, title="Planned")
        self.client.get(f"/api/boards/{self.board.id}/")

        response = self.client.patch(
            f"/api/projects/{self.project.id}/", {"board": None}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)

        ticket = Card.objects.get(pk=ticket_id)
        self.assertIsNone(ticket.milestone_id)
        self.assertIsNone(ticket.project_id)
        self.assertEqual(list(self.project.milestones.all()), [planned])
        self.assertFalse(Card.objects.filter(milestone=planned).exists())

    def test_deleting_the_project_keeps_its_tickets(self):
        ticket_id = self.create_ticket().data["id"]
        self.assertEqual(self.client.delete(f"/api/projects/{self.project.id}/").status_code, 204)
        ticket = Card.objects.get(pk=ticket_id)
        self.assertIsNone(ticket.milestone_id)

    def test_ticket_can_move_between_the_boards_projects_only(self):
        second = Project.objects.create(user=self.owner, name="App", board=self.board)
        unlinked = Project.objects.create(user=self.owner, name="Elsewhere")
        response = self.create_ticket()
        url = f"/api/boards/cards/{response.data['id']}/"
        self.assertEqual(response.data["project_id"], str(self.project.id))

        moved = self.client.patch(url, {"project": str(second.id)}, format="json")
        self.assertEqual(moved.status_code, 200, moved.data)
        self.assertEqual(Milestone.objects.get().project, second)

        for project_id in (str(unlinked.id), None):
            rejected = self.client.patch(url, {"project": project_id}, format="json")
            self.assertEqual(rejected.status_code, 400)


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
