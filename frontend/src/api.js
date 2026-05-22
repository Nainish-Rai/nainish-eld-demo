export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
export const mapboxAccessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || "";
export const mapboxTileUrl = mapboxAccessToken
  ? `https://api.mapbox.com/styles/v1/mapbox/navigation-day-v1/tiles/256/{z}/{x}/{y}?access_token=${mapboxAccessToken}`
  : "";

export async function createTripPlan(payload) {
  const response = await fetch(`${apiBaseUrl}/trips/plan/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(extractErrorMessage(data));
  }

  return data;
}

export async function searchLocationSuggestions(query, { signal } = {}) {
  if (!mapboxAccessToken) {
    return [];
  }

  const cleanedQuery = query.trim();
  if (cleanedQuery.length < 3) {
    return [];
  }

  const params = new URLSearchParams({
    access_token: mapboxAccessToken,
    autocomplete: "true",
    country: "US",
    limit: "5",
    q: cleanedQuery,
    types: "address,street,place,locality,district,postcode,region",
  });

  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error("Unable to load location suggestions.");
  }

  const results = await response.json();
  const features = results?.features;
  if (!Array.isArray(features)) {
    return [];
  }

  return features.map((feature) => ({
    id: feature.properties?.mapbox_id || feature.id,
    label: feature.properties?.full_address || feature.properties?.name || cleanedQuery,
    shortLabel: formatLocationSuggestion(feature),
    latitude: feature.geometry?.coordinates?.[1] ?? null,
    longitude: feature.geometry?.coordinates?.[0] ?? null,
  }));
}

export function getTripPdfUrl(tripId) {
  return `${apiBaseUrl}/trips/${tripId}/pdf/`;
}

function extractErrorMessage(data) {
  if (!data || typeof data !== "object") {
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

function formatLocationSuggestion(item) {
  const properties = item.properties || {};
  const name = properties.name_preferred || properties.name || properties.full_address || "";
  const placeFormatted = properties.place_formatted || "";

  return [name, placeFormatted].filter(Boolean).join(", ") || properties.full_address || "";
}
