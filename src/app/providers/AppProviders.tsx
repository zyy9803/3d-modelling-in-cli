import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import type { PaletteMode } from "@mui/material/styles";

import { createAppTheme } from "./theme";

type AppThemeModeContextValue = {
  mode: PaletteMode;
  toggleColorMode: () => void;
};

const AppThemeModeContext = createContext<AppThemeModeContextValue>({
  mode: "light",
  toggleColorMode: () => {},
});

export function AppProviders(props: PropsWithChildren) {
  const [mode, setMode] = useState<PaletteMode>("light");
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const value = useMemo<AppThemeModeContextValue>(
    () => ({
      mode,
      toggleColorMode: () => {
        setMode((current) => (current === "dark" ? "light" : "dark"));
      },
    }),
    [mode],
  );

  useEffect(() => {
    document.documentElement.dataset.muiColorMode = mode;
    document.documentElement.style.colorScheme = mode;

    return () => {
      delete document.documentElement.dataset.muiColorMode;
      document.documentElement.style.removeProperty("color-scheme");
    };
  }, [mode]);

  return (
    <AppThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {props.children}
      </ThemeProvider>
    </AppThemeModeContext.Provider>
  );
}

export function useAppThemeMode(): AppThemeModeContextValue {
  return useContext(AppThemeModeContext);
}
