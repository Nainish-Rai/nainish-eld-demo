const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

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
