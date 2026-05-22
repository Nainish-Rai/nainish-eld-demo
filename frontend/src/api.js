export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
export const geoapifyApiKey = import.meta.env.VITE_GEOAPIFY_API_KEY || "";

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

  return data;
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

export function getTripPdfUrl(tripId) {
  return `${apiBaseUrl}/trips/${tripId}/pdf/`;
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
