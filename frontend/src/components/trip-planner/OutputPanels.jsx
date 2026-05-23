import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import { Alert, Box, Button, Chip, Divider, List, ListItem, ListItemText, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";

import { scrollbarStyles } from "../../constants/tripPlanner";
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
            <Typography variant="h5" sx={{ fontSize: { xs: "1.12rem", md: "1.5rem" }, lineHeight: 1.1 }}>
              Trip plan output
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "none", md: "block" } }}>
              Route, HOS schedule, log preview, and export are grouped after setup is complete.
            </Typography>
          </Box>
          <Stack direction="row" spacing={{ xs: 0.5, md: 1 }} alignItems="center" sx={{ flex: "0 0 auto" }}>
            <Chip
              label="Stateless plan"
              color="primary"
              size="small"
              sx={{ height: { xs: 30, md: 32 }, fontWeight: 900 }}
            />
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
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{
            flex: "0 0 auto",
            minHeight: { xs: 38, md: 48 },
            "& .MuiTabs-flexContainer": {
              gap: { xs: 0.5, md: 0 },
            },
            "& .MuiTab-root": {
              minHeight: { xs: 38, md: 48 },
              px: { xs: 1, md: 2 },
              fontSize: { xs: "0.78rem", md: "0.875rem" },
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
          <Tab icon={<DescriptionRoundedIcon />} iconPosition="start" value="logs" label="Logs" />
        </Tabs>

        <Box
          sx={{
            flex: "1 1 0",
            minHeight: 0,
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
      <Stack spacing={2}>
        <RouteMap geometry={plan.route.geometry} waypoints={plan.route.waypoints} stops={plan.stops} />
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
            border: (theme) => theme.planner.panelBorder,
            bgcolor: (theme) => theme.planner.previewBackground,
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
      <DutyEventList events={plan.duty_events} />
    </Stack>
  );
}

function MetricRow({ title, items }) {
  return (
    <Paper elevation={0} sx={{ p: 2.5, bgcolor: (theme) => theme.planner.metricBackground, border: (theme) => theme.planner.panelBorder }}>
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
    <Paper elevation={0} sx={{ border: (theme) => theme.planner.panelBorder }}>
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
    <Paper elevation={0} sx={{ border: (theme) => theme.planner.panelBorder }}>
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
    <Paper elevation={0} sx={{ border: (theme) => theme.planner.panelBorder }}>
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
