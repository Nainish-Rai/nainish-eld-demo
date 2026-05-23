import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import { Box, IconButton, Paper, Stack, Tab, Tabs, Tooltip, Typography } from "@mui/material";

export function AppHeader({ colorMode, onToggleColorMode }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      spacing={{ xs: 0.8, md: 1.25 }}
    >
      <Stack direction="row" alignItems="center" spacing={{ xs: 0.8, md: 1.25 }}>
        <Box
          sx={{
            width: { xs: 30, md: 36 },
            height: { xs: 30, md: 36 },
            borderRadius: { xs: "10px", md: "12px" },
            display: "grid",
            placeItems: "center",
            bgcolor: "primary.main",
            color: "#fff",
            boxShadow: "0 12px 22px rgba(18,102,214,0.22)",
          }}
        >
          <LocalShippingRoundedIcon fontSize="small" />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontSize: { xs: "1.05rem", md: "1.25rem" } }}>
            Spotter AI
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",
              mt: { xs: -0.3, md: -0.2 },
              fontSize: { xs: "0.7rem", md: "0.76rem" },
              lineHeight: { xs: 1.25, md: 1.4 },
            }}
          >
            Pin stops, build a compliant route, and export driver-ready ELD logs.
          </Typography>
        </Box>
      </Stack>
      <Tooltip title={colorMode === "dark" ? "Use light mode" : "Use dark mode"}>
        <IconButton
          onClick={onToggleColorMode}
          color="inherit"
          sx={{
            border: (theme) => theme.planner.panelBorder,
            bgcolor: (theme) => theme.planner.tabRailBackground,
          }}
        >
          {colorMode === "dark" ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

export function MobileWorkspaceTabs({ value, hasPlan, onChange }) {
  return (
    <Paper
      elevation={0}
      sx={{
        display: { xs: "block", lg: "none" },
        p: 0.25,
        borderRadius: "14px",
        bgcolor: (theme) => theme.planner.tabRailBackground,
        border: (theme) => theme.planner.panelBorder,
      }}
    >
      <Tabs
        value={value}
        onChange={(_, nextValue) => onChange(nextValue)}
        variant="fullWidth"
        sx={{
          minHeight: 34,
          "& .MuiTabs-indicator": {
            display: "none",
          },
          "& .MuiTab-root": {
            minHeight: 34,
            py: 0,
            borderRadius: "12px",
            color: "text.secondary",
            fontSize: "0.82rem",
            fontWeight: 700,
            textTransform: "none",
            transition: "transform 160ms cubic-bezier(0.32, 0.72, 0, 1), background-color 160ms ease-out, color 160ms ease-out",
          },
          "& .MuiTab-root.Mui-selected": {
            bgcolor: (theme) => theme.planner.tabSelectedBackground,
            color: "primary.main",
            boxShadow: (theme) => theme.planner.tabSelectedShadow,
          },
          "& .MuiTab-root:active": {
            transform: "scale(0.98)",
          },
        }}
      >
        <Tab value="setup" label="Setup" />
        <Tab value="map" label="Map" />
        <Tab value="output" label="Output" disabled={!hasPlan} />
      </Tabs>
    </Paper>
  );
}
