import { useDeferredValue, useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  CssBaseline,
  Divider,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  Typography,
} from "@mui/material";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import TimerRoundedIcon from "@mui/icons-material/TimerRounded";

import { createTripPlan, geoapifyApiKey, searchLocationSuggestions } from "./api";
import { RouteMap } from "./components/RouteMap";
import { PdfLogPreview } from "./components/PdfLogPreview";
import { generateTripLogPdf } from "./eldPdf";
import { plannerTheme } from "./theme";

const initialForm = {
  current_location: "",
  pickup_location: "",
  dropoff_location: "",
  departure_at: formatDateTimeLocal(new Date()),
  current_cycle_used_hours: "12.50",
};

const initialSelectedPlaces = {
  current_location: null,
  pickup_location: null,
  dropoff_location: null,
};

const inputSteps = [
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

const cycleHourPresets = ["0", "4", "8", "12.5", "20", "34"];
const requiredFields = inputSteps.map((step) => step.id);
const recentStorageKey = "spotter_recent_trip_inputs";

function App() {
  const [formValues, setFormValues] = useState(initialForm);
  const [selectedPlaces, setSelectedPlaces] = useState(initialSelectedPlaces);
  const [activeInputStep, setActiveInputStep] = useState(0);
  const [recentLocations, setRecentLocations] = useState(readRecentLocations);
  const [activeTab, setActiveTab] = useState("schedule");
  const [planResult, setPlanResult] = useState(null);
  const [logPdfBytes, setLogPdfBytes] = useState(null);
  const [logPdfUrl, setLogPdfUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!planResult) {
      return undefined;
    }

    let isCancelled = false;
    let objectUrl = "";

    async function buildLogPdf() {
      const bytes = await generateTripLogPdf(planResult);
      if (isCancelled) {
        return;
      }

      objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setLogPdfBytes(bytes);
      setLogPdfUrl(objectUrl);
    }

    buildLogPdf().catch((error) => {
      if (!isCancelled) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to generate PDF logs.");
      }
    });

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [planResult]);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");

    const invalidStep = findFirstInvalidStep(formValues);
    if (invalidStep) {
      setActiveInputStep(invalidStep.index);
      setErrorMessage(invalidStep.message);
      return;
    }

    setIsSubmitting(true);

    try {
      setLogPdfBytes(null);
      setLogPdfUrl("");
      const payload = {
        current_location: formValues.current_location,
        pickup_location: formValues.pickup_location,
        dropoff_location: formValues.dropoff_location,
        departure_at: new Date(formValues.departure_at).toISOString(),
        current_cycle_used_hours: formValues.current_cycle_used_hours,
        ...buildLocationCoordinatePayload(selectedPlaces),
      };
      const result = await createTripPlan(payload);
      setPlanResult(result);
      persistRecentLocations(formValues, recentLocations, setRecentLocations);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setFormValues((current) => ({ ...current, [name]: value }));
  }

  function updateField(name, value) {
    setFormValues((current) => ({ ...current, [name]: value }));
  }

  function handleResolvedLocation(fieldName, payload) {
    updateField(fieldName, payload.text);
    setSelectedPlaces((current) => ({
      ...current,
      [fieldName]: payload.point,
    }));
  }

  function goToNextStep() {
    const currentStep = inputSteps[activeInputStep];
    const error = validateStep(currentStep, formValues[currentStep.id]);

    if (error) {
      setErrorMessage(error);
      return;
    }

    setErrorMessage("");
    setActiveInputStep((current) => Math.min(current + 1, inputSteps.length - 1));
  }

  function goToPreviousStep() {
    setErrorMessage("");
    setActiveInputStep((current) => Math.max(current - 1, 0));
  }

  function applyDeparturePreset(preset) {
    const now = new Date();
    if (preset === "now") {
      updateField("departure_at", formatDateTimeLocal(now));
      return;
    }

    const tomorrowMorning = new Date(now);
    tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
    tomorrowMorning.setHours(8, 0, 0, 0);
    updateField("departure_at", formatDateTimeLocal(tomorrowMorning));
  }

  const completedStepCount = requiredFields.filter((field) => String(formValues[field]).trim()).length;
  const isFinalInputStep = activeInputStep === inputSteps.length - 1;
  const hasPlan = Boolean(planResult);

  return (
    <ThemeProvider theme={plannerTheme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          background:
            "linear-gradient(180deg, #f3efe6 0%, #e6dfcf 48%, #d9d6c4 100%)",
        }}
      >
        <Box
          sx={{
            maxWidth: 1440,
            margin: "0 auto",
            px: { xs: 2, md: 4 },
            py: { xs: 3, md: 5 },
          }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            spacing={2}
            sx={{ mb: 4 }}
          >
            <Box>
              <Typography variant="overline" sx={{ letterSpacing: 1.8 }}>
                Driver trip planner
              </Typography>
              <Typography variant="h3" sx={{ mt: 1, maxWidth: 720 }}>
                Get a legal trip plan without fighting a dispatch form.
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5, maxWidth: 640 }}>
                Answer one thing at a time. Spotter turns it into a route, HOS timeline, and driver log.
              </Typography>
            </Box>
            <Paper
              elevation={0}
              sx={{
                minWidth: { md: 260 },
                p: 2,
                bgcolor: "rgba(255,255,255,0.72)",
                border: "1px solid rgba(24,38,31,0.08)",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Driver mode
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.5 }}>
                {completedStepCount} of {inputSteps.length} inputs ready
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Short steps, large tap targets, recent stops, and quick presets for common answers.
              </Typography>
            </Paper>
          </Stack>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, lg: hasPlan ? 4 : 8 }}>
              <Paper
                component="form"
                onSubmit={handleSubmit}
                elevation={0}
                sx={{
                  p: { xs: 2, sm: 3 },
                  height: "100%",
                  bgcolor: "background.paper",
                  border: "1px solid rgba(24,38,31,0.08)",
                }}
              >
                <Stack spacing={2.5}>
                  <DriverInputFlow
                    activeStep={activeInputStep}
                    formValues={formValues}
                    selectedPlaces={selectedPlaces}
                    recentLocations={recentLocations}
                    onFieldChange={handleFieldChange}
                    onSetField={updateField}
                    onResolvedLocation={handleResolvedLocation}
                    onStepChange={(stepIndex) => {
                      setErrorMessage("");
                      setActiveInputStep(stepIndex);
                    }}
                    onBack={goToPreviousStep}
                    onDeparturePreset={applyDeparturePreset}
                  />

                  {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

                  {isFinalInputStep ? (
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      startIcon={
                        isSubmitting ? <CircularProgress color="inherit" size={18} /> : <PlayArrowRoundedIcon />
                      }
                      disabled={isSubmitting}
                      sx={{ minHeight: 58, fontSize: "1rem" }}
                    >
                      {isSubmitting ? "Building trip plan..." : "Build my trip plan"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="contained"
                      size="large"
                      endIcon={<ArrowForwardRoundedIcon />}
                      onClick={goToNextStep}
                      sx={{ minHeight: 58, fontSize: "1rem" }}
                    >
                      Next
                    </Button>
                  )}
                </Stack>
              </Paper>
            </Grid>

            {!hasPlan ? (
              <Grid size={{ xs: 12, lg: 4 }}>
                <InputOnboardingPanel completedStepCount={completedStepCount} />
              </Grid>
            ) : null}

            {hasPlan ? (
              <Grid size={{ xs: 12, lg: 8 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  minHeight: 720,
                  bgcolor: "background.paper",
                  border: "1px solid rgba(24,38,31,0.08)",
                }}
              >
                <Stack spacing={3}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: { xs: "flex-start", sm: "center" },
                      flexDirection: { xs: "column", sm: "row" },
                      gap: 1.5,
                    }}
                  >
                    <Box>
                      <Typography variant="h5">Planner output</Typography>
                      <Typography variant="body2" color="text.secondary">
                        The layout is ready for route, schedule, logs, and export panels.
                      </Typography>
                    </Box>
                    {planResult ? (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={`Trip ${planResult.trip_id.slice(0, 8)}`} color="secondary" />
                        <Button
                          component="a"
                          href={logPdfUrl || undefined}
                          download={`eld-trip-${planResult.trip_id.slice(0, 8)}.pdf`}
                          variant="outlined"
                          startIcon={<DownloadRoundedIcon />}
                          disabled={!logPdfUrl}
                        >
                          PDF
                        </Button>
                      </Stack>
                    ) : null}
                  </Box>

                  <Tabs
                    value={activeTab}
                    onChange={(_, nextValue) => setActiveTab(nextValue)}
                    variant="scrollable"
                    allowScrollButtonsMobile
                  >
                    <Tab icon={<ScheduleRoundedIcon />} iconPosition="start" value="schedule" label="Schedule" />
                    <Tab icon={<RouteRoundedIcon />} iconPosition="start" value="route" label="Route" />
                    <Tab icon={<DescriptionRoundedIcon />} iconPosition="start" value="logs" label="Logs" />
                  </Tabs>

                  <ResultPanel activeTab={activeTab} planResult={planResult} logPdfBytes={logPdfBytes} />
                </Stack>
              </Paper>
              </Grid>
            ) : null}
          </Grid>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function DriverInputFlow({
  activeStep,
  formValues,
  selectedPlaces,
  recentLocations,
  onFieldChange,
  onSetField,
  onResolvedLocation,
  onStepChange,
  onBack,
  onDeparturePreset,
}) {
  const step = inputSteps[activeStep];
  const StepIcon = step.icon;
  const progressValue = ((activeStep + 1) / inputSteps.length) * 100;
  const isLocationStep = ["current_location", "pickup_location", "dropoff_location"].includes(step.id);

  return (
    <Stack spacing={2.5}>
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <LocalShippingRoundedIcon color="primary" />
          <Typography variant="h5">Trip setup</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Start with stops and clock. Geoapify helps find locations, then Spotter builds the route and HOS plan.
        </Typography>
      </Box>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {inputSteps.map((item, index) => {
          const isComplete = Boolean(String(formValues[item.id]).trim());
          const ItemIcon = item.icon;

          return (
            <Button
              key={item.id}
              type="button"
              variant={index === activeStep ? "contained" : "outlined"}
              color={isComplete && index !== activeStep ? "success" : "primary"}
              startIcon={isComplete && index !== activeStep ? <CheckCircleRoundedIcon /> : <ItemIcon />}
              onClick={() => onStepChange(index)}
              sx={{
                minHeight: 44,
                borderRadius: 999,
                px: 1.6,
                flex: { xs: "1 1 46%", sm: "0 0 auto" },
              }}
            >
              {item.label}
            </Button>
          );
        })}
      </Stack>

      <Box>
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.8 }}>
          <Typography variant="caption" color="text.secondary">
            Step {activeStep + 1} of {inputSteps.length}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {Math.round(progressValue)}%
          </Typography>
        </Stack>
        <LinearProgress variant="determinate" value={progressValue} sx={{ height: 8, borderRadius: 99 }} />
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          bgcolor: "#f8f3e8",
          border: "1px solid rgba(24,38,31,0.08)",
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <Box
              sx={{
                width: 48,
                height: 48,
                display: "grid",
                placeItems: "center",
                flex: "0 0 auto",
                borderRadius: "16px",
                bgcolor: "rgba(22,93,74,0.12)",
                color: "primary.main",
              }}
            >
              <StepIcon />
            </Box>
            <Box>
              <Typography variant="h4" sx={{ fontSize: { xs: "1.7rem", sm: "2rem" } }}>
                {step.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {step.helper}
              </Typography>
            </Box>
          </Stack>

          {isLocationStep ? (
            <Stack spacing={1.25}>
              <LocationSuggestField
                name={step.id}
                value={formValues[step.id]}
                selectedPlace={selectedPlaces[step.id]}
                onChange={(payload) => onResolvedLocation(step.id, payload)}
                placeholder={step.placeholder}
              />
              <QuickChipGroup
                label="Recent stops"
                emptyLabel="Recent stops appear after your first plan."
                items={recentLocations.map((item) => ({ id: item, label: item, shortLabel: item }))}
                onSelect={(option) => onResolvedLocation(step.id, { text: option.label, point: null })}
              />
            </Stack>
          ) : null}

          {step.id === "departure_at" ? (
            <Stack spacing={1.25}>
              <TextField
                label="Start time"
                name="departure_at"
                type="datetime-local"
                value={formValues.departure_at}
                onChange={onFieldChange}
                required
                InputLabelProps={{ shrink: true }}
                fullWidth
                sx={largeFieldStyles}
              />
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip label="Leave now" color="primary" onClick={() => onDeparturePreset("now")} sx={chipButtonStyles} />
                <Chip
                  label="Tomorrow 8 AM"
                  color="primary"
                  variant="outlined"
                  onClick={() => onDeparturePreset("tomorrow-morning")}
                  sx={chipButtonStyles}
                />
              </Stack>
            </Stack>
          ) : null}

          {step.id === "current_cycle_used_hours" ? (
            <Stack spacing={1.25}>
              <TextField
                label="Used cycle hours"
                name="current_cycle_used_hours"
                type="number"
                value={formValues.current_cycle_used_hours}
                onChange={onFieldChange}
                placeholder={step.placeholder}
                inputProps={{ min: 0, max: 70, step: "0.25" }}
                required
                fullWidth
                sx={largeFieldStyles}
              />
              <QuickChipGroup
                label="Common answers"
                items={cycleHourPresets.map((item) => ({ id: item, label: item, shortLabel: item }))}
                onSelect={(option) => onSetField("current_cycle_used_hours", option.label)}
              />
            </Stack>
          ) : null}

          <DriverTripSummary formValues={formValues} />
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1.25}>
        <Button
          type="button"
          variant="outlined"
          startIcon={<ArrowBackRoundedIcon />}
          onClick={onBack}
          disabled={activeStep === 0}
          sx={{ minHeight: 52, width: "100%" }}
        >
          Back
        </Button>
      </Stack>
    </Stack>
  );
}

