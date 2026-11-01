"""Read-only client for the Google Analytics 4 Data API.

Talks to the REST API directly: the official client library brings in gRPC,
which is a heavy addition to the Lambda image and its cold start. Reports are
fetched when someone opens the page, never on a schedule, so nothing here keeps
Neon awake. See "Website analytics" in deploy/README.md for the Google setup.
"""

import logging
from datetime import datetime, timedelta
from functools import lru_cache

import requests
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException

logger = logging.getLogger(__name__)

API_URL = "https://analyticsdata.googleapis.com/v1beta"
SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
TOKEN_URI = "https://oauth2.googleapis.com/token"
# Lambda stops the whole request at 30 seconds; give up well before that.
TIMEOUT_SECONDS = 10
BATCH_LIMIT = 5  # The most reports Google accepts in one batchRunReports call.

# Standard reports settle over hours, so a short cache loses nothing. The cache
# is per Lambda instance, which is plenty for a handful of users.
REPORT_CACHE_SECONDS = 10 * 60
REALTIME_CACHE_SECONDS = 60

TOP_ROWS = 10
METRICS = {
    "users": "activeUsers",
    "sessions": "sessions",
    "views": "screenPageViews",
    "engagement_rate": "engagementRate",
    "avg_session_seconds": "averageSessionDuration",
    "key_events": "keyEvents",
}
DAILY_METRICS = ("users", "sessions", "views")


class AnalyticsError(APIException):
    """A failed call to Google; DRF returns it to the client as the given status."""

    status_code = status.HTTP_502_BAD_GATEWAY

    def __init__(self, detail, status_code=status.HTTP_502_BAD_GATEWAY):
        super().__init__(detail)
        self.status_code = status_code


def sites():
    """The configured sites, or none until the service account is set up."""
    if not (settings.GA_SERVICE_ACCOUNT_EMAIL and settings.GA_PRIVATE_KEY):
        return []
    return [{"id": str(id_), "name": name} for name, id_ in settings.GA_PROPERTIES.items()]


@lru_cache(maxsize=1)
def _session():
    # Imported here so the rest of the API doesn't pay for it on a cold start.
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2 import service_account

    credentials = service_account.Credentials.from_service_account_info(
        {
            "client_email": settings.GA_SERVICE_ACCOUNT_EMAIL,
            "private_key": settings.GA_PRIVATE_KEY,
            "token_uri": TOKEN_URI,
        },
        scopes=[SCOPE],
    )
    return AuthorizedSession(credentials)


