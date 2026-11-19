import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { RequireAccount } from "@/src/components/AppChrome";
import { MovieCard } from "@/src/components/movies/MovieCard";
import { AppText } from "@/src/components/ui/AppText";
import { AvatarStack } from "@/src/components/ui/Avatar";
import { Chip, ChipRow, Segmented } from "@/src/components/ui/Chip";
import { Card, ScrollScreen } from "@/src/components/ui/Layout";
import { EmptyState, LoadingState, Notice } from "@/src/components/ui/States";
import { useAuth } from "@/src/context/AuthContext";
import { useLibrary } from "@/src/context/LibraryContext";
import { useSaveMovie } from "@/src/context/SaveMovieContext";
import { useSocial } from "@/src/context/SocialContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { cleanSearchParams } from "@/src/lib/params";
import { compareParticipants, participantFromLibrary, participantFromSharedIndex, type OverlapMovie } from "@/src/lib/compare";
import { spacing } from "@/src/theme/colors";

type Tab = "everyone" | "some" | "mine" | "theirs" | "watched" | "ratings";

export default function CompareScreen() {
  return (
    <ScrollScreen testID="compare-screen">
      <RequireAccount icon="compare-arrows" title="Compare watchlists" message="Sign in and add friends to compare what you all want to watch.">
        <CompareContent />
      </RequireAccount>
    </ScrollScreen>
  );
}

