import { MaterialIcons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Image, Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import { MovieCard } from "@/src/components/movies/MovieCard";
import { Poster } from "@/src/components/movies/Poster";
import { RatingStars } from "@/src/components/movies/RatingStars";
import { AppText } from "@/src/components/ui/AppText";
import { AvatarStack } from "@/src/components/ui/Avatar";
import { Button } from "@/src/components/ui/Button";
import { Chip, ChipRow } from "@/src/components/ui/Chip";
import { Card, Container } from "@/src/components/ui/Layout";
import { ErrorState, LoadingState } from "@/src/components/ui/States";
import { snapshotFromMovie } from "@/src/data/library";
import { useAuth } from "@/src/context/AuthContext";
import { useFeedback } from "@/src/context/FeedbackContext";
import { useLibrary } from "@/src/context/LibraryContext";
import { useReferenceData } from "@/src/context/ReferenceDataContext";
import { useSaveMovie } from "@/src/context/SaveMovieContext";
import { useSocial } from "@/src/context/SocialContext";
import { useTheme } from "@/src/context/ThemeContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { ApiError, moviesApi } from "@/src/lib/api";
import { friendlyError } from "@/src/lib/errors";
import { tmdbImage } from "@/src/lib/images";
import { radius, spacing } from "@/src/theme/colors";
import type { MovieDetails } from "@/src/types/movies";

function formatRuntime(minutes: number | null) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function formatMoney(value: number | null) {
  if (!value) return null;
  return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(value >= 100_000_000 ? 0 : 1)}M` : `$${value.toLocaleString()}`;
}

function formatDate(date: string | null) {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export default function MovieScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const valid = Number.isInteger(id) && id > 0;
  const router = useRouter();
  const { colors, hydrated } = useTheme();
  const { isWide, columns, contentWidth } = useResponsive();
  const { user, waitForAuth } = useAuth();
  const library = useLibrary();
  const social = useSocial();
  const { openPicker, quickSave, savingId } = useSaveMovie();
  const { toast } = useFeedback();
  const { languageName } = useReferenceData();
  const [movie, setMovie] = useState<MovieDetails | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<"watched" | "rating" | null>(null);

  useEffect(() => {
    if (!valid || typeof window === "undefined") return;
    const controller = new AbortController();
    setMovie(null);
    setError(null);
    moviesApi
      .details(id, controller.signal)
      .then(setMovie)
      .catch((e) => {
        if (controller.signal.aborted || e?.name === "AbortError") return;
        setError({ message: friendlyError(e, "We couldn't load this movie."), notFound: e instanceof ApiError && e.status === 404 });
      });
    return () => controller.abort();
  }, [id, valid, attempt]);

  // Statically rendered HTML for /movie/[id] is a template (the id is only
  // known in the browser), so render the loading state until hydrated.
  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <LoadingState label="Loading movie…" />
      </View>
    );
  }
  if (!valid) {
    return <ErrorState title="Movie not found" message="That link doesn't point to a valid movie." />;
  }
  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: error.notFound ? "Not found" : "Movie" }} />
        <ErrorState
          title={error.notFound ? "Movie not found" : "Couldn't load this movie"}
          message={error.notFound ? "It may have been removed from the movie database." : error.message}
          onRetry={error.notFound ? undefined : () => setAttempt((n) => n + 1)}
        />
      </View>
    );
  }
  if (!movie) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <LoadingState label="Loading movie…" />
      </View>
    );
  }

  const snapshot = snapshotFromMovie(movie);
  const entry = library.entryFor(movie.id);
  const saved = library.isSaved(movie.id);
  const listNames = (entry?.listIds ?? []).map((lid) => library.lists.find((l) => l.id === lid)?.name).filter((n): n is string => Boolean(n));
  const friendSaves = user ? social.friendsWhoSaved(movie.id) : [];
  const backdrop = tmdbImage(movie.backdropPath, "w1280");
  const facts = [
    movie.year ? String(movie.year) : null,
    movie.certification,
    formatRuntime(movie.runtime),
    movie.originalLanguage ? languageName(movie.originalLanguage) : null,
  ].filter(Boolean);
  const posterWidth = isWide ? 300 : Math.min(220, contentWidth * 0.55);
  const recColumns = columns(140, 6);
  const recWidth = Math.floor((contentWidth - 12 * (recColumns - 1)) / recColumns);

  const requireUser = async () => {
    if (!(await waitForAuth())) {
      router.push({ pathname: "/login", params: { redirect: `/movie/${movie.id}` } });
      return false;
    }
    return true;
  };

  const toggleWatched = async () => {
    if (!(await requireUser())) return;
    setBusy("watched");
    try {
      await library.setWatched(snapshot, !entry?.watched);
      toast(entry?.watched ? "Marked as not watched" : "Marked as watched");
    } catch (e) {
      toast(friendlyError(e), { type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const rate = async (value: number | null) => {
    if (!(await requireUser())) return;
    setBusy("rating");
    try {
      await library.setRating(snapshot, value);
      toast(value ? `Rated ${value} star${value > 1 ? "s" : ""}` : "Rating cleared");
    } catch (e) {
      toast(friendlyError(e), { type: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 48 }} testID="movie-detail">
      <Stack.Screen options={{ title: movie.title }} />
      {backdrop ? (
        <View style={styles.backdropWrap}>
          <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} />
        </View>
      ) : null}
      <Container style={{ marginTop: backdrop ? -120 : spacing.lg }}>
        <View style={[styles.hero, isWide && { flexDirection: "row", alignItems: "flex-start" }]}>
          <View style={{ width: posterWidth, alignSelf: isWide ? "flex-start" : "center" }}>
            <Poster path={movie.posterPath} title={movie.title} size="w500" />
          </View>
          <View style={{ flex: 1, gap: spacing.md, marginTop: isWide && backdrop ? 120 : 0 }}>
            <View>
              <AppText variant="display" testID="movie-title">
                {movie.title}
              </AppText>
              {movie.originalTitle ? <AppText variant="muted">{movie.originalTitle}</AppText> : null}
              {movie.tagline ? (
                <AppText variant="muted" style={{ fontStyle: "italic", marginTop: 4 }}>
                  {movie.tagline}
                </AppText>
              ) : null}
            </View>
            <AppText variant="muted">{facts.join("  ·  ")}</AppText>
            <View style={styles.scoreRow}>
              <MaterialIcons name="star" size={20} color={colors.star} />
              <AppText variant="subtitle">{movie.voteAverage ? movie.voteAverage.toFixed(1) : "—"}</AppText>
              <AppText variant="muted">
                /10 on TMDB{movie.voteCount ? ` · ${movie.voteCount.toLocaleString()} votes` : ""}
              </AppText>
            </View>
            {movie.genres.length ? (
              <ChipRow>
                {movie.genres.map((g) => (
                  <Chip key={g.id} label={g.name} onPress={() => router.dismissTo({ pathname: "/", params: { genres: String(g.id) } })} />
                ))}
              </ChipRow>
            ) : null}

            <View style={styles.actions}>
              <Button
                title={saved ? `In ${listNames.length} list${listNames.length === 1 ? "" : "s"}` : "Add to watchlist"}
                icon={saved ? "bookmark-added" : "bookmark-add"}
                variant={saved ? "secondary" : "primary"}
                loading={savingId === movie.id}
                onPress={() => (saved ? openPicker(snapshot) : quickSave(snapshot))}
                testID="save-movie"
              />
              <Button title="Choose lists" icon="playlist-add" variant="outline" onPress={() => openPicker(snapshot)} testID="choose-lists" />
              <Button
                title={entry?.watched ? "Watched" : "Mark watched"}
                icon={entry?.watched ? "check-circle" : "radio-button-unchecked"}
                variant={entry?.watched ? "secondary" : "outline"}
                loading={busy === "watched"}
                onPress={toggleWatched}
                testID="toggle-watched"
              />
            </View>
            {listNames.length ? <AppText variant="caption">Saved in: {listNames.join(", ")}</AppText> : null}

            <View style={{ gap: 4 }}>
              <AppText variant="label">Your rating</AppText>
              <RatingStars value={entry?.rating ?? null} onChange={rate} disabled={busy === "rating"} />
            </View>

            {friendSaves.length ? (
              <Card testID="friends-who-saved">
                <View style={styles.friendsHeader}>
                  <AvatarStack people={friendSaves.map((s) => ({ name: s.friend.profile?.displayName ?? "Friend", color: s.friend.profile?.avatarColor }))} />
                  <AppText variant="subtitle" style={{ flex: 1 }}>
                    {friendSaves.length === 1 ? "1 friend has this" : `${friendSaves.length} friends have this`}
                  </AppText>
                </View>
                {friendSaves.map((s) => (
                  <AppText key={s.friend.uid} variant="muted" style={{ marginTop: 6 }}>
                    <AppText variant="label">{s.friend.profile?.displayName ?? "Friend"}</AppText>
                    {s.listNames.length ? ` · in ${s.listNames.join(", ")}` : ""}
                    {s.watched ? " · watched" : ""}
                    {s.rating ? ` · rated ${"★".repeat(s.rating)}` : ""}
                  </AppText>
                ))}
              </Card>
            ) : null}

            {movie.overview ? (
              <View style={{ gap: 6 }}>
                <AppText variant="subtitle">Overview</AppText>
                <AppText>{movie.overview}</AppText>
              </View>
            ) : (
              <AppText variant="muted">No overview available.</AppText>
            )}

            <View style={styles.factsGrid}>
              <Fact label="Director" value={movie.directors.join(", ")} />
              <Fact label="Writers" value={movie.writers.join(", ")} />
              <Fact label="Released" value={formatDate(movie.releaseDate)} />
              <Fact label="Status" value={movie.status} />
              <Fact label="Languages" value={movie.spokenLanguages.join(", ")} />
              <Fact label="Countries" value={movie.productionCountries.join(", ")} />
              <Fact label="Budget" value={formatMoney(movie.budget)} />
              <Fact label="Box office" value={formatMoney(movie.revenue)} />
            </View>

            <View style={styles.actions}>
              {movie.trailer ? (
                <Button
                  title="Watch trailer"
                  icon="play-circle-outline"
                  variant="secondary"
                  onPress={() =>
                    Linking.openURL(
                      movie.trailer!.site === "YouTube" ? `https://www.youtube.com/watch?v=${movie.trailer!.key}` : `https://vimeo.com/${movie.trailer!.key}`,
                    )
                  }
                />
              ) : null}
              {movie.imdbId ? (
                <Button title="IMDb" icon="open-in-new" variant="ghost" onPress={() => Linking.openURL(`https://www.imdb.com/title/${movie.imdbId}/`)} />
              ) : null}
            </View>
          </View>
        </View>

        {movie.cast.length ? (
          <View style={styles.section}>
            <AppText variant="title" accessibilityRole="header">
              Cast
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {movie.cast.map((c) => (
                <View key={c.id} style={{ width: 96 }}>
                  <View style={[styles.castPhoto, { backgroundColor: colors.posterFallback }]}>
                    {c.profilePath ? (
                      <Image source={{ uri: tmdbImage(c.profilePath, "w185")! }} style={StyleSheet.absoluteFill} accessibilityLabel={c.name} />
                    ) : (
                      <MaterialIcons name="person" size={36} color={colors.textMuted} />
                    )}
                  </View>
                  <AppText variant="label" numberOfLines={2} style={{ marginTop: 6 }}>
                    {c.name}
                  </AppText>
                  {c.character ? (
                    <AppText variant="caption" numberOfLines={2}>
                      {c.character}
                    </AppText>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {movie.recommendations.length ? (
          <View style={styles.section}>
            <AppText variant="title" accessibilityRole="header">
              More like this
            </AppText>
            <View style={styles.recGrid}>
              {movie.recommendations.slice(0, recColumns * 2).map((m) => (
                <MovieCard
                  key={m.id}
                  movie={m}
                  width={recWidth}
                  onPress={() => router.push({ pathname: "/movie/[id]", params: { id: String(m.id) } })}
                  saved={library.isSaved(m.id)}
                  busy={savingId === m.id}
                  onQuickAdd={() => quickSave(snapshotFromMovie(m))}
                />
              ))}
            </View>
          </View>
        ) : null}
        <AppText variant="caption" style={{ marginTop: spacing.xl }}>
          Movie data and images from TMDB.{Platform.OS === "web" ? " This product uses the TMDB API but is not endorsed or certified by TMDB." : ""}
        </AppText>
      </Container>
    </ScrollView>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <AppText variant="caption">{label}</AppText>
      <AppText variant="label">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdropWrap: { height: 280, width: "100%", overflow: "hidden" },
  hero: { gap: spacing.xl },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  friendsHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  factsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  fact: { minWidth: 140, flexGrow: 1, flexBasis: 160, gap: 2 },
  section: { marginTop: spacing.xxl, gap: spacing.md },
  castPhoto: { width: 96, height: 128, borderRadius: radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  recGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
