import { inputSteps, locationStepIds, recentStorageKey } from "../constants/tripPlanner";

export function createInitialForm() {
  return {
    current_location: "",
    pickup_location: "",
    dropoff_location: "",
    departure_at: formatDateTimeLocal(new Date()),
    current_cycle_used_hours: "12.50",
  };
}

export const initialSelectedPlaces = {
  current_location: null,
  pickup_location: null,
  dropoff_location: null,
};

export function findFirstInvalidStep(values) {
  for (let index = 0; index < inputSteps.length; index += 1) {
    const step = inputSteps[index];
    const message = validateStep(step, values[step.id]);
    if (message) {
      return { index, message };
    }
  }

  return null;
}

export function findFirstMissingPinnedStop(selectedPlaces) {
  for (const fieldId of locationStepIds) {
    if (!selectedPlaces[fieldId]) {
      const index = inputSteps.findIndex((step) => step.id === fieldId);
      return {
        index,
        label: inputSteps[index].label,
      };
    }
  }

  return null;
}

export function validateStep(step, value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return `${step.title} Complete this before building the trip plan.`;
  }

  if (step.id === "departure_at" && Number.isNaN(new Date(value).getTime())) {
    return "Pick a valid start time.";
  }

  if (step.id === "current_cycle_used_hours") {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return "Enter cycle hours as a number.";
    }

    if (numericValue < 0 || numericValue > 70) {
      return "Cycle hours must be between 0 and 70.";
    }
  }

  return "";
}

export function persistRecentLocations(values, currentLocations, setRecentLocations) {
  const nextLocations = [
    values.current_location,
    values.pickup_location,
    values.dropoff_location,
    ...currentLocations,
  ]
    .map((location) => String(location || "").trim())
    .filter(Boolean)
    .filter((location, index, list) => list.findIndex((item) => item.toLowerCase() === location.toLowerCase()) === index)
    .slice(0, 8);

  setRecentLocations(nextLocations);

  try {
    window.localStorage.setItem(recentStorageKey, JSON.stringify(nextLocations));
  } catch {
    // Recent stops are a convenience only; planning should still work without storage.
  }
}

export function readRecentLocations() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(recentStorageKey);
    if (!stored) {
      return [];
    }

    const parsedLocations = JSON.parse(stored);
    return Array.isArray(parsedLocations) ? parsedLocations : [];
  } catch {
    return [];
  }
}

export function buildLocationPreviewStops(formValues, selectedPlaces) {
  return [
    {
      id: "current_location",
      label: "Current",
      value: formValues.current_location,
      point: selectedPlaces.current_location,
      color: "#1266d6",
    },
    {
      id: "pickup_location",
      label: "Pickup",
      value: formValues.pickup_location,
      point: selectedPlaces.pickup_location,
      color: "#16a34a",
    },
    {
      id: "dropoff_location",
      label: "Dropoff",
      value: formValues.dropoff_location,
      point: selectedPlaces.dropoff_location,
      color: "#ff5c3f",
    },
  ];
}

export function formatStepPreview(step, value) {
  if (step.id === "departure_at") {
    return formatUsDateTime(value) || "Not set";
  }

  if (step.id === "current_cycle_used_hours") {
    return value ? `${formatUsHours(value)} used` : "Not set";
  }

  return value || "Not set";
}

export function formatDateTimeLocal(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function formatUsDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatUsHours(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return `${value} hr`;
  }

  return `${numericValue.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: numericValue % 1 === 0 ? 0 : 1,
  })} hr`;
}

export function formatUsMiles(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return `${value} mi`;
  }

  return `${numericValue.toLocaleString("en-US", {
    maximumFractionDigits: 1,
  })} mi`;
}

export function formatUsDuration(minutes) {
  const numericMinutes = Number(minutes);
  if (!Number.isFinite(numericMinutes)) {
    return `${minutes} min`;
  }

  const roundedMinutes = Math.round(numericMinutes);
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} min`;
  }

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

export function buildLocationCoordinatePayload(selectedPlaces) {
  const payload = {};
  for (const [fieldName, point] of Object.entries(selectedPlaces)) {
    if (!point) {
      continue;
    }

    payload[`${fieldName}_latitude`] = normalizeCoordinate(point.latitude);
    payload[`${fieldName}_longitude`] = normalizeCoordinate(point.longitude);
  }
  return payload;
}

export function normalizeCoordinate(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return Number(numericValue.toFixed(6));
}