def _post(property_id, method, body):
    from google.auth.exceptions import GoogleAuthError

    url = f"{API_URL}/properties/{property_id}:{method}"
    try:
        response = _session().post(url, json=body, timeout=TIMEOUT_SECONDS)
    except (GoogleAuthError, requests.RequestException, ValueError) as error:
        # A ValueError means the private key itself couldn't be read.
        logger.exception("Google Analytics request failed: %s", method)
        raise AnalyticsError("Couldn't reach Google Analytics. Check the service account credentials.") from error

    if response.ok:
        return response.json()

    logger.error("Google Analytics returned %s: %s", response.status_code, response.text[:500])
    if response.status_code == status.HTTP_403_FORBIDDEN:
        raise AnalyticsError("Google Analytics refused access. Add the service account as a Viewer on this property.")
    if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        raise AnalyticsError(
            "Google Analytics quota reached. Try again later.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    raise AnalyticsError("Google Analytics couldn't run this report.")


def _batch(property_id, reports):
    results = []
    for start in range(0, len(reports), BATCH_LIMIT):
        body = {"requests": reports[start : start + BATCH_LIMIT]}
        results.extend(_post(property_id, "batchRunReports", body)["reports"])
    return results


def _periods(days):
    """The last `days` full days and the same length before them, in the property's time zone."""
    current = {"startDate": f"{days}daysAgo", "endDate": "yesterday"}
    previous = {"startDate": f"{days * 2}daysAgo", "endDate": f"{days + 1}daysAgo"}
    return current, previous


def _metrics(*names):
    return [{"name": name} for name in names]


def _totals_request(period):
    return {"dateRanges": [period], "metrics": _metrics(*METRICS.values())}


def _top_request(period, dimension, metric):
    return {
        "dateRanges": [period],
        "dimensions": [{"name": dimension}],
        "metrics": _metrics(metric),
        "orderBys": [{"metric": {"metricName": metric}, "desc": True}],
        "limit": TOP_ROWS,
    }


def _rows(report):
    """Report rows as dicts keyed by the API's dimension and metric names."""
    dimensions = [header["name"] for header in report.get("dimensionHeaders", [])]
    metrics = [header["name"] for header in report.get("metricHeaders", [])]
    for row in report.get("rows", []):
        # Reports without dimensions come back with no dimensionValues key at all.
        values = {name: cell["value"] for name, cell in zip(dimensions, row.get("dimensionValues", []))}
        values.update({name: float(cell["value"]) for name, cell in zip(metrics, row["metricValues"])})
        yield values


def _totals(report):
    # Google leaves the row out entirely when a period has no data.
    row = next(_rows(report), {})
    return {key: row.get(name, 0) for key, name in METRICS.items()}


def _daily(report):
    rows = {datetime.strptime(row["date"], "%Y%m%d").date(): row for row in _rows(report)}
    if not rows:
        return []
    # Google skips days with no traffic; put them back so the chart's time axis stays even.
    first, last = min(rows), max(rows)
    days = (first + timedelta(days=offset) for offset in range((last - first).days + 1))
    return [
        {
            "date": day.isoformat(),
            **{key: rows.get(day, {}).get(METRICS[key], 0) for key in DAILY_METRICS},
        }
        for day in days
    ]


def _ranked(report):
    dimension = report["dimensionHeaders"][0]["name"]
    metric = report["metricHeaders"][0]["name"]
    return [{"label": row[dimension], "value": row[metric]} for row in _rows(report)]


def _is_partial(report):
    """True when Google hid or estimated part of this report."""
    metadata = report.get("metadata", {})
    return bool(metadata.get("subjectToThresholding") or metadata.get("samplingMetadatas"))


def _fetch_report(property_id, days):
    current, previous = _periods(days)
    reports = _batch(
        property_id,
        [
            _totals_request(current),
            _totals_request(previous),
            {
                "dateRanges": [current],
                "dimensions": [{"name": "date"}],
                "metrics": _metrics(*(METRICS[key] for key in DAILY_METRICS)),
                "orderBys": [{"dimension": {"dimensionName": "date"}}],
            },
            _top_request(current, "pagePath", "screenPageViews"),
            _top_request(current, "landingPage", "sessions"),
            _top_request(current, "sessionDefaultChannelGroup", "sessions"),
            _top_request(current, "country", "activeUsers"),
            _top_request(current, "deviceCategory", "activeUsers"),
            _top_request(current, "eventName", "eventCount"),
        ],
    )
    totals, previous_totals, daily, pages, landing_pages, channels, countries, devices, events = reports
    return {
        "days": days,
        "generated_at": timezone.now().isoformat(),
        "partial_data": any(_is_partial(report) for report in reports),
        "totals": _totals(totals),
        "previous": _totals(previous_totals),
        "daily": _daily(daily),
        "pages": _ranked(pages),
        "landing_pages": _ranked(landing_pages),
        "channels": _ranked(channels),
        "countries": _ranked(countries),
        "devices": _ranked(devices),
        "events": _ranked(events),
    }


def _fetch_totals(property_id, days):
    current, previous = _periods(days)
    totals, previous_totals = _batch(property_id, [_totals_request(current), _totals_request(previous)])
    return {"totals": _totals(totals), "previous": _totals(previous_totals)}


def _fetch_realtime(property_id):
    # Two calls: adding up the per-page rows would count a user once per page.
    total = _post(property_id, "runRealtimeReport", {"metrics": _metrics("activeUsers")})
    pages = _post(
        property_id,
        "runRealtimeReport",
        {
            "dimensions": [{"name": "unifiedScreenName"}],
            "metrics": _metrics("activeUsers"),
            "limit": 5,
        },
    )
    return {"active_users": next(_rows(total), {}).get("activeUsers", 0), "pages": _ranked(pages)}


def site_report(property_id, days):
    return cache.get_or_set(
        f"analytics:report:{property_id}:{days}",
        lambda: _fetch_report(property_id, days),
        REPORT_CACHE_SECONDS,
    )


def realtime(property_id):
    return cache.get_or_set(
        f"analytics:realtime:{property_id}",
        lambda: _fetch_realtime(property_id),
        REALTIME_CACHE_SECONDS,
    )


def overview(days):
    """Totals for every site. One site failing doesn't take the others down with it."""
    results = []
    for site in sites():
        try:
            data = cache.get_or_set(
                f"analytics:totals:{site['id']}:{days}",
                lambda: _fetch_totals(site["id"], days),
                REPORT_CACHE_SECONDS,
            )
            results.append({**site, **data, "error": None})
        except AnalyticsError as error:
            results.append({**site, "totals": None, "previous": None, "error": str(error.detail)})
    return results
