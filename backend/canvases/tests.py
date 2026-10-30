import uuid

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from projects.models import Project

from .models import Canvas
from .serializers import MAX_SCENE_BYTES

User = get_user_model()
PNG = "data:image/png;base64,iVBORw0KGgo="


class CanvasApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner@example.com", "pw-owner-123")
        self.member = User.objects.create_user("member@example.com", "pw-member-123")
        self.outsider = User.objects.create_user("outsider@example.com", "pw-outsider-123")
        self.project = Project.objects.create(user=self.owner, name="Launch")
        self.project.members.add(self.member)
        self.canvas = Canvas.objects.create(user=self.owner, title="Plan", project=self.project)
        self.url = f"/api/canvases/{self.canvas.id}/"
        self.client.force_authenticate(self.owner)

    def ids(self):
        return [item["id"] for item in self.client.get("/api/canvases/").json()["results"]]

    def save_scene(self, base_version, elements=()):
        return self.client.patch(
            self.url,
            {"scene": {"elements": list(elements)}, "base_version": base_version},
            format="json",
        )

    def test_list_leaves_out_the_scene(self):
        item = self.client.get("/api/canvases/").json()["results"][0]
        self.assertNotIn("scene", item)
        self.assertEqual(item["project_name"], "Launch")

    def test_new_canvas_belongs_to_its_creator(self):
        response = self.client.post("/api/canvases/", {"title": " "}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["title"], "Untitled canvas")
        self.assertEqual(response.data["version"], 1)
        self.assertTrue(response.data["is_owner"])

    def test_project_members_can_edit_but_outsiders_cannot_see(self):
        self.client.force_authenticate(self.member)
        self.assertIn(str(self.canvas.id), self.ids())
        self.assertEqual(self.save_scene(1).status_code, 200)

        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.ids(), [])
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_project_owner_sees_a_members_canvas(self):
        shared = Canvas.objects.create(user=self.member, project=self.project)
        self.assertIn(str(shared.id), self.ids())

    def test_only_the_owner_can_delete_or_change_the_project(self):
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.delete(self.url).status_code, 403)
        moved = self.client.patch(self.url, {"project": None}, format="json")
        self.assertEqual(moved.status_code, 400)

        # Members' edit forms resend the current value.
        same = self.client.patch(self.url, {"project": str(self.project.id)}, format="json")
        self.assertEqual(same.status_code, 200, same.data)

        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.delete(self.url).status_code, 204)

    def test_cannot_link_a_project_you_cannot_access(self):
        private = Project.objects.create(user=self.outsider, name="Private")
        response = self.client.patch(self.url, {"project": str(private.id)}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_stale_save_is_rejected_and_keeps_the_newer_scene(self):
        self.assertEqual(self.save_scene(1, [{"id": "new"}]).json()["version"], 2)
        response = self.save_scene(1, [{"id": "stale"}])
        self.assertEqual(response.status_code, 409)
        self.canvas.refresh_from_db()
        self.assertEqual(self.canvas.version, 2)
        self.assertEqual(self.canvas.scene["elements"], [{"id": "new"}])

    def test_scene_save_needs_a_base_version(self):
        response = self.client.patch(self.url, {"scene": {"elements": []}}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_renaming_does_not_conflict_with_an_open_editor(self):
        self.client.patch(self.url, {"title": "Renamed"}, format="json")
        self.assertEqual(self.save_scene(1).status_code, 200)

    def test_oversized_and_malformed_scenes_are_rejected(self):
        big = [{"text": "x" * MAX_SCENE_BYTES}]
        self.assertEqual(self.save_scene(1, big).status_code, 400)
        response = self.client.patch(
            self.url, {"scene": {"elements": "nope"}, "base_version": 1}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_thumbnail_must_be_a_png_data_url(self):
        ok = self.client.patch(self.url, {"thumbnail": PNG}, format="json")
        self.assertEqual(ok.status_code, 200, ok.data)
        for bad in ("<svg onload=alert(1)>", "data:image/svg+xml;base64,PHN2Zz4=", "javascript:alert(1)"):
            response = self.client.patch(self.url, {"thumbnail": bad}, format="json")
            self.assertEqual(response.status_code, 400, bad)

    def test_search_covers_text_inside_the_drawing_and_project_filters(self):
        self.canvas.scene_text = "Payment gateway"
        self.canvas.save()
        Canvas.objects.create(user=self.owner, title="Loose")

        found = self.client.get("/api/canvases/", {"q": "gateway"}).json()["results"]
        self.assertEqual([item["id"] for item in found], [str(self.canvas.id)])
        scoped = self.client.get("/api/canvases/", {"project": self.project.id}).json()["results"]
        self.assertEqual([item["id"] for item in scoped], [str(self.canvas.id)])

    def test_malformed_project_filter_is_a_client_error(self):
        self.assertEqual(self.client.get("/api/canvases/", {"project": "nope"}).status_code, 400)
        self.assertEqual(
            self.client.get("/api/canvases/", {"project": str(uuid.uuid4())}).json()["results"], []
        )

    def test_deleting_a_project_keeps_its_canvases(self):
        self.project.delete()
        self.canvas.refresh_from_db()
        self.assertIsNone(self.canvas.project_id)
