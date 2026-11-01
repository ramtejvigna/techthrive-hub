from django.urls import path

from .views import OverviewView, RealtimeView, ReportView, SitesView

urlpatterns = [
    path("sites/", SitesView.as_view(), name="analytics-sites"),
    path("overview/", OverviewView.as_view(), name="analytics-overview"),
    path("sites/<str:site_id>/report/", ReportView.as_view(), name="analytics-report"),
    path("sites/<str:site_id>/realtime/", RealtimeView.as_view(), name="analytics-realtime"),
]
