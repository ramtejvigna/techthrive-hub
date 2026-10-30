from rest_framework.routers import DefaultRouter

from .views import CanvasViewSet

router = DefaultRouter()
router.register("", CanvasViewSet, basename="canvas")

urlpatterns = router.urls
