import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import maplibregl from "maplibre-gl";

const lightRasterTiles = {
  tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

const darkRasterTiles = {
  tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
};

const previewLegStyles = [
  { color: "#1266d6", label: "Current to pickup" },
  { color: "#f97316", label: "Pickup to dropoff" },
];

const waypointStyles = {
  current: { color: "#1266d6", label: "Current" },
  pickup: { color: "#16a34a", label: "Pickup" },
  dropoff: { color: "#ff5c3f", label: "Dropoff" },
};

const stopStyles = {
  pre_trip: { color: "#475569", label: "Pre-trip" },
  pickup: { color: "#16a34a", label: "Pickup work" },
  dropoff: { color: "#ff5c3f", label: "Dropoff work" },
  post_trip: { color: "#64748b", label: "Post-trip" },
  fuel: { color: "#14b8a6", label: "Fuel" },
  break: { color: "#f59e0b", label: "30-min break" },
  rest: { color: "#8b5cf6", label: "10-hour rest" },
  restart: { color: "#4338ca", label: "34-hour restart" },
  off_duty: { color: "#94a3b8", label: "Off duty" },
  on_duty: { color: "#475569", label: "On duty" },
  sleeper_berth: { color: "#8b5cf6", label: "Sleeper berth" },
};

const routeLegendItems = [
  waypointStyles.current,
  waypointStyles.pickup,
  waypointStyles.dropoff,
  stopStyles.fuel,
  stopStyles.break,
  stopStyles.rest,
  stopStyles.restart,
  stopStyles.on_duty,
];

const emptyFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function LocationPreviewMap({ stops, activeStopId, fetchRouteLeg, compact = false }) {
  const resolvedStops = useMemo(() => stops.filter((stop) => stop.point), [stops]);
  const routeStopsKey = resolvedStops
    .map((stop) => `${stop.id}:${stop.point.latitude},${stop.point.longitude}`)
    .join("|");
  const [routeLegs, setRouteLegs] = useState([]);
  const visibleRouteLegs = useMemo(
    () => (resolvedStops.length >= 2 ? routeLegs : []),
    [resolvedStops.length, routeLegs],
  );

  useEffect(() => {
    if (resolvedStops.length < 2 || !fetchRouteLeg) {
      return undefined;
    }

    const controller = new AbortController();
    const legPairs = [
      [resolvedStops[0], resolvedStops[1]],
      [resolvedStops[1], resolvedStops[2]],
    ].filter(([, destination]) => destination);

    Promise.all(
      legPairs.map(([origin, destination], index) =>
        fetchRouteLeg(origin, destination, { signal: controller.signal })
          .then((path) => ({
            id: `${origin.id}-${destination.id}`,
            path: path ?? [],
            ...previewLegStyles[index],
          }))
          .catch((error) => {
            if (error.name === "AbortError") {
              return null;
            }

            return {
              id: `${origin.id}-${destination.id}`,
              path: [],
              ...previewLegStyles[index],
            };
          }),
      ),
    ).then((legs) => {
      if (!controller.signal.aborted) {
        setRouteLegs(legs.filter((leg) => leg && leg.path.length));
      }
    });

    return () => {
      controller.abort();
    };
  }, [fetchRouteLeg, resolvedStops, routeStopsKey]);

  const lineFeatures = useMemo(
    () =>
      visibleRouteLegs.map((leg) => ({
        type: "Feature",
        properties: {
          color: leg.color,
          width: 6,
        },
        geometry: {
          type: "LineString",
          coordinates: leg.path.map(([latitude, longitude]) => [longitude, latitude]),
        },
      })),
    [visibleRouteLegs],
  );

  const pointFeatures = useMemo(
    () =>
      resolvedStops.map((stop) => {
        const isActive = stop.id === activeStopId;
        return {
          type: "Feature",
          properties: {
            color: stop.color,
            radius: isActive ? 10 : 8,
            label: stop.label,
            popupHtml: buildPopupHtml(stop.label, [stop.value]),
          },
          geometry: {
            type: "Point",
            coordinates: [stop.point.longitude, stop.point.latitude],
          },
        };
      }),
    [activeStopId, resolvedStops],
  );

  const fallbackFitCoordinates = useMemo(
    () => resolvedStops.map((stop) => [stop.point.longitude, stop.point.latitude]),
    [resolvedStops],
  );
  const lineFitCoordinates = useMemo(
    () => lineFeatures.flatMap((feature) => feature.geometry.coordinates),
    [lineFeatures],
  );

  return (
    <Paper
      elevation={0}
      sx={{
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        borderRadius: "24px",
        border: (theme) => theme.planner.panelBorder,
        position: "relative",
        bgcolor: (theme) => theme.planner.mapBackground,
      }}
    >
      <MapLibreCanvas
        compact={compact}
        fitCoordinates={lineFitCoordinates.length ? lineFitCoordinates : fallbackFitCoordinates}
        lineFeatures={lineFeatures}
        pointFeatures={pointFeatures}
        emptyLabel="Pick a suggestion to pin each stop before building the trip plan."
      />

      {!compact ? (
        <Paper
          elevation={0}
          sx={{
            position: "absolute",
            top: 18,
            left: 18,
            right: { xs: 18, sm: "auto" },
            width: { sm: 310 },
            p: 1.25,
            borderRadius: "22px",
            bgcolor: (theme) => theme.planner.mapOverlayBackground,
            border: (theme) => theme.planner.panelBorder,
            backdropFilter: "blur(14px)",
            zIndex: 3,
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            Location preview
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Pick a suggestion to pin each stop before building the trip plan.
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
            {stops.map((stop) => (
              <Chip
                key={stop.id}
                size="small"
                label={stop.point ? stop.label : `${stop.label} pending`}
                sx={{
                  bgcolor: stop.point ? stop.color : ((theme) => theme.planner.inactiveChipBackground),
                  color: stop.point ? "#fff" : "text.secondary",
                  fontWeight: 800,
                }}
              />
            ))}
          </Stack>
          {visibleRouteLegs.length ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {visibleRouteLegs.map((leg) => (
                <Chip
                  key={leg.id}
                  size="small"
                  label={leg.label}
                  sx={{ bgcolor: `${leg.color}1A`, color: leg.color, fontWeight: 800 }}
                />
              ))}
            </Stack>
          ) : null}
        </Paper>
      ) : null}
    </Paper>
  );
}

export function RouteMap({ geometry, waypoints, stops = [] }) {
  const coordinates = useMemo(() => geometry?.coordinates ?? [], [geometry?.coordinates]);
  const mappedStops = stops.filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude));

  const lineFeatures = useMemo(
    () =>
      coordinates.length
        ? [
            {
              type: "Feature",
              properties: {
                color: "#1266d6",
                width: 5,
              },
              geometry: {
                type: "LineString",
                coordinates,
              },
            },
          ]
        : [],
    [coordinates],
  );

  const pointFeatures = useMemo(
    () => [
      ...mappedStops.map((stop) => {
        const style = stopStyles[stop.kind] ?? stopStyles[stop.status] ?? stopStyles.on_duty;
        return {
          type: "Feature",
          properties: {
            color: style.color,
            radius: 7,
            label: style.label,
            popupHtml: buildPopupHtml(style.label, [
              stop.location,
              `${stop.duration_minutes} min - ${stop.reason}`,
            ]),
          },
          geometry: {
            type: "Point",
            coordinates: [stop.longitude, stop.latitude],
          },
        };
      }),
      ...waypoints.map((waypoint) => {
        const style = waypointStyles[waypoint.kind] ?? { color: "#ff5c3f", label: waypoint.kind };
        return {
          type: "Feature",
          properties: {
            color: style.color,
            radius: 9,
            label: style.label,
            popupHtml: buildPopupHtml(style.label, [waypoint.query, waypoint.formatted_address]),
          },
          geometry: {
            type: "Point",
            coordinates: [waypoint.longitude, waypoint.latitude],
          },
        };
      }),
    ],
    [mappedStops, waypoints],
  );

  if (coordinates.length === 0) {
    return (
      <Paper
        elevation={0}
        sx={{
          minHeight: 320,
          display: "grid",
          placeItems: "center",
          bgcolor: (theme) => theme.planner.mapEmptyBackground,
          border: (theme) => theme.planner.mapEmptyBorder,
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
        borderRadius: "28px",
        border: (theme) => theme.planner.panelBorder,
        position: "relative",
      }}
    >
      <MapLibreCanvas
        fitCoordinates={coordinates}
        lineFeatures={lineFeatures}
        pointFeatures={pointFeatures}
      />
      <Paper
        elevation={0}
        sx={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 12,
          zIndex: 3,
          p: 1,
          borderRadius: "16px",
          bgcolor: (theme) => theme.planner.mapOverlayBackground,
          border: (theme) => theme.planner.panelBorder,
          backdropFilter: "blur(14px)",
        }}
      >
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
          {routeLegendItems.map((item) => (
            <Chip
              key={item.label}
              size="small"
              label={item.label}
              sx={{
                height: 24,
                bgcolor: `${item.color}1F`,
                color: item.color,
                fontSize: "0.72rem",
                fontWeight: 800,
                "&::before": {
                  content: '""',
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: item.color,
                  ml: 0.9,
                  mr: -0.25,
                },
              }}
            />
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}

function MapLibreCanvas({ compact = false, emptyLabel = "", fitCoordinates, lineFeatures, pointFeatures }) {
  const theme = useTheme();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const mapStyle = useMemo(() => buildRasterMapStyle(theme.palette.mode), [theme.palette.mode]);
  const routeData = useMemo(
    () => ({
      ...emptyFeatureCollection,
      features: lineFeatures,
    }),
    [lineFeatures],
  );
  const pointData = useMemo(
    () => ({
      ...emptyFeatureCollection,
      features: pointFeatures,
    }),
    [pointFeatures],
  );

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    setIsMapReady(false);
    let isCancelled = false;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [-98.5795, 39.8283],
      zoom: 3.3,
      pitch: compact ? 0 : 18,
      bearing: 0,
      attributionControl: false,
      cooperativeGestures: true,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;

    map.on("load", () => {
      if (isCancelled) {
        return;
      }

      addTripLayers(map);
      setIsMapReady(true);
    });

    return () => {
      isCancelled = true;
      mapRef.current = null;
      map.remove();
    };
  }, [compact, mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) {
      return;
    }

    setSourceData(map, "trip-routes", routeData);
    setSourceData(map, "trip-points", pointData);
  }, [isMapReady, pointData, routeData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || fitCoordinates.length === 0) {
      return;
    }

    fitMapToCoordinates(map, fitCoordinates, compact);
  }, [compact, fitCoordinates, isMapReady]);

  return (
    <>
      <Box ref={containerRef} sx={{ height: "100%", minHeight: 0, width: "100%" }} />
      {fitCoordinates.length === 0 && emptyLabel ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            p: 3,
            textAlign: "center",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          {emptyLabel}
        </Typography>
      ) : null}
    </>
  );
}

