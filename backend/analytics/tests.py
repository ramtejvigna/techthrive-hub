from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from . import ga

User = get_user_model()


def report(dimensions=(), metrics=(), rows=(), metadata=None):
    """A report in Google's response shape; each row is (dimension values, metric values)."""
    return {
        "dimensionHeaders": [{"name": name} for name in dimensions],
        "metricHeaders": [{"name": name} for name in metrics],
        "rows": [
            {
                # Google leaves this key out when a report has no dimensions.
                **({"dimensionValues": [{"value": value} for value in row_dimensions]} if row_dimensions else {}),
                "metricValues": [{"value": str(value)} for value in row_metrics],
            }
            for row_dimensions, row_metrics in rows
        ],
        "metadata": metadata or {},
    }


def totals(users=0):
    values = [users, users * 2, users * 3, 0.5, 90.5, 1]
    return report(metrics=ga.METRICS.values(), rows=[((), values)])


FULL_REPORT = [
    totals(100),
    # Google omits the row altogether for a period with no traffic.
    report(metrics=ga.METRICS.values()),
    report(
        ("date",),
        ("activeUsers", "sessions", "screenPageViews"),
        [(("20261001",), (5, 6, 7)), (("20261003",), (1, 2, 3))],
    ),
    report(("pagePath",), ("screenPageViews",), [(("/",), (40,)), (("/blog",), (20,))]),
    report(("landingPage",), ("sessions",), [(("/",), (30,))]),
    report(("sessionDefaultChannelGroup",), ("sessions",), [(("Direct",), (10,))]),
    report(("country",), ("activeUsers",), [(("India",), (80,))], {"subjectToThresholding": True}),
    report(("deviceCategory",), ("activeUsers",), [(("mobile",), (60,))]),
    report(("eventName",), ("eventCount",), [(("page_view",), (500,))]),
]


def fake_batches(property_id, method, body):
    # Answers in order, so each test can feed FULL_REPORT through the batches.
    return {"reports": [fake_batches.reports.pop(0) for _ in body["requests"]]}


