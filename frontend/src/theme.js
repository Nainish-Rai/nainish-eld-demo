import { createTheme } from "@mui/material/styles";

export const plannerTheme = createTheme({
  palette: {
    primary: {
      main: "#165d4a",
      dark: "#0f4436",
    },
    secondary: {
      main: "#b25c2f",
      dark: "#87401f",
    },
    background: {
      default: "#f3efe6",
      paper: "#fffdf8",
    },
    text: {
      primary: "#18261f",
      secondary: "#506158",
    },
  },
  typography: {
    fontFamily: '"Roboto", "Aptos", "Trebuchet MS", sans-serif',
    h3: {
      fontWeight: 800,
      lineHeight: 1.04,
      letterSpacing: "-0.04em",
    },
    h4: {
      fontWeight: 800,
      letterSpacing: "-0.03em",
    },
    h5: {
      fontWeight: 800,
    },
    button: {
      fontWeight: 800,
      textTransform: "none",
    },
  },
  shape: {
    borderRadius: 16,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 700,
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
  },
});