function buildRasterMapStyle(mode) {
  const rasterTiles = mode === "dark" ? darkRasterTiles : lightRasterTiles;

  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      basemap: {
        type: "raster",
        tiles: rasterTiles.tiles,
        tileSize: 256,
        attribution: rasterTiles.attribution,
      },
    },
    layers: [
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
      },
    ],
  };
}

function addTripLayers(map) {
  if (!map.getSource("trip-routes")) {
    map.addSource("trip-routes", {
      type: "geojson",
      data: emptyFeatureCollection,
    });
  }

  if (!map.getSource("trip-points")) {
    map.addSource("trip-points", {
      type: "geojson",
      data: emptyFeatureCollection,
    });
  }

  map.addLayer({
    id: "trip-route-shadow",
    type: "line",
    source: "trip-routes",
    paint: {
      "line-color": "rgba(15,23,42,0.28)",
      "line-width": 10,
      "line-blur": 2,
      "line-opacity": 0.55,
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
  });

  map.addLayer({
    id: "trip-route-line",
    type: "line",
    source: "trip-routes",
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["coalesce", ["get", "width"], 5],
      "line-opacity": 0.94,
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
  });

  map.addLayer({
    id: "trip-point-halo",
    type: "circle",
    source: "trip-points",
    paint: {
      "circle-color": "#ffffff",
      "circle-radius": ["+", ["coalesce", ["get", "radius"], 7], 3],
      "circle-opacity": 0.96,
      "circle-stroke-color": "rgba(15,23,42,0.22)",
      "circle-stroke-width": 1,
    },
  });

  map.addLayer({
    id: "trip-point-circle",
    type: "circle",
    source: "trip-points",
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": ["coalesce", ["get", "radius"], 7],
      "circle-opacity": 0.98,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });

  map.addLayer({
    id: "trip-point-label",
    type: "symbol",
    source: "trip-points",
    paint: {
      "text-color": "#0f172a",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-offset": [0, 1.4],
      "text-anchor": "top",
      "text-optional": true,
    },
  });

  map.on("click", "trip-point-circle", (event) => {
    const feature = event.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    const html = feature?.properties?.popupHtml;
    if (!coordinates || !html) {
      return;
    }

    new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
      .setLngLat(coordinates)
      .setHTML(html)
      .addTo(map);
  });

  map.on("mouseenter", "trip-point-circle", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "trip-point-circle", () => {
    map.getCanvas().style.cursor = "";
  });
}

function setSourceData(map, sourceId, data) {
  const source = map.getSource(sourceId);
  if (source?.setData) {
    source.setData(data);
  }
}

function fitMapToCoordinates(map, coordinates, compact) {
  if (coordinates.length === 1) {
    map.easeTo({ center: coordinates[0], zoom: 10, duration: 450 });
    return;
  }

  const bounds = coordinates.reduce(
    (nextBounds, coordinate) => nextBounds.extend(coordinate),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
  );
  map.fitBounds(bounds, {
    padding: compact ? 54 : 72,
    maxZoom: 10,
    duration: 600,
  });
}

function buildPopupHtml(title, lines) {
  const body = lines.filter(Boolean).map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  return `<strong>${escapeHtml(title)}</strong>${body ? `<div class="trip-map-popup-body">${body}</div>` : ""}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
