import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { EmptyState } from "@/src/components/ui/States";
import { useTheme } from "@/src/context/ThemeContext";

export default function NotFound() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <EmptyState
        icon="explore-off"
        title="This page doesn't exist"
        message="The link may be broken or the page may have moved."
        actionLabel="Go to Discover"
        onAction={() => router.replace("/")}
      />
    </View>
  );
}
