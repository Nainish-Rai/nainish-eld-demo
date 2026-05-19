import { createTheme } from "@mui/material/styles";

export const plannerTheme = createTheme({
  palette: {
    primary: {
      main: "#165d4a",
    },
    secondary: {
      main: "#b25c2f",
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
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h3: {
      fontWeight: 700,
    },
    h5: {
      fontWeight: 700,
    },
  },
  shape: {
    borderRadius: 8,
  },
});
