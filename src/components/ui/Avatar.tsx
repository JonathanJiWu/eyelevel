import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/src/context/ThemeContext";
import { AppText } from "./AppText";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = Array.from(parts[0])[0] ?? "";
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function Avatar({ name, color, size = 40 }: { name: string; color?: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel={`${name} avatar`}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? colors.primary }]}
    >
      <AppText color="#FFFFFF" style={{ fontSize: size * 0.4, fontWeight: "700" }}>
        {initials(name)}
      </AppText>
    </View>
  );
}

/** Overlapping avatars, e.g. "friends who saved this". */
export function AvatarStack({ people, size = 28, max = 4 }: { people: { name: string; color?: string }[]; size?: number; max?: number }) {
  const { colors } = useTheme();
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View style={styles.stack}>
      {shown.map((p, i) => (
        <View key={`${p.name}-${i}`} style={{ marginLeft: i === 0 ? 0 : -size * 0.3, borderRadius: size, borderWidth: 2, borderColor: colors.background }}>
          <Avatar name={p.name} color={p.color} size={size} />
        </View>
      ))}
      {extra > 0 ? (
        <AppText variant="caption" style={{ marginLeft: 6 }}>
          +{extra}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  stack: { flexDirection: "row", alignItems: "center" },
});
