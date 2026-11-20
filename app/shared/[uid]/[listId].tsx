import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { View } from "react-native";
import { RequireAccount } from "@/src/components/AppChrome";
import { MovieCard } from "@/src/components/movies/MovieCard";
import { AppText } from "@/src/components/ui/AppText";
import { ScrollScreen } from "@/src/components/ui/Layout";
import { EmptyState, LoadingState } from "@/src/components/ui/States";
import { useLibrary } from "@/src/context/LibraryContext";
import { useSaveMovie } from "@/src/context/SaveMovieContext";
import { useSocial } from "@/src/context/SocialContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { spacing } from "@/src/theme/colors";

export default function SharedListScreen() {
  return (
    <ScrollScreen>
      <RequireAccount title="Sign in to see shared lists" message="Shared lists are only visible to friends.">
        <SharedListContent />
      </RequireAccount>
    </ScrollScreen>
  );
}

function SharedListContent() {
  const { uid, listId } = useLocalSearchParams<{ uid: string; listId: string }>();
  const social = useSocial();
  const library = useLibrary();
  const { quickSave, savingId } = useSaveMovie();
  const router = useRouter();
  const { columns, contentWidth } = useResponsive();
  const friend = uid ? social.friend(uid) : undefined;
  const list = friend?.index?.lists?.[listId ?? ""];
  const movies = useMemo(
    () =>
      Object.entries(friend?.index?.movies ?? {})
        .filter(([, m]) => (m.l ?? []).includes(listId ?? ""))
        .map(([id, m]) => ({ id: Number(id), ...m }))
        .sort((a, b) => a.t.localeCompare(b.t)),
    [friend, listId],
  );
  const cols = columns(140, 6);
  const width = Math.floor((contentWidth - 12 * (cols - 1)) / cols);

  if (!social.ready || (friend && !friend.indexLoaded)) return <LoadingState />;
  if (!friend) {
    return <EmptyState icon="lock" title="Only friends can see this list" message="Send a friend request to see what they're sharing." />;
  }
  if (!list) return <EmptyState icon="visibility-off" title="List not available" message="It may have been made private or deleted." />;
  const name = friend.profile?.displayName ?? "Friend";
  const inCommon = movies.filter((m) => library.isSaved(m.id)).length;

  return (
    <View style={{ gap: spacing.lg }} testID="shared-list">
      <Stack.Screen options={{ title: `${name}: ${list.n}` }} />
      <View style={{ gap: 4 }}>
        <AppText variant="display">{list.n}</AppText>
        <AppText variant="muted">
          {name}&apos;s list · {movies.length} movie{movies.length === 1 ? "" : "s"} · {inCommon} also in your lists
        </AppText>
        {list.d ? <AppText>{list.d}</AppText> : null}
      </View>
      {movies.length === 0 ? (
        <EmptyState icon="movie-filter" title="This list is empty" />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {movies.map((m) => (
            <MovieCard
              key={m.id}
              width={width}
              movie={{ id: m.id, title: m.t, posterPath: m.p, year: m.y }}
              onPress={() => router.push({ pathname: "/movie/[id]", params: { id: String(m.id) } })}
              saved={library.isSaved(m.id)}
              busy={savingId === m.id}
              onQuickAdd={() =>
                quickSave({ movieId: m.id, title: m.t, posterPath: m.p, releaseDate: null, year: m.y, genreIds: m.g ?? [], voteAverage: 0, originalLanguage: null })
              }
              footnote={[m.w ? "watched" : null, m.r ? "★".repeat(m.r) : null].filter(Boolean).join(" · ") || undefined}
            />
          ))}
        </View>
      )}
    </View>
  );
}
