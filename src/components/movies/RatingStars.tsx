import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/context/ThemeContext";

/** 1–5 star rating. Tap the current rating again to clear it. */
export function RatingStars({
  value,
  onChange,
  size = 26,
  disabled,
}: {
  value: number | null;
  onChange?: (value: number | null) => void;
  size?: number;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessibilityRole={onChange ? "adjustable" : "image"} accessibilityLabel={value ? `Rated ${value} of 5` : "Not rated"}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = value !== null && star <= value;
        const icon = <MaterialIcons name={filled ? "star" : "star-border"} size={size} color={filled ? colors.star : colors.textMuted} />;
        if (!onChange) return <View key={star}>{icon}</View>;
        return (
          <Pressable
            key={star}
            testID={`rate-${star}`}
            accessibilityRole="button"
            accessibilityLabel={value === star ? `Clear rating` : `Rate ${star} star${star > 1 ? "s" : ""}`}
            disabled={disabled}
            hitSlop={4}
            onPress={() => onChange(value === star ? null : star)}
          >
            {icon}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Compact TMDB review score badge (0–10), shown on posters. */
export function ScoreBadge({ score }: { score: number }) {
  const { colors } = useTheme();
  if (!score) return null;
  return (
    <View style={styles.badge} accessibilityLabel={`TMDB score ${score.toFixed(1)} out of 10`}>
      <MaterialIcons name="star" size={11} color={colors.star} />
      <AppText style={styles.badgeText} color="#FFFFFF">
        {score.toFixed(1)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 2 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
});
