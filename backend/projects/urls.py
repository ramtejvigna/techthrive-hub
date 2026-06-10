from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import MilestoneDetailView, MilestoneListCreateView, ProjectViewSet

router = DefaultRouter()
router.register("", ProjectViewSet, basename="project")

urlpatterns = [
    path(
        "<uuid:project_id>/milestones/",
        MilestoneListCreateView.as_view(),
        name="project-milestones",
    ),
    path(
        "<uuid:project_id>/milestones/<uuid:milestone_id>/",
        MilestoneDetailView.as_view(),
        name="project-milestone-detail",
    ),
    *router.urls,
]
