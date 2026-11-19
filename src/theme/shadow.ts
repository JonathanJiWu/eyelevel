import { Platform, type ViewStyle } from "react-native";

/** Cross-platform drop shadow (react-native-web prefers boxShadow). */
export function shadow(level: "sm" | "md" | "lg" = "md"): ViewStyle {
  const spec = { sm: { y: 2, blur: 6, opacity: 0.2, elevation: 3 }, md: { y: 4, blur: 12, opacity: 0.25, elevation: 6 }, lg: { y: 8, blur: 16, opacity: 0.3, elevation: 12 } }[level];
  if (Platform.OS === "web") {
    return { boxShadow: `0px ${spec.y}px ${spec.blur * 2}px rgba(0,0,0,${spec.opacity})` } as ViewStyle;
  }
  return { shadowColor: "#000", shadowOpacity: spec.opacity, shadowRadius: spec.blur, shadowOffset: { width: 0, height: spec.y }, elevation: spec.elevation };
}