@override_settings(
    GA_SERVICE_ACCOUNT_EMAIL="bot@example.iam.gserviceaccount.com",
    GA_PRIVATE_KEY="key",
    GA_PROPERTIES={"Main site": "111", "Blog": "222"},
)
class AnalyticsApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user("owner@example.com", "pw-owner-123")
        self.client.force_authenticate(self.user)
        fake_batches.reports = list(FULL_REPORT)

    def test_requires_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/analytics/sites/").status_code, 401)

    def test_lists_sites(self):
        response = self.client.get("/api/analytics/sites/")
        self.assertEqual(
            response.json()["sites"],
            [{"id": "111", "name": "Main site"}, {"id": "222", "name": "Blog"}],
        )

    @override_settings(GA_PRIVATE_KEY="")
    def test_no_sites_until_credentials_are_set(self):
        self.assertEqual(self.client.get("/api/analytics/sites/").json()["sites"], [])
        self.assertEqual(self.client.get("/api/analytics/sites/111/report/").status_code, 404)

    def test_unknown_site_is_not_found(self):
        self.assertEqual(self.client.get("/api/analytics/sites/999/report/").status_code, 404)

    def test_rejects_unknown_range(self):
        response = self.client.get("/api/analytics/sites/111/report/?range=3y")
        self.assertEqual(response.status_code, 400)

    @patch("analytics.ga._post", side_effect=fake_batches)
    def test_builds_the_report(self, post):
        data = self.client.get("/api/analytics/sites/111/report/?range=7d").json()

        self.assertEqual(data["days"], 7)
        self.assertEqual(data["totals"]["users"], 100)
        self.assertEqual(data["totals"]["engagement_rate"], 0.5)
        self.assertEqual(data["previous"]["users"], 0)
        self.assertEqual(data["pages"][1], {"label": "/blog", "value": 20})
        self.assertEqual(data["events"], [{"label": "page_view", "value": 500}])
        self.assertTrue(data["partial_data"])

    @patch("analytics.ga._post", side_effect=fake_batches)
    def test_splits_requests_into_batches_google_accepts(self, post):
        self.client.get("/api/analytics/sites/111/report/")

        sizes = [len(call.args[2]["requests"]) for call in post.call_args_list]
        self.assertEqual(sizes, [5, 4])

    @patch("analytics.ga._post", side_effect=fake_batches)
    def test_compares_equal_periods_ending_yesterday(self, post):
        self.client.get("/api/analytics/sites/111/report/?range=7d")

        requests = post.call_args_list[0].args[2]["requests"]
        self.assertEqual(requests[0]["dateRanges"], [{"startDate": "7daysAgo", "endDate": "yesterday"}])
        self.assertEqual(requests[1]["dateRanges"], [{"startDate": "14daysAgo", "endDate": "8daysAgo"}])

    @patch("analytics.ga._post", side_effect=fake_batches)
    def test_fills_days_without_traffic(self, post):
        daily = self.client.get("/api/analytics/sites/111/report/").json()["daily"]

        self.assertEqual([day["date"] for day in daily], ["2026-10-01", "2026-10-02", "2026-10-03"])
        self.assertEqual(daily[1]["users"], 0)

    @patch("analytics.ga._post", side_effect=fake_batches)
    def test_repeat_requests_use_the_cache(self, post):
        self.client.get("/api/analytics/sites/111/report/")
        self.client.get("/api/analytics/sites/111/report/")
        self.assertEqual(post.call_count, 2)  # The two batches of the first request.

    @patch("analytics.ga._post")
    def test_realtime(self, post):
        post.side_effect = [
            report(metrics=("activeUsers",), rows=[((), (4,))]),
            report(("unifiedScreenName",), ("activeUsers",), [(("Home",), (3,))]),
        ]
        data = self.client.get("/api/analytics/sites/111/realtime/").json()
        self.assertEqual(data, {"active_users": 4, "pages": [{"label": "Home", "value": 3}]})

    @patch("analytics.ga._post")
    def test_realtime_with_nobody_online(self, post):
        post.side_effect = [report(metrics=("activeUsers",)), report(("unifiedScreenName",), ("activeUsers",))]
        data = self.client.get("/api/analytics/sites/111/realtime/").json()
        self.assertEqual(data, {"active_users": 0, "pages": []})

    @patch("analytics.ga._post")
    def test_google_errors_reach_the_client_and_are_not_cached(self, post):
        post.side_effect = ga.AnalyticsError("Google Analytics refused access.")
        response = self.client.get("/api/analytics/sites/111/report/")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Google Analytics refused access.")

        post.side_effect = fake_batches
        self.assertEqual(self.client.get("/api/analytics/sites/111/report/").status_code, 200)

    @patch("analytics.ga._post")
    def test_overview_survives_one_site_failing(self, post):
        def respond(property_id, method, body):
            if property_id == "222":
                raise ga.AnalyticsError("Google Analytics refused access.")
            return {"reports": [totals(10), totals(5)]}

        post.side_effect = respond
        main, blog = self.client.get("/api/analytics/overview/").json()["sites"]

        self.assertEqual(main["totals"]["users"], 10)
        self.assertEqual(main["previous"]["users"], 5)
        self.assertIsNone(main["error"])
        self.assertIsNone(blog["totals"])
        self.assertEqual(blog["error"], "Google Analytics refused access.")


class GoogleResponseTests(APITestCase):
    def post_with_status(self, status_code):
        session = patch("analytics.ga._session").start()
        self.addCleanup(patch.stopall)
        session.return_value.post.return_value.ok = False
        session.return_value.post.return_value.status_code = status_code
        session.return_value.post.return_value.text = "error"
        with self.assertRaises(ga.AnalyticsError) as caught:
            ga._post("111", "batchRunReports", {})
        return caught.exception

    def test_forbidden_explains_the_fix(self):
        self.assertIn("Viewer", str(self.post_with_status(403).detail))

    def test_quota_is_retryable(self):
        self.assertEqual(self.post_with_status(429).status_code, 503)
