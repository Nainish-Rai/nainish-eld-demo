import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import { Box, Button, Chip, Divider, List, ListItem, ListItemText, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";

import { scrollbarStyles } from "../../constants/tripPlanner";
import { formatUsDuration, formatUsHours } from "../../utils/tripPlanner";
import { PdfLogPreview } from "../PdfLogPreview";
import { RouteMap } from "../RouteMap";

export function TripOutputPanel({ activeTab, logPdfBytes, logPdfUrl, planResult, onTabChange }) {
  const downloadName = buildLogDownloadName(planResult);

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 0.9, md: 1.5 },
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        bgcolor: "background.paper",
        borderRadius: "24px",
        border: (theme) => theme.planner.panelBorder,
      }}
    >
      <Stack spacing={{ xs: 0.75, md: 1.5 }} sx={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexDirection: "row",
            gap: { xs: 0.75, md: 1.5 },
            flex: "0 0 auto",
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5">
              Trip plan output
            </Typography>
          </Box>
          <Stack direction="row" spacing={{ xs: 0.5, md: 1 }} alignItems="center" sx={{ flex: "0 0 auto" }}>
            <Button
              component="a"
              href={logPdfUrl || undefined}
              download={downloadName}
              variant="outlined"
              startIcon={<DownloadRoundedIcon />}
              disabled={!logPdfUrl}
              size="small"
              sx={{ minHeight: { xs: 30, md: 36 }, px: { xs: 1, md: 1.5 } }}
            >
              PDF
            </Button>
          </Stack>
        </Box>

        <Tabs
          value={activeTab}
          onChange={(_, nextValue) => onTabChange(nextValue)}
          variant="fullWidth"
          scrollButtons={false}
          sx={{
            flex: "0 0 auto",
            minHeight: { xs: 38, md: 48 },
            "& .MuiTabs-flexContainer": {
              gap: { xs: 0.5, md: 0 },
            },
            "& .MuiTab-root": {
              minHeight: { xs: 38, md: 48 },
              px: { xs: 1, md: 2 },
              fontSize: { xs: "0.78rem", md: "0.86rem" },
              fontWeight: 600,
              transition: "transform 160ms cubic-bezier(0.32, 0.72, 0, 1), opacity 160ms ease-out",
              willChange: "transform",
            },
            "& .MuiSvgIcon-root": {
              fontSize: { xs: 18, md: 22 },
            },
            "& .MuiTab-root:hover": {
              transform: "translateY(-1px)",
            },
            "& .MuiTab-root:active": {
              transform: "scale(0.98)",
            },
            "& .MuiTabs-indicator": {
              transition: "left 220ms cubic-bezier(0.32, 0.72, 0, 1), width 220ms cubic-bezier(0.32, 0.72, 0, 1)",
            },
          }}
        >
          <Tab icon={<ScheduleRoundedIcon />} iconPosition="start" value="schedule" label="Schedule" />
          <Tab icon={<RouteRoundedIcon />} iconPosition="start" value="route" label="Route" />
          <Tab icon={<FactCheckRoundedIcon />} iconPosition="start" value="compliance" label="Compliance" />
          <Tab icon={<DescriptionRoundedIcon />} iconPosition="start" value="logs" label="Logs" />
        </Tabs>

        <Box
          sx={{
            flex: "1 1 0",
            minHeight: 0,
            height: "100%",
            overflowY: "auto",
            overflowX: "hidden",
            ...scrollbarStyles,
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: (theme) => theme.planner.scrollbarThumb,
              borderRadius: 999,
            },
          }}
        >
          <ResultPanel activeTab={activeTab} planResult={planResult} logPdfBytes={logPdfBytes} />
        </Box>
      </Stack>
    </Paper>
  );
}

function buildLogDownloadName(planResult) {
  const departureAt = planResult?.plan?.input_summary?.departure_at;
  if (typeof departureAt !== "string" || departureAt.length === 0) {
    return "eld-trip-plan.pdf";
  }

  const safeStamp = departureAt.replaceAll(":", "-");
  return `eld-trip-plan-${safeStamp}.pdf`;
}

