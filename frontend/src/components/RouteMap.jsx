import { Box, Paper, Typography } from "@mui/material";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";

import { mapboxAccessToken, mapboxTileUrl } from "../api";

export function RouteMap({ geometry, waypoints }) {
  const coordinates = geometry?.coordinates ?? [];
  const path = coordinates.map(([longitude, latitude]) => [latitude, longitude]);
  const center = path[0] ?? [39.8283, -98.5795];

  if (path.length === 0) {
    return (
      <Paper
        elevation={0}
        sx={{
          minHeight: 320,
          display: "grid",
          placeItems: "center",
          bgcolor: "#f8f3e8",
          border: "1px dashed rgba(24,38,31,0.16)",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Route geometry is not available for this trip yet.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box
      sx={{
        height: 360,
        overflow: "hidden",
        borderRadius: 2,
        border: "1px solid rgba(24,38,31,0.12)",
      }}
    >
      <MapContainer
        center={center}
        zoom={6}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution={
            mapboxAccessToken
              ? '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
          url={mapboxTileUrl || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
        />
        <Polyline positions={path} pathOptions={{ color: "#165d4a", weight: 5, opacity: 0.85 }} />
        {waypoints.map((waypoint) => (
          <CircleMarker
            key={`${waypoint.kind}-${waypoint.latitude}-${waypoint.longitude}`}
            center={[waypoint.latitude, waypoint.longitude]}
            radius={8}
            pathOptions={{ color: "#b25c2f", fillColor: "#f7a65a", fillOpacity: 0.95, weight: 2 }}
          >
            <Popup>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {waypoint.kind}
              </Typography>
              <Typography variant="body2">{waypoint.query}</Typography>
              <Typography variant="body2" color="text.secondary">
                {waypoint.formatted_address}
              </Typography>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </Box>
  );
}
