import {
  alpha,
  createTheme,
  responsiveFontSizes,
  type PaletteMode,
} from "@mui/material/styles";

export function createAppTheme(mode: PaletteMode) {
  const isDark = mode === "dark";
  const darkDivider = alpha("#334155", 0.46);
  const lightDivider = alpha("#cbd5e1", 0.9);

  let theme = createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? "#8ab4ff" : "#2563eb",
      },
      secondary: {
        main: isDark ? "#c4b5fd" : "#7c3aed",
      },
      background: {
        default: isDark ? "#0f1725" : "#f6f8fc",
        paper: isDark ? "#182230" : "#ffffff",
      },
      divider: isDark ? darkDivider : lightDivider,
      text: {
        primary: isDark ? "#f8fafc" : "#0f172a",
        secondary: isDark ? "#cbd5e1" : "#475569",
      },
      action: {
        hover: isDark ? alpha("#94a3b8", 0.1) : alpha("#0f172a", 0.04),
        selected: isDark ? alpha("#60a5fa", 0.12) : alpha("#2563eb", 0.08),
      },
      success: {
        main: isDark ? "#34d399" : "#059669",
      },
      warning: {
        main: isDark ? "#fbbf24" : "#d97706",
      },
      error: {
        main: isDark ? "#fb7185" : "#dc2626",
      },
    },
    shape: {
      borderRadius: 14,
    },
    typography: {
      fontFamily:
        '"Inter", "SF Pro Display", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      h4: {
        fontWeight: 700,
        letterSpacing: "-0.02em",
      },
      h6: {
        fontWeight: 700,
        letterSpacing: "-0.01em",
      },
      button: {
        textTransform: "none",
        fontWeight: 600,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: {
            height: "100%",
          },
          body: {
            height: "100%",
            margin: 0,
            overflow: "hidden",
            backgroundColor: isDark ? "#111827" : "#f3f6fb",
          },
          "#app": {
            height: "100dvh",
            overflow: "hidden",
          },
        },
      },
      MuiPaper: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: "none",
            border: `1px solid ${isDark ? darkDivider : alpha("#cbd5e1", 0.9)}`,
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            minHeight: 40,
            paddingInline: 14,
            borderRadius: 10,
            boxShadow: "none",
          },
          text: {
            color: isDark ? "#cbd5e1" : "#475569",
          },
          outlined: {
            borderColor: isDark ? alpha("#475569", 0.9) : alpha("#cbd5e1", 1),
          },
          contained: {
            boxShadow: "none",
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            fontWeight: 600,
            backgroundColor: isDark
              ? alpha("#0f172a", 0.44)
              : alpha("#e2e8f0", 0.72),
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: isDark
              ? alpha("#0f172a", 0.56)
              : alpha("#ffffff", 0.9),
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: isDark ? darkDivider : lightDivider,
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: isDark ? alpha("#475569", 0.96) : alpha("#94a3b8", 1),
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: isDark ? "#8ab4ff" : "#2563eb",
            },
          },
        },
      },
      MuiAccordion: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            "&::before": {
              display: "none",
            },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 10,
            maxWidth: 720,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            lineHeight: 1.5,
          },
        },
      },
    },
  });

  theme = responsiveFontSizes(theme);

  return theme;
}
