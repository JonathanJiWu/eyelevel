import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform, useColorScheme } from "react-native";
import { palettes, type Palette } from "@/src/theme/colors";

export type ThemeMode = "system" | "light" | "dark";
const STORAGE_KEY = "eyelevel.themeMode";

interface ThemeValue {
  /** False during static rendering and the first client render (hydration). */
  hydrated: boolean;
  mode: ThemeMode;
  scheme: "light" | "dark";
  isDark: boolean;
  colors: Palette;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  // Render dark on the server and during the first client render so the
  // statically rendered HTML and hydration match; switch after mount.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") setModeState(stored);
      })
      .catch(() => undefined);
  }, []);

  // Marks the page as interactive once the post-hydration render (real window
  // size, theme) has been committed. Tests wait for this attribute.
  useEffect(() => {
    if (mounted && Platform.OS === "web" && typeof document !== "undefined") document.documentElement.dataset.hydrated = "true";
  }, [mounted]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const scheme: "light" | "dark" = !mounted ? "dark" : mode === "system" ? (system === "light" ? "light" : "dark") : mode;

  const toggle = useCallback(() => setMode(scheme === "dark" ? "light" : "dark"), [scheme, setMode]);

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.style.colorScheme = scheme;
      document.body.style.backgroundColor = palettes[scheme].background;
    }
  }, [scheme]);

  const value = useMemo<ThemeValue>(
    () => ({ hydrated: mounted, mode, scheme, isDark: scheme === "dark", colors: palettes[scheme], setMode, toggle }),
    [mounted, mode, scheme, setMode, toggle],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