function LocationSuggestField({ name, value, selectedPlace, onChange, placeholder }) {
  const deferredValue = useDeferredValue(value);
  const [suggestions, setSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const canSearch = String(value || "").trim().length >= 3;

  useEffect(() => {
    const query = String(deferredValue || "").trim();
    if (query.length < 3) {
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsLoadingSuggestions(true);
      searchLocationSuggestions(query, { signal: controller.signal })
        .then((results) => {
          setSuggestions(results);
          setSuggestionError("");
        })
        .catch((error) => {
          if (error.name !== "AbortError") {
            setSuggestions([]);
            setSuggestionError("Suggestions unavailable. You can still type the address.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoadingSuggestions(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [deferredValue]);

  return (
    <Autocomplete
      freeSolo
      filterOptions={(options) => options}
      getOptionLabel={(option) => (typeof option === "string" ? option : option.label)}
      inputValue={value}
      loading={canSearch && isLoadingSuggestions}
      loadingText="Searching map..."
      noOptionsText={String(value || "").trim().length < 3 ? "Type at least 3 letters" : "No matches found"}
      options={canSearch ? suggestions : []}
      onChange={(_, selectedValue) => {
        if (!selectedValue) {
          return;
        }

        if (typeof selectedValue === "string") {
          onChange({ text: selectedValue, point: null });
          return;
        }

        onChange({
          text: selectedValue.label,
          point:
            selectedValue.latitude != null && selectedValue.longitude != null
              ? {
                  latitude: selectedValue.latitude,
                  longitude: selectedValue.longitude,
                }
              : null,
        });
      }}
      onInputChange={(_, nextValue, reason) => {
        if (reason !== "reset") {
          onChange({ text: nextValue, point: null });
        }
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Location"
          name={name}
          placeholder={placeholder}
          required
          fullWidth
          helperText={
            !geoapifyApiKey
              ? "Set VITE_GEOAPIFY_API_KEY to enable live location suggestions."
              : canSearch && suggestionError
              ? suggestionError
              : selectedPlace
                ? "Geoapify match selected. Trip planning will reuse these coordinates."
                : "Start typing and choose the closest address or place."
          }
          sx={largeFieldStyles}
        />
      )}
      renderOption={(props, option) => {
        const { key, ...optionProps } = props;

        return (
          <Box component="li" key={key} {...optionProps} sx={{ py: 1.25 }}>
            <ListItemText
              primary={option.shortLabel}
              secondary={option.label}
              primaryTypographyProps={{ fontWeight: 800 }}
              secondaryTypographyProps={{ noWrap: true }}
            />
          </Box>
        );
      }}
      selectOnFocus
    />
  );
}

function InputOnboardingPanel({ completedStepCount }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2.5, md: 3 },
        height: "100%",
        minHeight: { lg: 560 },
        display: "flex",
        alignItems: "stretch",
        bgcolor: "#17271f",
        color: "#fffaf0",
        border: "1px solid rgba(24,38,31,0.08)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          width: 280,
          height: 280,
          right: -110,
          top: -80,
          borderRadius: "50%",
          bgcolor: "rgba(178,92,47,0.34)",
        }}
      />
      <Stack spacing={3} sx={{ position: "relative", width: "100%" }}>
        <Box>
          <Typography variant="overline" sx={{ color: "rgba(255,250,240,0.7)", letterSpacing: 1.4 }}>
            How this works
          </Typography>
          <Typography variant="h4" sx={{ mt: 1 }}>
            Start with the trip. Results come after.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1.25, color: "rgba(255,250,240,0.72)" }}>
            Drivers should not have to read a dashboard before entering a load. Add the stops, choose a start time,
            confirm your clock, and build the route, schedule, and logs after the input is clear.
          </Typography>
        </Box>

        <Stack spacing={1.5}>
          {[
            ["1", "Pick addresses or places from live suggestions."],
            ["2", "Use quick chips for start time and cycle hours."],
            ["3", "Build the route, schedule, and logs after input is complete."],
          ].map(([number, text]) => (
            <Stack key={number} direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  bgcolor: "rgba(255,250,240,0.12)",
                  display: "grid",
                  placeItems: "center",
                  flex: "0 0 auto",
                  fontWeight: 800,
                }}
              >
                {number}
              </Box>
              <Typography variant="body2" sx={{ color: "rgba(255,250,240,0.84)" }}>
                {text}
              </Typography>
            </Stack>
          ))}
        </Stack>

        <Paper
          elevation={0}
          sx={{
            mt: "auto",
            p: 2,
            bgcolor: "rgba(255,250,240,0.1)",
            border: "1px solid rgba(255,250,240,0.14)",
            color: "inherit",
          }}
        >
          <Typography variant="body2" sx={{ color: "rgba(255,250,240,0.7)" }}>
            Setup progress
          </Typography>
          <Typography variant="h5" sx={{ mt: 0.5 }}>
            {completedStepCount} of {inputSteps.length} ready
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(completedStepCount / inputSteps.length) * 100}
            sx={{
              mt: 1.5,
              height: 8,
              borderRadius: 99,
              bgcolor: "rgba(255,250,240,0.18)",
              "& .MuiLinearProgress-bar": {
                bgcolor: "#f0b35d",
              },
            }}
          />
        </Paper>
      </Stack>
    </Paper>
  );
}

