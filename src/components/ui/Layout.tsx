import React from "react";
import { RefreshControl, ScrollView, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/src/context/ThemeContext";
import { MAX_CONTENT_WIDTH, radius, spacing } from "@/src/theme/colors";
import { AppText } from "./AppText";

/** Centered, max-width content column (keeps desktop layouts readable). */
export function Container({ children, style, narrow }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; narrow?: boolean }) {
  return <View style={[styles.container, { maxWidth: narrow ? 640 : MAX_CONTENT_WIDTH }, style]}>{children}</View>;
}

export function ScrollScreen({
  children,
  narrow,
  refreshing,
  onRefresh,
  contentStyle,
  testID,
}: {
  children: React.ReactNode;
  narrow?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      testID={testID}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[{ paddingVertical: spacing.lg, flexGrow: 1 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    >
      <Container narrow={narrow}>{children}</Container>
    </ScrollView>
  );
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function SectionHeader({ title, action, subtitle }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? <AppText variant="muted">{subtitle}</AppText> : null}
      </View>
      {action}
    </View>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
  testID,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <AppText variant="subtitle" style={{ fontSize: 15 }}>
          {label}
        </AppText>
        {description ? <AppText variant="muted">{description}</AppText> : null}
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.border }}
        thumbColor="#FFFFFF"
        {...({ activeThumbColor: "#FFFFFF" } as object)}
      />
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm }} />;
}

const styles = StyleSheet.create({
  container: { width: "100%", alignSelf: "center", paddingHorizontal: spacing.lg },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: spacing.md },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
});
