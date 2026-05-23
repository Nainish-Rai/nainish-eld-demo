import { useDeferredValue, useEffect, useState } from "react";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { Alert, Autocomplete, Box, Button, Chip, CircularProgress, LinearProgress, ListItemText, Paper, Stack, TextField, Typography } from "@mui/material";

import { fetchPreviewRouteLeg, geoapifyApiKey, searchLocationSuggestions } from "../../api";
import { chipButtonStyles, cycleHourPresets, inputSteps, largeFieldStyles } from "../../constants/tripPlanner";
import { formatStepPreview } from "../../utils/tripPlanner";
import { LocationPreviewMap } from "../RouteMap";

export function MobileSetupMapPanel({
  activeStep,
  activeStepData,
  currentLocationBias,
  errorMessage,
  formValues,
  isFinalInputStep,
  isSubmitting,
  locationPreviewStops,
  selectedPlaces,
  onContinue,
  onDeparturePreset,
  onFieldChange,
  onRequestCurrentLocationBias,
  onResolvedLocation,
  onSetField,
  onSubmit,
}) {
  const progressValue = ((activeStep + 1) / inputSteps.length) * 100;

  return (
    <Box component="form" onSubmit={onSubmit} sx={{ height: "100%", minHeight: 0, position: "relative" }}>
      <LocationPreviewMap
        stops={locationPreviewStops}
        activeStopId={activeStepData.id}
        fetchRouteLeg={fetchPreviewRouteLeg}
        compact
      />

      <Paper
        elevation={0}
        sx={{
          position: "absolute",
          left: { xs: 10, sm: 16 },
          right: { xs: 10, sm: 16 },
          bottom: { xs: 10, sm: 16 },
          zIndex: 500,
            p: { xs: 1.25, sm: 1.5 },
            borderRadius: "24px",
            bgcolor: (theme) => theme.planner.overlayBackground,
            border: (theme) => theme.planner.overlayBorder,
            boxShadow: (theme) => theme.planner.overlayShadow,
            backdropFilter: "blur(18px)",
            animation: "stepReveal 180ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
      >
        <Stack spacing={1.1}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                Step {activeStep + 1} of {inputSteps.length}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 950, lineHeight: 1.08 }}>
                {activeStepData.title}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={`${Math.round(progressValue)}%`}
              sx={{ bgcolor: (theme) => theme.planner.tabRailBackground, color: "primary.main", fontWeight: 900 }}
            />
          </Stack>

          <LinearProgress variant="determinate" value={progressValue} sx={{ height: 7, borderRadius: 99 }} />

          <StepInlineInput
            step={activeStepData}
            formValues={formValues}
            selectedPlaces={selectedPlaces}
            currentLocationBias={currentLocationBias}
            onFieldChange={onFieldChange}
            onSetField={onSetField}
            onResolvedLocation={onResolvedLocation}
            onRequestCurrentLocationBias={onRequestCurrentLocationBias}
            onDeparturePreset={onDeparturePreset}
            onContinue={onContinue}
          />

          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

          {isFinalInputStep ? (
            <Button
              type="submit"
              variant="contained"
              size="large"
              endIcon={isSubmitting ? <CircularProgress color="inherit" size={18} /> : <ArrowForwardRoundedIcon />}
              disabled={isSubmitting}
              sx={{ minHeight: 52, fontSize: "0.95rem" }}
            >
              {isSubmitting ? "Building trip plan..." : "Build trip plan"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="contained"
              size="large"
              endIcon={<ArrowForwardRoundedIcon />}
              onClick={onContinue}
              sx={{ minHeight: 52, fontSize: "0.95rem" }}
            >
              Next
            </Button>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}

export function DriverInputFlow({
  activeStep,
  formValues,
  selectedPlaces,
  currentLocationBias,
  onFieldChange,
  onSetField,
  onResolvedLocation,
  onRequestCurrentLocationBias,
  onStepChange,
  onContinue,
  onDeparturePreset,
}) {
  const progressValue = ((activeStep + 1) / inputSteps.length) * 100;

  return (
    <Stack spacing={1.15} sx={{ height: "100%", minHeight: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" sx={{ fontSize: "1.12rem" }}>
          Trip setup
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {Math.round(progressValue)}% complete
        </Typography>
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
          p: 1,
          borderRadius: "20px",
          bgcolor: (theme) => theme.planner.softBackground,
          border: (theme) => theme.planner.panelBorder,
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <Stack spacing={0.7} sx={{ height: "100%" }}>
          {inputSteps.map((item, index) => {
            const isComplete = Boolean(String(formValues[item.id]).trim());
            const isActive = index === activeStep;
            const ItemIcon = item.icon;

            return (
              <Paper
                key={item.id}
                elevation={0}
                sx={{
                  p: isActive ? 1 : 0.8,
                  borderRadius: "15px",
                  bgcolor: isActive ? ((theme) => theme.planner.activeStepBackground) : "transparent",
                  border: isActive ? ((theme) => theme.planner.activeStepBorder) : "1px solid transparent",
                  transform: isActive ? "translateY(0) scale(1)" : "translateY(0) scale(0.995)",
                  transition:
                    "transform 180ms cubic-bezier(0.32, 0.72, 0, 1), background-color 180ms ease-out, border-color 180ms ease-out",
                  willChange: "transform",
                  "&:hover": {
                    transform: "translateY(-1px) scale(1)",
                    bgcolor: isActive ? ((theme) => theme.planner.activeStepHoverBackground) : ((theme) => theme.planner.inactiveStepHoverBackground),
                  },
                  "&:active": {
                    transform: "scale(0.98)",
                    transitionDuration: "90ms",
                  },
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  role="button"
                  tabIndex={0}
                  onClick={() => onStepChange(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      onStepChange(index);
                    }
                  }}
                  sx={{
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      flex: "0 0 auto",
                      bgcolor: isComplete ? "primary.main" : ((theme) => theme.planner.inactiveChipBackground),
                      color: isComplete ? "#fff" : "text.secondary",
                    }}
                  >
                    {isComplete && !isActive ? <CheckCircleRoundedIcon fontSize="small" /> : <ItemIcon fontSize="small" />}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                      {item.title.replace("?", "")}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", lineHeight: 1.2 }}>
                      {formatStepPreview(item, formValues[item.id])}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={String(index + 1).padStart(2, "0")}
                    sx={{ bgcolor: (theme) => theme.planner.mutedBackground, color: "text.secondary", fontWeight: 900 }}
                  />
                </Stack>

                {isActive ? (
                  <Box sx={{ animation: "stepReveal 180ms cubic-bezier(0.32, 0.72, 0, 1)" }}>
                    <StepInlineInput
                      step={item}
                      formValues={formValues}
                      selectedPlaces={selectedPlaces}
                      currentLocationBias={currentLocationBias}
                      onFieldChange={onFieldChange}
                      onSetField={onSetField}
                      onResolvedLocation={onResolvedLocation}
                      onRequestCurrentLocationBias={onRequestCurrentLocationBias}
                      onDeparturePreset={onDeparturePreset}
                      onContinue={onContinue}
                    />
                  </Box>
                ) : null}
              </Paper>
            );
          })}
        </Stack>
      </Paper>
    </Stack>
  );
}

function StepInlineInput({
  step,
  formValues,
  selectedPlaces,
  currentLocationBias,
  onFieldChange,
  onSetField,
  onResolvedLocation,
  onRequestCurrentLocationBias,
  onDeparturePreset,
  onContinue,
}) {
  const isLocationStep = ["current_location", "pickup_location", "dropoff_location"].includes(step.id);

  return (
    <Box sx={{ pt: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.8, lineHeight: 1.3 }}>
        {step.helper}
      </Typography>

      {isLocationStep ? (
        <Stack spacing={0.75}>
          <LocationSuggestField
            name={step.id}
            value={formValues[step.id]}
            selectedPlace={selectedPlaces[step.id]}
            currentLocationBias={currentLocationBias}
            onChange={(payload) => onResolvedLocation(step.id, payload)}
            onRequestCurrentLocationBias={onRequestCurrentLocationBias}
            placeholder={step.placeholder}
          />
          <Typography variant="caption" color="text.secondary">
            Choose a suggestion to place the pin and continue.
          </Typography>
        </Stack>
      ) : null}

      {step.id === "departure_at" ? (
        <Stack spacing={0.75}>
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
            <Chip label="Now" color="primary" onClick={() => onDeparturePreset("now")} sx={chipButtonStyles} />
            <Chip
              label="Tomorrow 8 AM"
              color="primary"
              variant="outlined"
              onClick={() => onDeparturePreset("tomorrow-morning")}
              sx={chipButtonStyles}
            />
            <Button type="button" size="small" variant="text" onClick={onContinue} sx={{ px: 0 }}>
              Continue
            </Button>
          </Stack>
        </Stack>
      ) : null}

      {step.id === "current_cycle_used_hours" ? (
        <Stack spacing={0.75}>
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
            label="Common"
            items={cycleHourPresets.map((item) => ({ id: item, label: item, shortLabel: item }))}
            onSelect={(option) => onSetField("current_cycle_used_hours", option.label)}
          />
        </Stack>
      ) : null}
    </Box>
  );
}

function LocationSuggestField({
  name,
  value,
  selectedPlace,
  currentLocationBias,
  onChange,
  onRequestCurrentLocationBias,
  placeholder,
}) {
  const deferredValue = useDeferredValue(value);
  const [suggestions, setSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const canSearch = String(value || "").trim().length >= 3;
  const biasPoint = name === "current_location" ? currentLocationBias.point : null;
  const usingNearbyBias = name === "current_location" && currentLocationBias.status === "ready" && biasPoint;
  let helperText = "Start typing and choose the closest address or place.";

  if (!geoapifyApiKey) {
    helperText = "Set VITE_GEOAPIFY_API_KEY to enable live location suggestions.";
  } else if (canSearch && suggestionError) {
    helperText = suggestionError;
  } else if (selectedPlace) {
    helperText = "Geoapify match selected. Trip planning will reuse these coordinates.";
  } else if (usingNearbyBias) {
    helperText = "Using nearby results for your current location.";
  } else if (name === "current_location" && currentLocationBias.status === "requesting") {
    helperText = "Checking your current location for nearby results.";
  } else if (name === "current_location" && currentLocationBias.status === "denied") {
    helperText = "Location access is off. You can still type your current location.";
  } else if (name === "current_location" && currentLocationBias.status === "unavailable") {
    helperText = "This device cannot share location. You can still type your current location.";
  }

  useEffect(() => {
    const query = String(deferredValue || "").trim();
    if (query.length < 3) {
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsLoadingSuggestions(true);
      searchLocationSuggestions(query, {
        signal: controller.signal,
        bias: biasPoint ? `proximity:${biasPoint.longitude},${biasPoint.latitude}` : undefined,
      })
        .then((results) => {
          setSuggestions(results);
          setSuggestionError("");
        })
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }

          setSuggestions([]);
          setSuggestionError("Suggestions unavailable. You can still type the address.");
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
  }, [biasPoint, deferredValue]);

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
          onChange({ text: selectedValue, point: null, source: "typing" });
          return;
        }

        onChange({
          text: selectedValue.label,
          source: "suggestion",
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
          onChange({ text: nextValue, point: null, source: "typing" });
        }
      }}
      onOpen={() => {
        if (name === "current_location") {
          onRequestCurrentLocationBias();
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
          helperText={helperText}
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