function QuickChipGroup({ label, emptyLabel, items, onSelect }) {
  if (!items.length) {
    return (
      <Typography variant="caption" color="text.secondary">
        {emptyLabel}
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.8 }}>
        {label}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {items.map((item) => (
          <Chip key={item.id || item.label} label={item.shortLabel || item.label} onClick={() => onSelect(item)} sx={chipButtonStyles} />
        ))}
      </Stack>
    </Box>
  );
}

function DriverTripSummary({ formValues }) {
  const summaryItems = [
    ["Now", formValues.current_location],
    ["Pickup", formValues.pickup_location],
    ["Dropoff", formValues.dropoff_location],
    ["Start", formatReadableDateTime(formValues.departure_at)],
    ["Used", `${formValues.current_cycle_used_hours || "0"} hrs`],
  ];

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        bgcolor: "rgba(255,255,255,0.72)",
        border: "1px solid rgba(24,38,31,0.08)",
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Your trip so far
      </Typography>
      <Stack spacing={0.75}>
        {summaryItems.map(([label, value]) => (
          <Stack key={label} direction="row" spacing={1} justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="caption" sx={{ maxWidth: "68%", textAlign: "right", fontWeight: 700 }}>
              {value || "Not set"}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

function ResultPanel({ activeTab, planResult, logPdfBytes }) {
  const plan = planResult.plan;

  if (activeTab === "route") {
    return (
      <Stack spacing={2}>
        <RouteMap geometry={plan.route.geometry} waypoints={plan.route.waypoints} />
        <MetricRow
          title="Route summary"
          items={[
            `Provider: ${plan.route.provider}`,
            `Miles: ${plan.route.distance_miles}`,
            `Drive hours: ${plan.route.drive_hours}`,
          ]}
        />
        <Alert severity="info">{plan.route.notes}</Alert>
        <LegList legs={plan.route.legs} />
        <StopList stops={plan.stops} />
      </Stack>
    );
  }

  if (activeTab === "logs") {
    return (
      <Stack spacing={2}>
        <MetricRow
          title="Daily log sheets"
          items={[
            `${plan.daily_logs.length} sheet${plan.daily_logs.length === 1 ? "" : "s"}`,
            `PDF preview: ${logPdfBytes ? "Ready" : "Generating"}`,
          ]}
        />
        <Paper
          elevation={0}
          sx={{
            p: { xs: 1.5, md: 2 },
            overflow: "auto",
            border: "1px solid rgba(24,38,31,0.08)",
            bgcolor: "#f5f2ea",
            maxHeight: "76vh",
          }}
        >
          <PdfLogPreview pdfBytes={logPdfBytes} />
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <MetricRow
        title="Compliance summary"
        items={[
          `Remaining cycle hours: ${plan.compliance_summary.remaining_cycle_hours}`,
          `Can complete today: ${plan.compliance_summary.can_complete_today ? "Yes" : "No"}`,
        ]}
      />
      {plan.compliance_summary.warnings.map((warning) => (
        <Alert severity="warning" key={warning}>
          {warning}
        </Alert>
      ))}
      <DutyEventList events={plan.duty_events} />
    </Stack>
  );
}

function MetricRow({ title, items }) {
  return (
    <Paper elevation={0} sx={{ p: 2.5, bgcolor: "#f8f3e8", border: "1px solid rgba(24,38,31,0.08)" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
        {title}
      </Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        {items.map((item) => (
          <Chip key={item} label={item} variant="outlined" />
        ))}
      </Stack>
    </Paper>
  );
}

function StopList({ stops }) {
  return (
    <Paper elevation={0} sx={{ border: "1px solid rgba(24,38,31,0.08)" }}>
      <List disablePadding>
        {stops.map((stop, index) => (
          <Box key={`${stop.kind}-${index}`}>
            <ListItem sx={{ py: 2 }}>
              <ListItemText
                primary={`${stop.kind.replaceAll("_", " ")} · ${stop.location}`}
                secondary={`${stop.duration_minutes} min · ${stop.reason}`}
              />
            </ListItem>
            {index < stops.length - 1 ? <Divider /> : null}
          </Box>
        ))}
      </List>
    </Paper>
  );
}

function LegList({ legs }) {
  return (
    <Paper elevation={0} sx={{ border: "1px solid rgba(24,38,31,0.08)" }}>
      <List disablePadding>
        {legs.map((leg, index) => (
          <Box key={`${leg.label}-${index}`}>
            <ListItem sx={{ py: 2 }}>
              <ListItemText
                primary={`${leg.label} · ${leg.start_location} to ${leg.end_location}`}
                secondary={`${leg.duration_minutes} min · ${leg.distance_miles} miles`}
              />
            </ListItem>
            {index < legs.length - 1 ? <Divider /> : null}
          </Box>
        ))}
      </List>
    </Paper>
  );
}

function DutyEventList({ events }) {
  return (
    <Paper elevation={0} sx={{ border: "1px solid rgba(24,38,31,0.08)" }}>
      <List disablePadding>
        {events.map((event, index) => (
          <Box key={`${event.status}-${event.location}-${index}`}>
            <ListItem sx={{ py: 2 }}>
              <ListItemText
                primary={`${event.status.replaceAll("_", " ")} · ${event.location}`}
                secondary={`${event.duration_minutes} min · ${event.remarks}`}
              />
            </ListItem>
            {index < events.length - 1 ? <Divider /> : null}
          </Box>
        ))}
      </List>
    </Paper>
  );
}

const largeFieldStyles = {
  "& .MuiInputBase-root": {
    minHeight: 60,
    fontSize: "1.05rem",
  },
  "& .MuiInputLabel-root": {
    fontSize: "1rem",
  },
};

const chipButtonStyles = {
  minHeight: 44,
  borderRadius: 999,
  fontWeight: 700,
  "& .MuiChip-label": {
    px: 1.4,
  },
};

function findFirstInvalidStep(values) {
  for (let index = 0; index < inputSteps.length; index += 1) {
    const step = inputSteps[index];
    const message = validateStep(step, values[step.id]);
    if (message) {
      return { index, message };
    }
  }

  return null;
}

function validateStep(step, value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return `${step.title} Add this before building the trip plan.`;
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

function persistRecentLocations(values, currentLocations, setRecentLocations) {
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

function readRecentLocations() {
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

function formatDateTimeLocal(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

function formatReadableDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function buildLocationCoordinatePayload(selectedPlaces) {
  const payload = {};
  for (const [fieldName, point] of Object.entries(selectedPlaces)) {
    if (!point) {
      continue;
    }

    payload[`${fieldName}_latitude`] = point.latitude;
    payload[`${fieldName}_longitude`] = point.longitude;
  }
  return payload;
}

export default App;
