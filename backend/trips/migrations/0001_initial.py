from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="TripRequest",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("current_location", models.CharField(max_length=255)),
                ("pickup_location", models.CharField(max_length=255)),
                ("dropoff_location", models.CharField(max_length=255)),
                ("departure_at", models.DateTimeField()),
                ("current_cycle_used_hours", models.DecimalField(decimal_places=2, max_digits=5)),
                ("status", models.CharField(default="planned", max_length=32)),
                ("plan_data", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