function CompareContent() {
  const params = cleanSearchParams(useLocalSearchParams<{ with?: string }>());
  const router = useRouter();
  const { user, profile } = useAuth();
  const social = useSocial();
  const library = useLibrary();
  const { quickSave, savingId } = useSaveMovie();
  const { columns, contentWidth } = useResponsive();
  const initial = typeof params.with === "string" ? params.with.split(",").filter(Boolean) : [];
  const [selected, setSelected] = useState<string[]>(initial);
  const [tab, setTab] = useState<Tab>("everyone");

  const chosen = social.friends.filter((f) => selected.includes(f.uid));
  const participants = useMemo(() => {
    if (!user) return [];
    return [
      participantFromLibrary(user.uid, profile?.displayName ?? "You", library.library),
      ...chosen.map((f) => participantFromSharedIndex(f.uid, f.profile?.displayName ?? "Friend", f.index)),
    ];
  }, [user, profile, library.library, chosen]);
  const result = useMemo(() => compareParticipants(participants), [participants]);
  const names = useMemo(() => new Map(participants.map((p) => [p.uid, p.uid === user?.uid ? "You" : p.name])), [participants, user]);
  const colorsByUid = useMemo(
    () => new Map([[user?.uid ?? "", profile?.avatarColor], ...chosen.map((f) => [f.uid, f.profile?.avatarColor] as const)]),
    [user, profile, chosen],
  );

  if (!social.ready || !library.ready) return <LoadingState />;
  if (social.friends.length === 0) {
    return <EmptyState icon="person-add" title="Add friends to compare" message="Once someone accepts your friend request you can compare watchlists here." actionLabel="Find friends" onAction={() => router.dismissTo("/friends")} />;
  }

  const pairwise = chosen.length === 1;
  const toggle = (uid: string) => {
    const next = selected.includes(uid) ? selected.filter((s) => s !== uid) : [...selected, uid];
    setSelected(next);
    router.setParams({ with: next.length ? next.join(",") : undefined });
    if (next.length !== 1 && (tab === "mine" || tab === "theirs")) setTab("everyone");
  };

  const options: { value: Tab; label: string; count: number }[] = [
    { value: "everyone", label: pairwise ? "Both want" : "Everyone wants", count: result.everyone.length },
    ...(!pairwise && chosen.length > 1 ? [{ value: "some" as Tab, label: "Some overlap", count: result.some.length }] : []),
    ...(pairwise
      ? [
          { value: "mine" as Tab, label: "Only you", count: result.onlyMine.length },
          { value: "theirs" as Tab, label: `Only ${chosen[0].profile?.displayName ?? "them"}`, count: result.onlyTheirs.length },
        ]
      : []),
    { value: "watched", label: "Watched together", count: result.watchedTogether.length },
    { value: "ratings", label: "Ratings", count: result.ratedByBoth.length },
  ];

  const movies: OverlapMovie[] =
    tab === "everyone"
      ? result.everyone
      : tab === "some"
        ? result.some
        : tab === "mine"
          ? result.onlyMine
          : tab === "theirs"
            ? result.onlyTheirs
            : tab === "watched"
              ? result.watchedTogether
              : result.ratedByBoth;

  const cols = columns(140, 6);
  const width = Math.floor((contentWidth - 12 * (cols - 1)) / cols);
  const noShared = chosen.filter((f) => !f.index || Object.keys(f.index.movies).length === 0);

  return (
    <View style={{ gap: spacing.lg }}>
      <Card>
        <AppText variant="subtitle">Compare with</AppText>
        <AppText variant="caption" style={{ marginBottom: spacing.sm }}>
          Pick one friend for a side-by-side, or several to find something everyone wants to watch. Only lists your friends share are used.
        </AppText>
        <ChipRow>
          {social.friends.map((f) => (
            <Chip key={f.uid} label={f.profile?.displayName ?? "Friend"} selected={selected.includes(f.uid)} onPress={() => toggle(f.uid)} testID={`pick-${f.profile?.username ?? f.uid}`} />
          ))}
        </ChipRow>
      </Card>

      {chosen.length === 0 ? (
        <EmptyState icon="touch-app" title="Choose at least one friend" />
      ) : (
        <>
          <View style={styles.summary} testID="compare-summary">
            <AvatarStack people={participants.map((p) => ({ name: names.get(p.uid) ?? "", color: colorsByUid.get(p.uid) }))} size={34} />
            <View style={{ flex: 1 }}>
              <AppText variant="title" testID="match-score">
                {result.matchScore}% match
              </AppText>
              <AppText variant="caption">
                {result.everyone.length} movie{result.everyone.length === 1 ? "" : "s"} on everyone's lists
              </AppText>
            </View>
          </View>
          {noShared.length ? (
            <Notice>{noShared.map((f) => f.profile?.displayName ?? "A friend").join(", ")} hasn't shared any lists yet, so there's nothing to compare from them.</Notice>
          ) : null}
          <Segmented value={tab} onChange={setTab} options={options} testID="compare-tabs" />
          {movies.length === 0 ? (
            <EmptyState icon="movie-filter" title="Nothing here yet" message={tab === "everyone" ? "Add a few more movies to your lists — overlaps will show up here." : undefined} />
          ) : (
            <View style={styles.grid} testID="compare-results">
              {movies.map((m) => (
                <MovieCard
                  key={m.movieId}
                  width={width}
                  movie={{ id: m.movieId, title: m.title, posterPath: m.posterPath, year: m.year }}
                  onPress={() => router.push({ pathname: "/movie/[id]", params: { id: String(m.movieId) } })}
                  saved={library.isSaved(m.movieId)}
                  busy={savingId === m.movieId}
                  onQuickAdd={() =>
                    quickSave({ movieId: m.movieId, title: m.title, posterPath: m.posterPath, releaseDate: null, year: m.year, genreIds: [], voteAverage: 0, originalLanguage: null })
                  }
                  footnote={
                    tab === "ratings"
                      ? Object.entries(m.ratings)
                          .map(([uid, r]) => `${names.get(uid) ?? "?"} ${r}★`)
                          .join(" · ")
                      : tab === "watched"
                        ? `Watched by ${m.watchedBy.map((u) => names.get(u)).join(", ")}`
                        : `Saved by ${m.savedBy.map((u) => names.get(u)).join(", ")}`
                  }
                />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
