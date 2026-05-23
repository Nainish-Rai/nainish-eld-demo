export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
export const geoapifyApiKey = import.meta.env.VITE_GEOAPIFY_API_KEY || "";
export const osrmBaseUrl = import.meta.env.VITE_OSRM_BASE_URL || "https://router.project-osrm.org";

export async function createTripPlan(payload) {
  let response;
  try {
    response = await fetch(`${apiBaseUrl}/trips/plan/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Trip planner could not reach the backend. Check that the Django API is running on http://localhost:8000.");
  }

  const data = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(data, response.status));
  }

  return validateTripPlanResponse(data);
}

export async function searchLocationSuggestions(query, { signal, bias } = {}) {
  if (!geoapifyApiKey) {
    return [];
  }

  const cleanedQuery = query.trim();
  if (cleanedQuery.length < 3) {
    return [];
  }

  const params = new URLSearchParams({
    apiKey: geoapifyApiKey,
    format: "json",
    limit: "5",
    text: cleanedQuery,
  });
  if (bias) {
    params.set("bias", bias);
  }

  const response = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error("Unable to load location suggestions.");
  }

  const results = await response.json();
  const features = results?.results;
  if (!Array.isArray(features)) {
    return [];
  }

  return features.map((feature) => ({
    id: feature.place_id || feature.result_type || feature.formatted || cleanedQuery,
    label: feature.formatted || cleanedQuery,
    shortLabel: formatLocationSuggestion(feature),
    latitude: feature.lat ?? null,
    longitude: feature.lon ?? null,
  }));
}

export async function fetchPreviewRouteLeg(origin, destination, { signal } = {}) {
  if (!origin?.point || !destination?.point) {
    return null;
  }

  const originCoordinate = `${origin.point.longitude},${origin.point.latitude}`;
  const destinationCoordinate = `${destination.point.longitude},${destination.point.latitude}`;
  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "false",
  });

  const response = await fetch(
    `${osrmBaseUrl}/route/v1/driving/${originCoordinate};${destinationCoordinate}?${params.toString()}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error("Unable to load route preview.");
  }

  const payload = await response.json();
  const coordinates = payload?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) {
    return null;
  }

  return coordinates.map(([longitude, latitude]) => [latitude, longitude]);
}

function extractErrorMessage(data, status) {
  if (!data || typeof data !== "object") {
    if (status === 502) {
      return "Trip planner backend is up, but route lookup failed. Check the backend GEOAPIFY_API_KEY and network access.";
    }

    return "Unable to create the trip plan.";
  }

  const firstValue = Object.values(data)[0];
  if (Array.isArray(firstValue) && firstValue.length > 0) {
    return String(firstValue[0]);
  }

  if (typeof data.detail === "string") {
    return data.detail;
  }

  return "Unable to create the trip plan.";
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function formatLocationSuggestion(item) {
  const name = item.address_line1 || item.name || "";
  const placeFormatted = item.address_line2 || item.formatted || "";

  return [name, placeFormatted].filter(Boolean).join(", ") || item.formatted || "";
}

function validateTripPlanResponse(data) {
  expectString(data?.mode, "mode");
  expectString(data?.status, "status");
  expectString(data?.generated_at, "generated_at");
  const plan = expectObject(data?.plan, "plan");

  const route = expectObject(plan.route, "plan.route");
  const geometry = expectObject(route.geometry, "plan.route.geometry");
  const complianceSummary = expectObject(plan.compliance_summary, "plan.compliance_summary");

  expectString(route.provider, "plan.route.provider");
  expectArray(route.legs, "plan.route.legs");
  expectArray(route.waypoints, "plan.route.waypoints");
  expectArray(geometry.coordinates, "plan.route.geometry.coordinates").forEach((coordinate, index) => {
    if (!Array.isArray(coordinate) || coordinate.length !== 2 || coordinate.some((value) => typeof value !== "number")) {
      throw new Error(`Trip planner returned an invalid response: plan.route.geometry.coordinates[${index}] must be a [longitude, latitude] pair.`);
    }
  });

  expectArray(plan.stops, "plan.stops");
  expectArray(plan.duty_events, "plan.duty_events");
  const dailyLogs = expectArray(plan.daily_logs, "plan.daily_logs");
  dailyLogs.forEach((dailyLog, index) => {
    const logPath = `plan.daily_logs[${index}]`;
    const totals = expectObject(dailyLog?.totals_minutes, `${logPath}.totals_minutes`);
    expectArray(dailyLog?.events, `${logPath}.events`);
    expectString(dailyLog?.date, `${logPath}.date`);
    expectNumber(totals.off_duty, `${logPath}.totals_minutes.off_duty`);
    expectNumber(totals.sleeper_berth, `${logPath}.totals_minutes.sleeper_berth`);
    expectNumber(totals.driving, `${logPath}.totals_minutes.driving`);
    expectNumber(totals.on_duty, `${logPath}.totals_minutes.on_duty`);
  });

  expectString(complianceSummary.remaining_cycle_hours, "plan.compliance_summary.remaining_cycle_hours");
  expectBoolean(complianceSummary.can_complete_today, "plan.compliance_summary.can_complete_today");

  return {
    ...data,
    plan,
  };
}

function expectObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Trip planner returned an invalid response: ${path} is missing or malformed.`);
  }

  return value;
}

function expectArray(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`Trip planner returned an invalid response: ${path} must be an array.`);
  }

  return value;
}

function expectString(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Trip planner returned an invalid response: ${path} must be a non-empty string.`);
  }

  return value;
}

function expectNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Trip planner returned an invalid response: ${path} must be a number.`);
  }

  return value;
}

function expectBoolean(value, path) {
  if (typeof value !== "boolean") {
    throw new Error(`Trip planner returned an invalid response: ${path} must be a boolean.`);
  }

  return value;
}