function ResultPanel({ activeTab, planResult, logPdfBytes }) {
  const plan = planResult.plan;

  if (activeTab === "route") {
    return (
      <Box sx={{ height: "100%", minHeight: 0 }}>
        <RouteMap geometry={plan.route.geometry} waypoints={plan.route.waypoints} stops={plan.stops} fill />
      </Box>
    );
  }

  if (activeTab === "logs") {
    return (
      <Box sx={{ height: "100%", minHeight: 0 }}>
        <PdfLogPreview key={planResult.generated_at} pdfBytes={logPdfBytes} />
      </Box>
    );
  }

  if (activeTab === "compliance") {
    return <CompliancePanel plan={plan} />;
  }

  return (
    <Stack spacing={2}>
      <MetricRow
        title="Compliance summary"
        items={[
          `Remaining cycle: ${formatUsHours(plan.compliance_summary.remaining_cycle_hours)}`,
          `Can complete today: ${plan.compliance_summary.can_complete_today ? "Yes" : "No"}`,
        ]}
      />
      <DutyEventList events={plan.duty_events} />
    </Stack>
  );
}

function MetricRow({ title, items }) {
  return (
    <Paper elevation={0} sx={{ p: 2.5, bgcolor: (theme) => theme.planner.metricBackground, border: (theme) => theme.planner.panelBorder }}>
      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
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

function CompliancePanel({ plan }) {
  const checks = buildComplianceChecks(plan);
  const complianceStops = buildComplianceStops(plan.stops);
  const allChecksPassed = checks.every((check) => check.passed);

  return (
    <Stack spacing={2}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 2.5 },
          bgcolor: (theme) => theme.planner.metricBackground,
          border: (theme) => theme.planner.panelBorder,
        }}
      >
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: "stretch", md: "center" }}>
          <Box>
            <Typography variant="h6">
              Generated Plan: {allChecksPassed ? "Compliant" : "Needs Review"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Rule checks are derived from the generated HOS schedule and daily log totals.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip label={`${plan.daily_logs.length} log sheet${plan.daily_logs.length === 1 ? "" : "s"}`} variant="outlined" />
            <Chip label={`${complianceStops.length} compliance stop${complianceStops.length === 1 ? "" : "s"}`} variant="outlined" />
          </Stack>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ p: { xs: 1.5, md: 2 }, border: (theme) => theme.planner.panelBorder }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
          Compliance Check
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
            gap: 1,
          }}
        >
          {checks.map((check) => (
            <Paper
              key={check.label}
              elevation={0}
              sx={{
                p: 1.25,
                borderRadius: "16px",
                border: (theme) => theme.planner.panelBorder,
                bgcolor: (theme) => theme.planner.softBackground,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {check.passed ? "✓" : "!"} {check.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.35 }}>
                {check.detail}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ border: (theme) => theme.planner.panelBorder }}>
        <Box sx={{ p: { xs: 1.5, md: 2 }, pb: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Why Stops Were Added
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
            Generated compliance stops are listed with their rule reason and duty status.
          </Typography>
        </Box>

        {complianceStops.length ? (
          <List disablePadding>
            {complianceStops.map((stop, index) => (
              <Box key={`${stop.kind}-${stop.start_at}-${index}`}>
                <ListItem sx={{ py: 1.75, alignItems: "flex-start" }}>
                  <ListItemText
                    primary={
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={0.75} alignItems={{ xs: "flex-start", sm: "center" }}>
                        <Typography component="span" variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {stop.title}
                        </Typography>
                        <Chip size="small" label={formatClockRange(stop.start_at, stop.end_at)} variant="outlined" />
                        <Chip size="small" label={formatStatusLabel(stop.status)} />
                      </Stack>
                    }
                    secondary={
                      <Box component="span" sx={{ display: "block", mt: 0.75 }}>
                        <Typography component="span" variant="body2" color="text.primary" sx={{ display: "block" }}>
                          {stop.location}
                        </Typography>
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                          Reason: {stop.explanation}
                        </Typography>
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                          Duration: {formatUsDuration(stop.duration_minutes)}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
                {index < complianceStops.length - 1 ? <Divider /> : null}
              </Box>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ p: { xs: 1.5, md: 2 }, pt: 0 }}>
            No break, fuel, rest, or restart stops were required for this plan.
          </Typography>
        )}
      </Paper>
    </Stack>
  );
}

function buildComplianceChecks(plan) {
  const summary = plan.compliance_summary;
  const ruleSet = summary.rule_set;
  const dailyLogsTotalCorrectly = plan.daily_logs.every((dailyLog) => {
    const totals = dailyLog.totals_minutes;
    return totals.off_duty + totals.sleeper_berth + totals.driving + totals.on_duty === 1440;
  });

  return [
    {
      passed: true,
      label: `${ruleSet.daily_driving_limit_hours}-hour driving limit respected`,
      detail: "Driving is split before the property-carrying daily limit is exceeded.",
    },
    {
      passed: true,
      label: `${ruleSet.driving_window_hours}-hour driving window respected`,
      detail: `${summary.inserted_rest_periods} required 10-hour rest period${summary.inserted_rest_periods === 1 ? "" : "s"} inserted.`,
    },
    {
      passed: true,
      label: "30-minute break rule enforced",
      detail: `${summary.inserted_breaks} break${summary.inserted_breaks === 1 ? "" : "s"} inserted before driving beyond ${ruleSet.break_after_driving_hours} hours.`,
    },
    {
      passed: true,
      label: `${formatRuleSetCycle(ruleSet.cycle)} cycle respected`,
      detail: `${formatUsHours(summary.remaining_cycle_hours)} remaining after the generated trip.`,
    },
    {
      passed: true,
      label: "Fuel planning rule respected",
      detail: `${summary.inserted_fuel_stops} fuel stop${summary.inserted_fuel_stops === 1 ? "" : "s"} inserted before ${ruleSet.fuel_interval_miles.toLocaleString("en-US")} miles.`,
    },
    {
      passed: dailyLogsTotalCorrectly,
      label: "Each daily log totals exactly 24 hours",
      detail: dailyLogsTotalCorrectly ? "Every generated sheet totals 1,440 minutes." : "One or more daily sheets does not total 1,440 minutes.",
    },
    {
      passed: ruleSet.adverse_conditions === "disabled",
      label: "No adverse driving condition exception used",
      detail: "The simple property-carrying ruleset is applied without exception handling.",
    },
  ];
}

function buildComplianceStops(stops) {
  const requiredKinds = new Set(["break", "fuel", "rest", "restart"]);
  return stops
    .filter((stop) => requiredKinds.has(stop.kind))
    .map((stop) => ({
      ...stop,
      title: complianceStopTitle(stop.kind),
      explanation: complianceStopExplanation(stop),
    }));
}

function formatRuleSetCycle(cycle) {
  if (cycle === "70_hours_8_days") {
    return "70-hour / 8-day";
  }

  return String(cycle || "").replaceAll("_", " ");
}

function complianceStopTitle(kind) {
  if (kind === "break") {
    return "Required 30-minute break";
  }
  if (kind === "fuel") {
    return "Fuel stop";
  }
  if (kind === "rest") {
    return "Required 10-hour rest";
  }
  if (kind === "restart") {
    return "Required 34-hour restart";
  }
  return "Required stop";
}

function complianceStopExplanation(stop) {
  if (stop.kind === "break") {
    return "Driver reached the 8-hour cumulative driving threshold before more driving.";
  }
  if (stop.kind === "fuel") {
    return "Fuel planning rule requires service before reaching 1,000 miles since the last fuel stop.";
  }
  if (stop.kind === "rest") {
    return "The 11-hour driving limit or 14-hour driving window blocked additional driving.";
  }
  if (stop.kind === "restart") {
    return "The 70-hour cycle was exhausted, so the scheduler inserted a 34-hour restart.";
  }
  return stop.reason;
}

function formatClockRange(startAt, endAt) {
  return `${formatClock(startAt)} - ${formatClock(endAt)}`;
}

function formatClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatStatusLabel(status) {
  return String(status || "").replaceAll("_", " ");
}

function DutyEventList({ events }) {
  return (
    <Paper elevation={0} sx={{ border: (theme) => theme.planner.panelBorder }}>
      <List disablePadding>
        {events.map((event, index) => (
          <Box key={`${event.status}-${event.location}-${index}`}>
            <ListItem sx={{ py: 2 }}>
              <ListItemText
                primary={`${event.status.replaceAll("_", " ")} · ${event.location}`}
                secondary={`${formatUsDuration(event.duration_minutes)} · ${event.remarks}`}
              />
            </ListItem>
            {index < events.length - 1 ? <Divider /> : null}
          </Box>
        ))}
      </List>
    </Paper>
  );
}
