import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import TimerRoundedIcon from "@mui/icons-material/TimerRounded";

export const inputSteps = [
  {
    id: "current_location",
    label: "Current",
    title: "Where are you now?",
    helper: "City, truck stop, yard, or full street address.",
    placeholder: "Example: Chicago, IL",
    icon: MyLocationRoundedIcon,
    fieldType: "text",
  },
  {
    id: "pickup_location",
    label: "Pickup",
    title: "Where is pickup?",
    helper: "Use the location the dispatcher gave you.",
    placeholder: "Example: Indianapolis, IN",
    icon: Inventory2RoundedIcon,
    fieldType: "text",
  },
  {
    id: "dropoff_location",
    label: "Dropoff",
    title: "Where is delivery?",
    helper: "City is enough for planning. Full address is better.",
    placeholder: "Example: Atlanta, GA",
    icon: FlagRoundedIcon,
    fieldType: "text",
  },
  {
    id: "departure_at",
    label: "Start",
    title: "When do you start?",
    helper: "Use local time from where you are starting.",
    icon: AccessTimeRoundedIcon,
    fieldType: "datetime-local",
  },
  {
    id: "current_cycle_used_hours",
    label: "Clock",
    title: "Hours already used?",
    helper: "Your used hours on the current 70-hour cycle.",
    placeholder: "Example: 12.5",
    icon: TimerRoundedIcon,
    fieldType: "number",
  },
];

export const cycleHourPresets = ["0", "4", "8", "12.5", "20", "34"];
export const locationStepIds = ["current_location", "pickup_location", "dropoff_location"];
export const recentStorageKey = "spotter_recent_trip_inputs";

export const largeFieldStyles = {
  "& .MuiInputBase-root": {
    minHeight: 48,
    fontSize: "0.95rem",
  },
  "& .MuiInputLabel-root": {
    fontSize: "0.92rem",
  },
  "& .MuiFormHelperText-root": {
    lineHeight: 1.25,
    marginTop: 0.5,
  },
};

export const chipButtonStyles = {
  minHeight: 34,
  borderRadius: 999,
  fontWeight: 700,
  "& .MuiChip-label": {
    px: 1.1,
  },
};

export const scrollbarStyles = {
  scrollbarWidth: "thin",
  "&::-webkit-scrollbar": {
    width: 8,
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "rgba(15,23,42,0.18)",
    borderRadius: 999,
  },
  "&::-webkit-scrollbar-track": {
    backgroundColor: "transparent",
  },
};
