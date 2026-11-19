import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/src/context/ThemeContext";
import { radius } from "@/src/theme/colors";
import { AppText } from "./AppText";
import { Button, type IconName } from "./Button";

export function LoadingState({ label = "Loading…", style }: { label?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, style]} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText variant="muted" style={{ marginTop: 12 }}>
        {label}
      </AppText>
    </View>
  );
}

export function EmptyState({
  icon = "movie-filter",
  title,
  message,
  actionLabel,
  onAction,
  style,
  testID,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, style]} testID={testID}>
      <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
        <MaterialIcons name={icon} size={30} color={colors.primary} />
      </View>
      <AppText variant="subtitle" center style={{ marginTop: 12 }}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="muted" center style={{ marginTop: 6, maxWidth: 420 }}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} style={{ marginTop: 16 }} /> : null}
    </View>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  style,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, style]} accessibilityRole="alert">
      <View style={[styles.iconCircle, { backgroundColor: colors.dangerSoft }]}>
        <MaterialIcons name="error-outline" size={30} color={colors.danger} />
      </View>
      <AppText variant="subtitle" center style={{ marginTop: 12 }}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="muted" center style={{ marginTop: 6, maxWidth: 420 }}>
          {message}
        </AppText>
      ) : null}
      {onRetry ? <Button title="Try again" icon="refresh" variant="secondary" onPress={onRetry} style={{ marginTop: 16 }} /> : null}
    </View>
  );
}

export function Notice({ tone = "info", children, icon }: { tone?: "info" | "warning" | "danger" | "success"; children: React.ReactNode; icon?: IconName }) {
  const { colors } = useTheme();
  const map = {
    info: { bg: colors.primarySoft, fg: colors.primary, icon: "info-outline" as IconName },
    warning: { bg: colors.primarySoft, fg: colors.warning, icon: "warning-amber" as IconName },
    danger: { bg: colors.dangerSoft, fg: colors.danger, icon: "error-outline" as IconName },
    success: { bg: colors.successSoft, fg: colors.success, icon: "check-circle-outline" as IconName },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: map.bg }]} accessibilityRole={tone === "danger" ? "alert" : undefined}>
      <MaterialIcons name={icon ?? map.icon} size={18} color={map.fg} />
      <View style={{ flex: 1 }}>{typeof children === "string" ? <AppText variant="muted" color={colors.text}>{children}</AppText> : children}</View>
    </View>
  );
}

export function Skeleton({ width, height, style }: { width?: number | `${number}%`; height: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ width: width ?? "100%", height, borderRadius: radius.sm, backgroundColor: colors.skeleton }, style]} />;
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", padding: 32, flexGrow: 1 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  notice: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 12, borderRadius: radius.md },
});
