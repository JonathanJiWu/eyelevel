import { MaterialIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/context/ThemeContext";
import { tmdbImage, type PosterSize } from "@/src/lib/images";
import { radius } from "@/src/theme/colors";

export function Poster({
  path,
  title,
  size = "w342",
  style,
  rounded = true,
  fill = false,
}: {
  path: string | null | undefined;
  title: string;
  size?: PosterSize;
  style?: StyleProp<ViewStyle>;
  rounded?: boolean;
  /** Fill the parent (cropping) instead of keeping a 2:3 aspect ratio. */
  fill?: boolean;
}) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = tmdbImage(path, size);
  return (
    <View style={[fill ? styles.fill : styles.frame, { backgroundColor: colors.posterFallback, borderRadius: rounded ? radius.md : 0 }, style]}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          accessibilityLabel={`${title} poster`}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.fallback} accessibilityLabel={`${title} (no poster)`}>
          <MaterialIcons name="movie" size={28} color={colors.textMuted} />
          <AppText variant="caption" center numberOfLines={3} style={{ marginTop: 6, paddingHorizontal: 6 }}>
            {title}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 2 / 3, overflow: "hidden" },
  fill: { width: "100%", height: "100%", overflow: "hidden" },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center" },
});
