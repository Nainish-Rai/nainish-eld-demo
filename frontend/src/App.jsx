import { useEffect, useMemo, useState } from "react";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { Alert, Box, Button, CircularProgress, CssBaseline, GlobalStyles, Grid, Paper, Stack, ThemeProvider } from "@mui/material";

import { createTripPlan, fetchPreviewRouteLeg } from "./api";
import { inputSteps } from "./constants/tripPlanner";
import { MobileSetupMapPanel, DriverInputFlow } from "./components/trip-planner/InputPanels";
import { TripOutputPanel } from "./components/trip-planner/OutputPanels";
import { AppHeader, MobileWorkspaceTabs } from "./components/trip-planner/WorkspaceChrome";
import { LocationPreviewMap } from "./components/RouteMap";
import { generateTripLogPdf } from "./eldPdf";
import { createPlannerTheme } from "./theme";
import {
  buildLocationCoordinatePayload,
  buildLocationPreviewStops,
  createInitialForm,
  findFirstInvalidStep,
  findFirstMissingPinnedStop,
  formatDateTimeLocal,
  initialSelectedPlaces,
  persistRecentLocations,
  readRecentLocations,
  validateStep,
} from "./utils/tripPlanner";

const colorModeStorageKey = "spotter_color_mode";

function App() {
  const [colorMode, setColorMode] = useState(readStoredColorMode);
  const [formValues, setFormValues] = useState(createInitialForm);
  const [selectedPlaces, setSelectedPlaces] = useState(initialSelectedPlaces);
  const [currentLocationBias, setCurrentLocationBias] = useState({
    status: "idle",
    point: null,
  });
  const [activeInputStep, setActiveInputStep] = useState(0);
  const [recentLocations, setRecentLocations] = useState(readRecentLocations);
  const [activeTab, setActiveTab] = useState("schedule");
  const [mobilePanel, setMobilePanel] = useState("setup");
  const [planResult, setPlanResult] = useState(null);
  const [logPdfBytes, setLogPdfBytes] = useState(null);
  const [logPdfUrl, setLogPdfUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const plannerTheme = useMemo(() => createPlannerTheme(colorMode), [colorMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(colorModeStorageKey, colorMode);
    } catch {
      // Ignore theme persistence failures.
    }
  }, [colorMode]);

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

  function resetTripOutput() {
    setPlanResult(null);
    setLogPdfBytes(null);
    setLogPdfUrl("");
    setActiveTab("schedule");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");

    const invalidStep = findFirstInvalidStep(formValues);
    if (invalidStep) {
      setActiveInputStep(invalidStep.index);
      setErrorMessage(invalidStep.message);
      return;
    }

    const missingPinnedStop = findFirstMissingPinnedStop(selectedPlaces);
    if (missingPinnedStop) {
      setActiveInputStep(missingPinnedStop.index);
      setErrorMessage(`Select ${missingPinnedStop.label.toLowerCase()} from the map suggestions so the route has coordinates.`);
      return;
    }

    setIsSubmitting(true);
    resetTripOutput();

    try {
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
      setMobilePanel("output");
      persistRecentLocations(formValues, recentLocations, setRecentLocations);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to build the trip plan.");
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

    const fieldIndex = inputSteps.findIndex((step) => step.id === fieldName);
    if (payload.point && fieldIndex === activeInputStep) {
      setErrorMessage("");
      setActiveInputStep((current) => Math.min(current + 1, inputSteps.length - 1));
    }
  }

  function requestCurrentLocationBias() {
    if (currentLocationBias.status !== "idle") {
      return;
    }

    if (!navigator.geolocation) {
      setCurrentLocationBias({ status: "unavailable", point: null });
      return;
    }

    setCurrentLocationBias({ status: "requesting", point: null });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocationBias({
          status: "ready",
          point: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        });
      },
      () => {
        setCurrentLocationBias({ status: "denied", point: null });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
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

  function applyDeparturePreset(preset) {
    const now = new Date();
    if (preset === "now") {
      updateField("departure_at", createInitialForm().departure_at);
      setActiveInputStep((current) => Math.min(current + 1, inputSteps.length - 1));
      return;
    }

    const tomorrowMorning = new Date(now);
    tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
    tomorrowMorning.setHours(8, 0, 0, 0);
    updateField("departure_at", formatDateTimeLocal(tomorrowMorning));
    setActiveInputStep((current) => Math.min(current + 1, inputSteps.length - 1));
  }

  const isFinalInputStep = activeInputStep === inputSteps.length - 1;
  const hasPlan = Boolean(planResult);
  const locationPreviewStops = buildLocationPreviewStops(formValues, selectedPlaces);
  const activeStep = inputSteps[activeInputStep];

  return (
    <ThemeProvider theme={plannerTheme}>
      <CssBaseline />
      <GlobalStyles
        styles={(theme) => ({
          html: { height: "100%", overflow: "hidden" },
          body: { height: "100%", overflow: "hidden" },
          "#root": { height: "100%", overflow: "hidden" },
          "@keyframes stepReveal": {
            from: { opacity: 0, transform: "translateY(-4px) scale(0.98)" },
            to: { opacity: 1, transform: "translateY(0) scale(1)" },
          },
          "@keyframes routeFade": {
            from: { opacity: 0 },
            to: { opacity: 1 },
          },
          ".maplibregl-map": {
            background: theme.planner.mapBackground,
          },
          ".maplibregl-ctrl-group": {
            backgroundColor: theme.palette.background.paper,
            borderColor: theme.palette.divider,
            boxShadow: theme.planner.overlayShadow,
          },
          ".maplibregl-ctrl button": {
            color: theme.palette.text.primary,
          },
          ".maplibregl-ctrl button:hover": {
            backgroundColor: theme.palette.mode === "dark" ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.06)",
          },
          ".maplibregl-popup-content": {
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            boxShadow: theme.planner.overlayShadow,
            borderRadius: 12,
            padding: "10px 12px",
          },
          ".maplibregl-popup-tip": {
            backgroundColor: theme.palette.background.paper,
          },
          ".maplibregl-ctrl-attrib": {
            backgroundColor: theme.palette.mode === "dark" ? "rgba(15,23,42,0.74)" : "rgba(255,255,255,0.78)",
            color: theme.palette.text.secondary,
          },
          ".maplibregl-ctrl-attrib a": {
            color: theme.palette.text.primary,
          },
          ".trip-map-popup-body": {
            marginTop: 4,
            color: theme.palette.text.secondary,
            lineHeight: 1.35,
          },
          "@media (prefers-reduced-motion: reduce)": {
            "*, *::before, *::after": {
              animationDuration: "1ms !important",
              transitionDuration: "1ms !important",
              scrollBehavior: "auto !important",
            },
          },
        })}
      />
      <Box
        sx={{
          height: "100dvh",
          overflow: "hidden",
          background: (theme) => theme.planner.appBackground,
          p: { xs: 0.6, md: 2 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            maxWidth: 1440,
            margin: "0 auto",
            height: "100%",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            p: { xs: 0.85, md: 1.75 },
            borderRadius: { xs: "22px", md: "30px" },
            bgcolor: (theme) => theme.planner.shellBackground,
            border: (theme) => theme.planner.shellBorder,
            boxShadow: (theme) => theme.planner.shellShadow,
          }}
        >
          <AppHeader
            colorMode={colorMode}
            onToggleColorMode={() => setColorMode((current) => (current === "dark" ? "light" : "dark"))}
          />

          <Stack spacing={{ xs: 0.75, md: 1.5 }} sx={{ mt: { xs: 0.75, md: 1.5 }, flex: 1, minHeight: 0 }}>
            <MobileWorkspaceTabs
              value={mobilePanel}
              hasPlan={hasPlan}
              onChange={(nextPanel) => setMobilePanel(nextPanel)}
            />

            <Grid
              container
              spacing={1.5}
              alignItems="stretch"
              sx={{ flex: 1, minHeight: 0, height: "100%", overflow: "hidden" }}
            >
              <Grid
                size={{ xs: 12, lg: 4 }}
                sx={{
                  display: { xs: mobilePanel === "setup" ? "block" : "none", lg: "block" },
                  height: "100%",
                  minHeight: 0,
                }}
              >
                <Box sx={{ display: { xs: "block", lg: "none" }, height: "100%", minHeight: 0 }}>
                  <MobileSetupMapPanel
                    activeStep={activeInputStep}
                    activeStepData={activeStep}
                    currentLocationBias={currentLocationBias}
                    errorMessage={errorMessage}
                    formValues={formValues}
                    isFinalInputStep={isFinalInputStep}
                    isSubmitting={isSubmitting}
                    locationPreviewStops={locationPreviewStops}
                    onContinue={goToNextStep}
                    onDeparturePreset={applyDeparturePreset}
                    onFieldChange={handleFieldChange}
                    onRequestCurrentLocationBias={requestCurrentLocationBias}
                    onResolvedLocation={handleResolvedLocation}
                    onSubmit={handleSubmit}
                  />
                </Box>
                <Paper
                  component="form"
                  onSubmit={handleSubmit}
                  elevation={0}
                  sx={{
                    display: { xs: "none", lg: "block" },
                    p: { xs: 1.25, sm: 1.5 },
                    height: "100%",
                    minHeight: 0,
                    overflow: "hidden",
                    borderRadius: "24px",
                    bgcolor: "background.paper",
                    border: (theme) => theme.planner.panelBorder,
                    boxShadow: (theme) => theme.planner.panelInset,
                  }}
                >
                  <Stack spacing={1.25} sx={{ height: "100%", minHeight: 0 }}>
                    <DriverInputFlow
                      activeStep={activeInputStep}
                      formValues={formValues}
                      currentLocationBias={currentLocationBias}
                      onFieldChange={handleFieldChange}
                      onResolvedLocation={handleResolvedLocation}
                      onRequestCurrentLocationBias={requestCurrentLocationBias}
                      onStepChange={(stepIndex) => {
                        setErrorMessage("");
                        setActiveInputStep(stepIndex);
                      }}
                      onContinue={goToNextStep}
                      onDeparturePreset={applyDeparturePreset}
                    />

                    {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

                    {isFinalInputStep ? (
                      <Button
                        type="submit"
                        variant="contained"
                        size="large"
                        endIcon={
                          isSubmitting ? <CircularProgress color="inherit" size={18} /> : <ArrowForwardRoundedIcon />
                        }
                        disabled={isSubmitting}
                        sx={{ minHeight: 54, fontSize: "0.95rem" }}
                      >
                        {isSubmitting ? "Building trip plan..." : "Build trip plan"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="contained"
                        size="large"
                        endIcon={<ArrowForwardRoundedIcon />}
                        onClick={goToNextStep}
                        sx={{ minHeight: 54, fontSize: "0.95rem" }}
                      >
                        Next
                      </Button>
                    )}
                  </Stack>
                </Paper>
              </Grid>

              <Grid
                size={{ xs: 12, lg: 8 }}
                sx={{
                  display: { xs: mobilePanel === "setup" ? "none" : "block", lg: "block" },
                  height: "100%",
                  minHeight: 0,
                }}
              >
                {!hasPlan ? (
                  <LocationPreviewMap
                    stops={locationPreviewStops}
                    activeStopId={activeStep.id}
                    fetchRouteLeg={fetchPreviewRouteLeg}
                  />
                ) : (
                  <>
                    <Box sx={{ display: { xs: mobilePanel === "map" ? "block" : "none", lg: "none" }, height: "100%" }}>
                      <LocationPreviewMap
                        stops={locationPreviewStops}
                        activeStopId={activeStep.id}
                        fetchRouteLeg={fetchPreviewRouteLeg}
                      />
                    </Box>
                    <Box sx={{ display: { xs: mobilePanel === "output" ? "block" : "none", lg: "block" }, height: "100%" }}>
                      <TripOutputPanel
                        activeTab={activeTab}
                        logPdfBytes={logPdfBytes}
                        logPdfUrl={logPdfUrl}
                        planResult={planResult}
                        onTabChange={setActiveTab}
                      />
                    </Box>
                  </>
                )}
              </Grid>
            </Grid>
          </Stack>
        </Paper>
      </Box>
    </ThemeProvider>
  );
}

function readStoredColorMode() {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    const stored = window.localStorage.getItem(colorModeStorageKey);
    return stored === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export default App;
