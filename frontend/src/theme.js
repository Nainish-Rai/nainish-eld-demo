import { alpha, createTheme } from "@mui/material/styles";

function buildPlannerTokens(mode) {
  const isDark = mode === "dark";

  return {
    appBackground: isDark
      ? `radial-gradient(circle at top left, ${alpha("#1266d6", 0.2)}, transparent 34%), linear-gradient(180deg, #0f172a 0%, #08111f 100%)`
      : `radial-gradient(circle at top left, ${alpha("#1266d6", 0.13)}, transparent 32%), linear-gradient(180deg, #eef1f5 0%, #dfe4eb 100%)`,
    shellBackground: isDark ? alpha("#0f172a", 0.88) : "rgba(255,255,255,0.92)",
    shellBorder: isDark ? "1px solid rgba(148,163,184,0.16)" : "1px solid rgba(15,23,42,0.07)",
    shellShadow: isDark ? "0 24px 70px rgba(2,6,23,0.45)" : "0 24px 70px rgba(15,23,42,0.12)",
    panelBorder: isDark ? "1px solid rgba(148,163,184,0.16)" : "1px solid rgba(15,23,42,0.08)",
    panelInset: isDark ? "inset 0 0 0 1px rgba(255,255,255,0.02)" : "inset 0 0 0 1px rgba(255,255,255,0.5)",
    softBackground: isDark ? "#111c2d" : "#fbfdff",
    overlayBackground: isDark ? alpha("#0f172a", 0.92) : "rgba(255,255,255,0.96)",
    overlayBorder: isDark ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(15,23,42,0.1)",
    overlayShadow: isDark ? "0 22px 54px rgba(2,6,23,0.45)" : "0 22px 54px rgba(15,23,42,0.22)",
    tabRailBackground: isDark ? "#111c2d" : "#eef3fb",
    tabSelectedBackground: isDark ? "#18263a" : "#ffffff",
    tabSelectedShadow: isDark ? "0 8px 18px rgba(2,6,23,0.3)" : "0 8px 18px rgba(15,23,42,0.08)",
    mutedBackground: isDark ? "#162235" : "#f1f5f9",
    previewBackground: isDark ? "#1a2435" : "#f5f2ea",
    metricBackground: isDark ? "#172131" : "#f8f3e8",
    mapBackground: isDark ? "#132033" : "#dceaf7",
    mapOverlayBackground: isDark ? alpha("#08111f", 0.9) : "rgba(255,255,255,0.94)",
    mapEmptyBackground: isDark ? "#12233c" : "#eef5ff",
    mapEmptyBorder: isDark ? "1px dashed rgba(96,165,250,0.38)" : "1px dashed rgba(18,102,214,0.24)",
    canvasBackground: isDark ? "#ffffff" : "#ffffff",
    canvasBorder: isDark ? "1px solid rgba(148,163,184,0.24)" : "1px solid rgba(24,38,31,0.12)",
    canvasShadow: isDark ? "0 14px 32px rgba(2,6,23,0.42)" : "0 14px 32px rgba(24,38,31,0.12)",
    scrollbarThumb: isDark ? "rgba(148,163,184,0.28)" : "rgba(15,23,42,0.18)",
    inactiveChipBackground: isDark ? "#1b2a3f" : "#eef2f7",
    activeStepBackground: isDark ? alpha("#1266d6", 0.22) : "rgba(18,102,214,0.08)",
    activeStepBorder: isDark ? `1px solid ${alpha("#60a5fa", 0.35)}` : "1px solid rgba(18,102,214,0.18)",
    activeStepHoverBackground: isDark ? alpha("#1266d6", 0.28) : "rgba(18,102,214,0.1)",
    inactiveStepHoverBackground: isDark ? "#172536" : "#f8fafc",
  };
}

export function createPlannerTheme(mode = "light") {
  const planner = buildPlannerTokens(mode);

  return createTheme({
    palette: {
      mode,
      primary: {
        main: "#1266d6",
        dark: "#0b4ba8",
      },
      secondary: {
        main: "#ff5c3f",
        dark: "#d63f27",
      },
      background: {
        default: mode === "dark" ? "#08111f" : "#e8ebef",
        paper: mode === "dark" ? "#0f172a" : "#ffffff",
      },
      text: {
        primary: mode === "dark" ? "#e5eefb" : "#111827",
        secondary: mode === "dark" ? "#94a3b8" : "#6b7280",
      },
      divider: mode === "dark" ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)",
    },
    typography: {
      fontFamily: '"Inter", "Aptos", "Trebuchet MS", sans-serif',
      fontSize: 16,
      h3: {
        fontSize: "clamp(2rem, 1.55rem + 1.8vw, 3.25rem)",
        fontWeight: 700,
        lineHeight: 1.08,
        letterSpacing: "-0.035em",
      },
      h4: {
        fontSize: "clamp(1.55rem, 1.3rem + 1vw, 2.25rem)",
        fontWeight: 700,
        lineHeight: 1.12,
        letterSpacing: "-0.025em",
      },
      h5: {
        fontSize: "clamp(1.12rem, 1.02rem + 0.4vw, 1.5rem)",
        fontWeight: 700,
        lineHeight: 1.18,
        letterSpacing: "-0.018em",
      },
      h6: {
        fontSize: "clamp(1rem, 0.95rem + 0.25vw, 1.2rem)",
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: "-0.012em",
      },
      subtitle1: {
        fontSize: "0.98rem",
        fontWeight: 600,
        lineHeight: 1.35,
      },
      subtitle2: {
        fontSize: "0.86rem",
        fontWeight: 600,
        lineHeight: 1.35,
      },
      body1: {
        fontSize: "1rem",
        lineHeight: 1.55,
      },
      body2: {
        fontSize: "0.88rem",
        lineHeight: 1.48,
      },
      caption: {
        fontSize: "0.74rem",
        fontWeight: 500,
        lineHeight: 1.35,
        letterSpacing: "0.01em",
      },
      button: {
        fontWeight: 700,
        letterSpacing: "-0.005em",
        textTransform: "none",
      },
    },
    shape: {
      borderRadius: 22,
    },
    planner,
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            boxShadow: "none",
          },
          contained: {
            boxShadow: mode === "dark" ? "0 12px 24px rgba(18,102,214,0.28)" : "0 12px 24px rgba(18,102,214,0.22)",
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 600,
            letterSpacing: "-0.005em",
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 18,
            backgroundColor: mode === "dark" ? "#0f1b2b" : "#fff",
          },
        },
      },
    },
  });
}
