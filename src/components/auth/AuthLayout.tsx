import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "@/src/components/ui/AppText";
import { Card } from "@/src/components/ui/Layout";
import { useTheme } from "@/src/context/ThemeContext";
import { spacing } from "@/src/theme/colors";

/** Only allow in-app paths as post-auth redirects (prevents open redirects). */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return "/";
  if (["/login", "/register", "/forgot-password"].some((p) => value.startsWith(p))) return "/";
  return value;
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <AppText style={[styles.brand, { color: colors.textStrong }]}>
            eye<AppText style={[styles.brand, { color: colors.primary }]}>level</AppText>
          </AppText>
          <Card style={{ gap: spacing.md }}>
            <View style={{ gap: 4, marginBottom: spacing.sm }}>
              <AppText variant="display" accessibilityRole="header">
                {title}
              </AppText>
              {subtitle ? <AppText variant="muted">{subtitle}</AppText> : null}
            </View>
            {children}
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.lg },
  column: { width: "100%", maxWidth: 440, alignSelf: "center", gap: spacing.lg },
  brand: { fontSize: 30, fontWeight: "800", textAlign: "center", letterSpacing: -0.5 },
});
