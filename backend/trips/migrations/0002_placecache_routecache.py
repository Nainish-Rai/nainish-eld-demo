from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("trips", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlaceCache",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("normalized_query", models.CharField(max_length=255, unique=True)),
                ("query", models.CharField(max_length=255)),
                ("formatted_address", models.CharField(max_length=255)),
                ("latitude", models.DecimalField(decimal_places=6, max_digits=9)),
                ("longitude", models.DecimalField(decimal_places=6, max_digits=9)),
                ("provider", models.CharField(default="nominatim", max_length=64)),
                ("raw_data", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["query"]},
        ),
        migrations.CreateModel(
            name="RouteCache",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("cache_key", models.CharField(max_length=255, unique=True)),
                ("provider", models.CharField(default="osrm", max_length=64)),
                ("distance_miles", models.DecimalField(decimal_places=2, max_digits=8)),
                ("duration_minutes", models.PositiveIntegerField()),
                ("geometry", models.JSONField(default=dict)),
                ("raw_data", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "destination",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="destination_routes",
                        to="trips.placecache",
                    ),
                ),
                (
                    "origin",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="origin_routes",
                        to="trips.placecache",
                    ),
                ),
            ],
            options={"ordering": ["cache_key"]},
        ),
    ]
