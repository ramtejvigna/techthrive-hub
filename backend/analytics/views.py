from django.http import Http404
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import ga

RANGES = {"7d": 7, "28d": 28, "90d": 90}
DEFAULT_RANGE = "28d"


def requested_days(request):
    value = request.query_params.get("range", DEFAULT_RANGE)
    if value not in RANGES:
        raise ValidationError({"range": f"Choose one of: {', '.join(RANGES)}."})
    return RANGES[value]


def require_site(site_id):
    if not any(site["id"] == site_id for site in ga.sites()):
        raise Http404
    return site_id


class SitesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"sites": ga.sites()})


class OverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"sites": ga.overview(requested_days(request))})


class ReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, site_id):
        return Response(ga.site_report(require_site(site_id), requested_days(request)))


class RealtimeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, site_id):
        return Response(ga.realtime(require_site(site_id)))
