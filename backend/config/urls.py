from django.contrib import admin
from django.urls import include, path

from .views import health

urlpatterns = [
    path("api/health/", health, name="health"),
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/projects/", include("projects.urls")),
    path("api/boards/", include("kanban.urls")),
    path("api/dashboard/", include("dashboard.urls")),
    path("api/docs/", include("docs.urls")),
    path("api/notifications/", include("notifications.urls")),
]
