import uuid

from django.contrib.auth import get_user_model
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import EmailTokenObtainPairSerializer, RegisterSerializer, UserSerializer

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class LoginView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


USER_SEARCH_MIN_LENGTH = 2
USER_SEARCH_LIMIT = 8


class UserSearchView(generics.ListAPIView):
    """Find accounts by email, e.g. to add someone to a project.

    `?q=` must be at least two characters so the full user list can't be
    paged out one letter at a time. `?project=<id>` leaves out people already
    on that project.
    """

    serializer_class = UserSerializer
    pagination_class = None

    def get_queryset(self):
        from projects.access import accessible_projects

        query = self.request.query_params.get("q", "").strip()
        if len(query) < USER_SEARCH_MIN_LENGTH:
            return User.objects.none()
        users = User.objects.filter(is_active=True, email__icontains=query).exclude(
            pk=self.request.user.pk
        )
        project_id = self.request.query_params.get("project")
        try:
            project_id = uuid.UUID(project_id) if project_id else None
        except ValueError:
            project_id = None
        if project_id:
            project = accessible_projects(self.request.user).filter(pk=project_id).first()
            if project is not None:
                users = users.exclude(pk=project.user_id).exclude(
                    pk__in=project.members.values("pk")
                )
        # Prefix matches first, then alphabetical.
        return sorted(
            users.order_by("email")[: USER_SEARCH_LIMIT * 4],
            key=lambda user: (not user.email.lower().startswith(query.lower()), user.email),
        )[:USER_SEARCH_LIMIT]


class LogoutView(APIView):
    def post(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)
