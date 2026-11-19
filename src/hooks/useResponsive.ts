import { useWindowDimensions } from "react-native";
import { useTheme } from "@/src/context/ThemeContext";
import { MAX_CONTENT_WIDTH } from "@/src/theme/colors";

/**
 * The server has no window, so static HTML is rendered for a fixed default
 * size and the real size is used only after hydration. Rendering the same
 * layout on the server and in the first client render avoids React
 * hydration mismatches.
 */
const SSR_SIZE = { width: 1024, height: 768 };

export function useResponsive() {
  const window = useWindowDimensions();
  const { hydrated } = useTheme();
  const { width, height } = hydrated && window.width > 0 ? window : SSR_SIZE;
  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH) - 32;
  return {
    width,
    height,
    contentWidth,
    isPhone: width < 600,
    isTablet: width >= 600 && width < 1024,
    isDesktop: width >= 1024,
    isWide: width >= 900,
    /** Number of grid columns so each tile is at least `minTile` wide. */
    columns: (minTile: number, max = 8) => Math.max(2, Math.min(max, Math.floor((contentWidth + 12) / (minTile + 12)))),
  };
}
