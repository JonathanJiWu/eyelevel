/**
 * Color tokens. Preserves eyelevel's original identity: a #121212 dark mode
 * with #1E88E5 accents, and a light mode built on the indigo palette
 * (#1A237E titles, #5C6BC0 buttons, #E8EAF6 surfaces, #DB4437 destructive).
 */
export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textStrong: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  primarySoft: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  star: string;
  overlay: string;
  tabBar: string;
  tabActive: string;
  tabInactive: string;
  input: string;
  skeleton: string;
  posterFallback: string;
}

export const palettes: Record<"light" | "dark", Palette> = {
  dark: {
    background: "#121212",
    surface: "#1E1E1E",
    surfaceAlt: "#232838",
    border: "#2F2F35",
    text: "#E0E0E0",
    textStrong: "#FFFFFF",
    textMuted: "#A0A4AB",
    primary: "#1E88E5",
    primaryText: "#FFFFFF",
    primarySoft: "rgba(30,136,229,0.18)",
    danger: "#EF5350",
    dangerSoft: "rgba(239,83,80,0.16)",
    success: "#66BB6A",
    successSoft: "rgba(102,187,106,0.16)",
    warning: "#FFB74D",
    star: "#FFC107",
    overlay: "rgba(0,0,0,0.65)",
    tabBar: "#121212",
    tabActive: "#1E88E5",
    tabInactive: "#8A8A8A",
    input: "#1A1A1A",
    skeleton: "#2A2A2E",
    posterFallback: "#2B2F3A",
  },
  light: {
    background: "#FAFAFA",
    surface: "#FFFFFF",
    surfaceAlt: "#E8EAF6",
    border: "#DFE2EC",
    text: "#3C4858",
    textStrong: "#1A237E",
    textMuted: "#5F6877",
    primary: "#5C6BC0",
    primaryText: "#FFFFFF",
    primarySoft: "rgba(92,107,192,0.14)",
    danger: "#DB4437",
    dangerSoft: "rgba(219,68,55,0.10)",
    success: "#2E7D32",
    successSoft: "rgba(46,125,50,0.10)",
    warning: "#9A5B00",
    star: "#E09B00",
    overlay: "rgba(0,0,0,0.45)",
    tabBar: "#FFFFFF",
    tabActive: "#3949AB",
    tabInactive: "#666666",
    input: "#FFFFFF",
    skeleton: "#E6E8EF",
    posterFallback: "#D9DDEB",
  },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;
export const MAX_CONTENT_WIDTH = 1200;
