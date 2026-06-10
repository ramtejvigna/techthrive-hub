from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0002_milestone_bucket_status"),
        ("kanban", "0004_column_color"),
    ]

    operations = [
        migrations.AddField(
            model_name="card",
            name="milestone",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="card",
                to="projects.milestone",
            ),
        ),
    ]
