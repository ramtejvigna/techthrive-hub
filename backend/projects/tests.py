from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from kanban.models import Board, Card, Column
from projects.models import Milestone, Project

User = get_user_model()


class ProjectSharingTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner@example.com", "pw-owner-123")
        self.member = User.objects.create_user("member@example.com", "pw-member-123")
        self.outsider = User.objects.create_user("outsider@example.com", "pw-outsider-123")

        self.board = Board.objects.create(user=self.owner, title="Launch")
        self.column = Column.objects.create(board=self.board, name="To Do", position=0)
        self.project = Project.objects.create(user=self.owner, name="Launch", board=self.board)
        Milestone.objects.create(project=self.project, title="Beta")

    def as_user(self, user):
        self.client.force_authenticate(user)

    def add_member(self, user=None):
        self.as_user(self.owner)
        return self.client.post(
            f"/api/projects/{self.project.id}/members/",
            {"email": (user or self.member).email.upper()},
        )

    def ids(self, response):
        data = response.json()
        return {item["id"] for item in data.get("results", data)}

    def test_owner_adds_member_by_email(self):
        response = self.add_member()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["email"], self.member.email)
        self.assertTrue(self.project.members.filter(pk=self.member.pk).exists())

    def test_unknown_email_and_owner_email_are_rejected(self):
        self.as_user(self.owner)
        url = f"/api/projects/{self.project.id}/members/"
        self.assertEqual(self.client.post(url, {"email": "nobody@example.com"}).status_code, 400)
        self.assertEqual(self.client.post(url, {"email": self.owner.email}).status_code, 400)

    def test_member_sees_project_and_its_board(self):
        self.as_user(self.member)
        self.assertNotIn(str(self.project.id), self.ids(self.client.get("/api/projects/")))
        self.assertEqual(self.client.get(f"/api/boards/{self.board.id}/").status_code, 404)

        self.add_member()
        self.as_user(self.member)
        projects = self.client.get("/api/projects/")
        self.assertIn(str(self.project.id), self.ids(projects))
        self.assertFalse(projects.json()["results"][0]["is_owner"])
        self.assertIn(str(self.board.id), self.ids(self.client.get("/api/boards/")))

        board = self.client.get(f"/api/boards/{self.board.id}/").json()
        self.assertEqual(
            {user["email"] for user in board["members"]},
            {self.owner.email, self.member.email},
        )
        summary = self.client.get("/api/dashboard/summary/").json()
        self.assertEqual((summary["total_projects"], summary["total_boards"]), (1, 1))

    def test_outsider_sees_nothing(self):
        self.add_member()
        self.as_user(self.outsider)
        self.assertEqual(self.ids(self.client.get("/api/projects/")), set())
        self.assertEqual(self.ids(self.client.get("/api/boards/")), set())
        self.assertEqual(self.client.get(f"/api/projects/{self.project.id}/").status_code, 404)
        self.assertEqual(
            self.client.get(f"/api/projects/{self.project.id}/milestones/").json()["results"], []
        )

    def test_list_counts_are_not_inflated_by_members(self):
        self.add_member()
        self.add_member(self.outsider)
        self.as_user(self.owner)
        projects = self.client.get("/api/projects/").json()["results"]
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0]["milestone_count"], 1)

    def test_only_owner_manages_members_and_deletes(self):
        self.add_member()
        self.as_user(self.member)
        url = f"/api/projects/{self.project.id}/members/"
        self.assertEqual(self.client.post(url, {"email": self.outsider.email}).status_code, 403)
        self.assertEqual(self.client.delete(f"/api/projects/{self.project.id}/").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/boards/{self.board.id}/").status_code, 403)
        self.assertTrue(Project.objects.filter(pk=self.project.pk).exists())

    def test_member_can_edit_but_not_relink_board(self):
        self.add_member()
        other_board = Board.objects.create(user=self.member, title="Mine")
        self.as_user(self.member)
        url = f"/api/projects/{self.project.id}/"
        ok = self.client.patch(url, {"name": "Renamed", "board": str(self.board.id)})
        self.assertEqual(ok.status_code, 200)
        relink = self.client.patch(url, {"board": str(other_board.id)})
        self.assertEqual(relink.status_code, 400)
        self.project.refresh_from_db()
        self.assertEqual((self.project.name, self.project.board_id), ("Renamed", self.board.id))

    def test_member_works_on_board_and_assigns_teammates(self):
        self.add_member()
        self.as_user(self.member)
        created = self.client.post(
            "/api/boards/cards/",
            {"column": str(self.column.id), "title": "Ship it", "assignee": self.owner.id},
        )
        self.assertEqual(created.status_code, 201)
        card_url = f"/api/boards/cards/{created.json()['id']}/"
        self.assertEqual(self.client.patch(card_url, {"assignee": self.outsider.id}).status_code, 400)
        self.assertEqual(self.client.patch(card_url, {"assignee": self.member.id}).status_code, 200)

    def test_leaving_revokes_access_and_unassigns(self):
        self.add_member()
        card = Card.objects.create(column=self.column, title="Task", assignee=self.member)
        self.as_user(self.owner)
        self.assertEqual(
            self.client.delete(
                f"/api/projects/{self.project.id}/members/{self.outsider.id}/"
            ).status_code,
            404,
        )

        self.as_user(self.member)
        response = self.client.delete(f"/api/projects/{self.project.id}/members/{self.member.id}/")
        self.assertEqual(response.status_code, 204)
        card.refresh_from_db()
        self.assertIsNone(card.assignee)
        self.assertEqual(self.client.get(f"/api/boards/{self.board.id}/").status_code, 404)

    def test_user_search(self):
        self.as_user(self.owner)
        url = "/api/auth/users/"
        emails = lambda **params: [u["email"] for u in self.client.get(url, params).json()]
        self.assertEqual(emails(q="m"), [])  # too short
        self.assertEqual(emails(q="EXAMPLE"), [self.member.email, self.outsider.email])
        self.assertEqual(emails(q="mem"), [self.member.email])
        self.assertEqual(len(emails(q="example", project="not-a-uuid")), 2)

        self.add_member()
        self.as_user(self.owner)
        self.assertEqual(emails(q="example", project=self.project.id), [self.outsider.email])

    def test_member_cannot_remove_others(self):
        self.add_member()
        self.add_member(self.outsider)
        self.as_user(self.member)
        response = self.client.delete(f"/api/projects/{self.project.id}/members/{self.outsider.id}/")
        self.assertEqual(response.status_code, 403)
