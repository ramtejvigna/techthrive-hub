from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="milestone",
            name="bucket_status",
            field=models.CharField(
                choices=[
                    ("todo", "To Do"),
                    ("in_progress", "In Progress"),
                    ("done", "Done"),
                ],
                default="todo",
                max_length=20,
            ),
        ),
    ]
