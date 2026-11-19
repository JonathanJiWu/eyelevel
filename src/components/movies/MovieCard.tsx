import { MaterialIcons } from "@expo/vector-icons";
import React, { memo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/context/ThemeContext";
import { radius } from "@/src/theme/colors";
import { Poster } from "./Poster";
import { ScoreBadge } from "./RatingStars";

export interface CardMovie {
  id: number;
  title: string;
  posterPath: string | null;
  year: number | null;
  voteAverage?: number;
}

export interface MovieCardProps {
  movie: CardMovie;
  width: number;
  onPress: () => void;
  saved?: boolean;
  busy?: boolean;
  onQuickAdd?: () => void;
  /** Optional line under the title, e.g. "Saved by 3 friends". */
  footnote?: string;
  badge?: React.ReactNode;
}

function MovieCardBase({ movie, width, onPress, saved, busy, onQuickAdd, footnote, badge }: MovieCardProps) {
  const { colors } = useTheme();
  return (
    <View style={{ width }} testID={`movie-card-${movie.id}`}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${movie.title}${movie.year ? `, ${movie.year}` : ""}`}
        onPress={onPress}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          { opacity: pressed ? 0.85 : 1, transform: [{ scale: hovered ? 1.02 : 1 }] },
        ]}
      >
        <View>
          <Poster path={movie.posterPath} title={movie.title} />
          <View style={[styles.topRow, { pointerEvents: "none" }]}>
            {movie.voteAverage ? <ScoreBadge score={movie.voteAverage} /> : <View />}
          </View>
          {badge ? <View style={styles.bottomLeft}>{badge}</View> : null}
        </View>
        <AppText variant="label" numberOfLines={2} style={styles.title}>
          {movie.title}
        </AppText>
        <AppText variant="caption">{movie.year ?? "—"}</AppText>
        {footnote ? (
          <AppText variant="caption" color={colors.primary} numberOfLines={1}>
            {footnote}
          </AppText>
        ) : null}
      </Pressable>
      {onQuickAdd ? (
        <Pressable
          testID={`quick-add-${movie.id}`}
          accessibilityRole="button"
          accessibilityLabel={saved ? `${movie.title} is in your lists. Edit lists` : `Add ${movie.title} to watchlist`}
          onPress={onQuickAdd}
          disabled={busy}
          hitSlop={6}
          style={[styles.quickAdd, { backgroundColor: saved ? colors.primary : "rgba(0,0,0,0.65)" }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialIcons name={saved ? "bookmark-added" : "bookmark-add"} size={20} color="#FFFFFF" />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export const MovieCard = memo(MovieCardBase);

const styles = StyleSheet.create({
  topRow: { position: "absolute", top: 6, left: 6, right: 44, flexDirection: "row" },
  bottomLeft: { position: "absolute", bottom: 6, left: 6 },
  title: { marginTop: 6 },
  quickAdd: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
