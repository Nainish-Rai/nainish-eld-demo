import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  CssBaseline,
  Divider,
  Grid,
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
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";

import { createTripPlan } from "./api";
import { RouteMap } from "./components/RouteMap";
import { plannerTheme } from "./theme";

const initialForm = {
  current_location: "",
  pickup_location: "",
  dropoff_location: "",
  departure_at: "2026-05-19T08:00",
  current_cycle_used_hours: "12.50",
};

function App() {
  const [formValues, setFormValues] = useState(initialForm);
  const [activeTab, setActiveTab] = useState("schedule");
  const [planResult, setPlanResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const payload = {
        ...formValues,
        departure_at: new Date(formValues.departure_at).toISOString(),
      };
      const result = await createTripPlan(payload);
      setPlanResult(result);
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
              <Typography variant="overline" sx={{ letterSpacing: 1.6 }}>
                FMCSA HOS Planner
              </Typography>
              <Typography variant="h3" sx={{ mt: 1, maxWidth: 720 }}>
                Plan the trip, inspect the legal timeline, and generate the driver log.
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
                Implementation status
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.5 }}>
                HOS engine live
              </Typography>
              <Typography variant="body2" color="text.secondary">
                The schedule is rule-driven now. Route geometry is still using a static template until OSRM is wired.
              </Typography>
            </Paper>
          </Stack>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, lg: 4 }}>
              <Paper
                component="form"
                onSubmit={handleSubmit}
                elevation={0}
                sx={{
                  p: 3,
                  height: "100%",
                  bgcolor: "background.paper",
                  border: "1px solid rgba(24,38,31,0.08)",
                }}
              >
                <Stack spacing={2.5}>
                  <Box>
                    <Typography variant="h5">Trip inputs</Typography>
                    <Typography variant="body2" color="text.secondary">
                      This screen submits a real request to Django, saves the trip in Postgres, and renders live HOS output.
                    </Typography>
                  </Box>

                  <TextField
                    label="Current location"
                    name="current_location"
                    value={formValues.current_location}
                    onChange={handleFieldChange}
                    required
                    fullWidth
                  />
                  <TextField
                    label="Pickup location"
                    name="pickup_location"
                    value={formValues.pickup_location}
                    onChange={handleFieldChange}
                    required
                    fullWidth
                  />
                  <TextField
                    label="Dropoff location"
                    name="dropoff_location"
                    value={formValues.dropoff_location}
                    onChange={handleFieldChange}
                    required
                    fullWidth
                  />
                  <TextField
                    label="Departure time"
                    name="departure_at"
                    type="datetime-local"
                    value={formValues.departure_at}
                    onChange={handleFieldChange}
                    required
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                  <TextField
                    label="Current cycle used hours"
                    name="current_cycle_used_hours"
                    type="number"
                    value={formValues.current_cycle_used_hours}
                    onChange={handleFieldChange}
                    inputProps={{ min: 0, max: 70, step: "0.25" }}
                    required
                    fullWidth
                  />

                  {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    startIcon={
                      isSubmitting ? <CircularProgress color="inherit" size={18} /> : <PlayArrowRoundedIcon />
                    }
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Generating plan..." : "Generate trip plan"}
                  </Button>
                </Stack>
              </Paper>
            </Grid>

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
                    {planResult ? <Chip label={`Trip ${planResult.trip_id.slice(0, 8)}`} color="secondary" /> : null}
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

                  {!planResult ? (
                    <EmptyState />
                  ) : (
                    <ResultPanel activeTab={activeTab} planResult={planResult} />
                  )}
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function EmptyState() {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 4,
        minHeight: 420,
        display: "grid",
        placeItems: "center",
        bgcolor: "#f8f3e8",
        border: "1px dashed rgba(24,38,31,0.16)",
      }}
    >
      <Stack spacing={1.5} alignItems="center" sx={{ maxWidth: 420, textAlign: "center" }}>
        <Typography variant="h6">No trip generated yet</Typography>
        <Typography variant="body2" color="text.secondary">
          Submit the form to verify the full path from MUI through DRF into Postgres.
        </Typography>
      </Stack>
    </Paper>
  );
}

function ResultPanel({ activeTab, planResult }) {
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
          title="Daily log totals"
          items={[
            `Driving: ${plan.daily_logs[0].totals_minutes.driving} min`,
            `On duty: ${plan.daily_logs[0].totals_minutes.on_duty} min`,
            `Sleeper: ${plan.daily_logs[0].totals_minutes.sleeper_berth} min`,
          ]}
        />
        <Alert severity="warning">{plan.daily_logs[0].notes}</Alert>
        <DutyEventList events={plan.duty_events} />
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

export default App;
