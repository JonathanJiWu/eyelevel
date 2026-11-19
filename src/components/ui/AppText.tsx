import React from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "@/src/context/ThemeContext";

type Variant = "display" | "title" | "subtitle" | "body" | "label" | "caption" | "muted";

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontSize: 26, fontWeight: "800", letterSpacing: -0.3 },
  title: { fontSize: 20, fontWeight: "700" },
  subtitle: { fontSize: 16, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: "600" },
  caption: { fontSize: 12, lineHeight: 16 },
  muted: { fontSize: 13, lineHeight: 18 },
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  strong?: boolean;
  center?: boolean;
}

export function AppText({ variant = "body", color, strong, center, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const base =
    variant === "display" || variant === "title"
      ? colors.textStrong
      : variant === "muted" || variant === "caption"
        ? colors.textMuted
        : colors.text;
  return (
    <Text
      style={[
        VARIANTS[variant],
        { color: color ?? base },
        strong && { fontWeight: "700" },
        center && { textAlign: "center" },
        style,
      ]}
      {...rest}
    />
  );
}
