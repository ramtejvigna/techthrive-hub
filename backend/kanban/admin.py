from django.contrib import admin

from .models import Board, Card, Column


class ColumnInline(admin.TabularInline):
    model = Column
    extra = 0


@admin.register(Board)
class BoardAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "updated_at")
    search_fields = ("title",)
    inlines = [ColumnInline]


@admin.register(Column)
class ColumnAdmin(admin.ModelAdmin):
    list_display = ("name", "board", "position")


@admin.register(Card)
class CardAdmin(admin.ModelAdmin):
    list_display = ("title", "column", "position", "updated_at")
    search_fields = ("title",)
