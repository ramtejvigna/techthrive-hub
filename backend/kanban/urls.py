from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CardCreateView,
    CardDetailView,
    ColumnDetailView,
    ColumnListCreateView,
    BoardViewSet,
)

router = DefaultRouter()
router.register("", BoardViewSet, basename="board")

urlpatterns = [
    path("cards/", CardCreateView.as_view(), name="card-create"),
    path("cards/<uuid:pk>/", CardDetailView.as_view(), name="card-detail"),
    path(
        "<uuid:board_id>/columns/",
        ColumnListCreateView.as_view(),
        name="board-columns",
    ),
    path(
        "<uuid:board_id>/columns/<uuid:column_id>/",
        ColumnDetailView.as_view(),
        name="board-column-detail",
    ),
    *router.urls,
]
