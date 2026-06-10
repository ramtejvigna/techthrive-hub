from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("kanban", "0003_card_due_date_card_priority"),
    ]

    operations = [
        migrations.AddField(
            model_name="column",
            name="color",
            field=models.CharField(default="#64748b", max_length=7),
        ),
    ]
