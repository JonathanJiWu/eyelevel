import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/src/context/ThemeContext";
import { radius } from "@/src/theme/colors";
import { AppText } from "./AppText";

export type IconName = React.ComponentProps<typeof MaterialIcons>["name"];
type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";

export interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  title: string;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  variant = "primary",
  size = "md",
  icon,
  loading,
  disabled,
  fullWidth,
  style,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.primaryText, border: colors.primary },
    secondary: { bg: colors.surfaceAlt, fg: colors.textStrong, border: colors.surfaceAlt },
    ghost: { bg: "transparent", fg: colors.primary, border: "transparent" },
    outline: { bg: "transparent", fg: colors.text, border: colors.border },
    danger: { bg: colors.danger, fg: "#FFFFFF", border: colors.danger },
  };
  const p = palette[variant];
  const isDisabled = disabled || loading;
  const height = size === "sm" ? 34 : size === "lg" ? 50 : 42;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.base,
        {
          height,
          paddingHorizontal: size === "sm" ? 12 : 18,
          backgroundColor: p.bg,
          borderColor: p.border,
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : hovered ? 0.92 : 1,
        },
        fullWidth && { alignSelf: "stretch" },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <MaterialIcons name={icon} size={size === "sm" ? 16 : 18} color={p.fg} /> : null}
          <AppText variant={size === "sm" ? "label" : "subtitle"} color={p.fg} style={{ fontSize: size === "sm" ? 13 : 15 }}>
            {title}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

export interface IconButtonProps extends Omit<PressableProps, "style" | "children"> {
  icon: IconName;
  label: string;
  size?: number;
  color?: string;
  background?: string;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({ icon, label, size = 22, color, background, style, disabled, ...rest }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      disabled={disabled}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.icon,
        { width: size + 16, height: size + 16, backgroundColor: background ?? (hovered ? colors.primarySoft : "transparent") },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
      {...rest}
    >
      <MaterialIcons name={icon} size={size} color={color ?? colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
});
