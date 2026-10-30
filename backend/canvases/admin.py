from django.contrib import admin

from .models import Canvas


@admin.register(Canvas)
class CanvasAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "project", "updated_at")
    search_fields = ("title", "user__email")
    exclude = ("scene", "thumbnail")
