import { MaterialIcons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { RequireAccount } from "@/src/components/AppChrome";
import { ListEditorSheet } from "@/src/components/movies/ListEditorSheet";
import { Poster } from "@/src/components/movies/Poster";
import { RatingStars } from "@/src/components/movies/RatingStars";
import { AppText } from "@/src/components/ui/AppText";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Chip, ChipRow, Segmented } from "@/src/components/ui/Chip";
import { ScrollScreen } from "@/src/components/ui/Layout";
import { EmptyState, LoadingState } from "@/src/components/ui/States";
import type { LibraryEntry } from "@/src/data/types";
import { useFeedback } from "@/src/context/FeedbackContext";
import { useLibrary } from "@/src/context/LibraryContext";
import { useSaveMovie } from "@/src/context/SaveMovieContext";
import { useTheme } from "@/src/context/ThemeContext";
import { friendlyError } from "@/src/lib/errors";
import { radius, spacing } from "@/src/theme/colors";

type SortKey = "added" | "title" | "year" | "rating" | "score";
type Show = "all" | "unwatched" | "watched";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "added", label: "Recently added" },
  { key: "title", label: "Title" },
  { key: "year", label: "Release year" },
  { key: "rating", label: "My rating" },
  { key: "score", label: "TMDB score" },
];

const ms = (t: { toMillis(): number } | null) => (t ? t.toMillis() : Number.MAX_SAFE_INTEGER);

function sortEntries(entries: LibraryEntry[], sort: SortKey): LibraryEntry[] {
  const list = [...entries];
  switch (sort) {
    case "title":
      return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    case "year":
      return list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    case "rating":
      return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title));
    case "score":
      return list.sort((a, b) => b.voteAverage - a.voteAverage);
    default:
      return list.sort((a, b) => ms(b.addedAt) - ms(a.addedAt));
  }
}

export default function ListScreen() {
  return (
    <ScrollScreen>
      <RequireAccount title="Sign in to see this list" message="Watchlists are private to your account.">
        <ListContent />
      </RequireAccount>
    </ScrollScreen>
  );
}

function ListContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const library = useLibrary();
  const { openPicker } = useSaveMovie();
  const { toast, confirm } = useFeedback();
  const [sort, setSort] = useState<SortKey>("added");
  const [show, setShow] = useState<Show>("all");
  const [editing, setEditing] = useState(false);
  const [busyMovie, setBusyMovie] = useState<number | null>(null);
  const list = library.lists.find((l) => l.id === id);

  const entries = useMemo(() => library.library.filter((e) => e.listIds.includes(id ?? "")), [library.library, id]);
  const visible = useMemo(() => {
    const filtered = entries.filter((e) => (show === "all" ? true : show === "watched" ? e.watched : !e.watched));
    return sortEntries(filtered, sort);
  }, [entries, show, sort]);

  if (!library.ready) return <LoadingState label="Loading list…" />;
  if (!list) {
    return (
      <EmptyState
        icon="playlist-remove"
        title="List not found"
        message="It may have been deleted."
        actionLabel="Back to my lists"
        onAction={() => router.dismissTo("/lists")}
      />
    );
  }

  const watchedCount = entries.filter((e) => e.watched).length;

  const remove = async (entry: LibraryEntry) => {
    setBusyMovie(entry.movieId);
    try {
      await library.removeFromList(entry, list.id);
      toast(`Removed “${entry.title}” from ${list.name}`, {
        actionLabel: "Undo",
        onAction: () => {
          library.setMovieLists(entry, [...entry.listIds]).catch((e) => toast(friendlyError(e), { type: "error" }));
        },
      });
    } catch (e) {
      toast(friendlyError(e), { type: "error" });
    } finally {
      setBusyMovie(null);
    }
  };

  const toggleWatched = async (entry: LibraryEntry) => {
    setBusyMovie(entry.movieId);
    try {
      await library.setWatched(entry, !entry.watched);
    } catch (e) {
      toast(friendlyError(e), { type: "error" });
    } finally {
      setBusyMovie(null);
    }
  };

  const deleteList = async () => {
    const ok = await confirm({
      title: `Delete “${list.name}”?`,
      message: `This removes the list and its ${entries.length} movie${entries.length === 1 ? "" : "s"} from it. Movies in your other lists, your ratings and watched history are kept.`,
      confirmLabel: "Delete list",
      destructive: true,
    });
    if (!ok) return;
    try {
      await library.deleteList(list.id);
      toast(`Deleted “${list.name}”`);
      router.dismissTo("/lists");
    } catch (e) {
      toast(friendlyError(e), { type: "error" });
    }
  };

  return (
    <View style={{ gap: spacing.lg }} testID="list-detail">
      <Stack.Screen options={{ title: list.name }} />
      <View style={{ gap: 6 }}>
        <View style={styles.headerRow}>
          <AppText variant="display" style={{ flex: 1 }} testID="list-title">
            {list.name}
          </AppText>
          <IconButton icon="edit" label="Edit list" onPress={() => setEditing(true)} testID="edit-list" />
          <IconButton icon="delete-outline" label="Delete list" color={colors.danger} onPress={deleteList} testID="delete-list" />
        </View>
        <View style={styles.meta}>
          <MaterialIcons name={list.visibility === "friends" ? "group" : "lock"} size={16} color={colors.textMuted} />
          <AppText variant="muted" testID="list-visibility">
            {list.visibility === "friends" ? "Friends can see this list" : "Private — only you can see this list"}
          </AppText>
        </View>
        <AppText variant="muted">
          {entries.length} movie{entries.length === 1 ? "" : "s"} · {watchedCount} watched
        </AppText>
        {list.description ? <AppText>{list.description}</AppText> : null}
      </View>

      {entries.length ? (
        <View style={{ gap: spacing.sm }}>
          <ChipRow>
            {SORTS.map((s) => (
              <Chip key={s.key} label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} testID={`list-sort-${s.key}`} />
            ))}
          </ChipRow>
          <Segmented
            value={show}
            onChange={setShow}
            options={[
              { value: "all", label: "All", count: entries.length },
              { value: "unwatched", label: "To watch", count: entries.length - watchedCount },
              { value: "watched", label: "Watched", count: watchedCount },
            ]}
          />
        </View>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          icon="movie-filter"
          title="This list is empty"
          message="Find movies in Discover and tap the bookmark to add them."
          actionLabel="Discover movies"
          onAction={() => router.dismissTo("/")}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon="filter-list-off" title={show === "watched" ? "Nothing watched yet" : "You've watched everything here"} />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {visible.map((entry) => (
            <View key={entry.movieId} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`list-item-${entry.movieId}`}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={entry.title}
                onPress={() => router.push({ pathname: "/movie/[id]", params: { id: String(entry.movieId) } })}
                style={styles.rowMain}
              >
                <View style={{ width: 56 }}>
                  <Poster path={entry.posterPath} title={entry.title} size="w154" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="subtitle" numberOfLines={2}>
                    {entry.title}
                  </AppText>
                  <AppText variant="caption">
                    {[entry.year, entry.voteAverage ? `★ ${entry.voteAverage.toFixed(1)} TMDB` : null].filter(Boolean).join(" · ")}
                  </AppText>
                  {entry.rating ? <RatingStars value={entry.rating} size={14} /> : null}
                  {entry.watched ? (
                    <AppText variant="caption" color={colors.success}>
                      ✓ Watched
                    </AppText>
                  ) : null}
                </View>
              </Pressable>
              <View style={styles.rowActions}>
                <IconButton
                  icon={entry.watched ? "check-circle" : "radio-button-unchecked"}
                  label={entry.watched ? `Mark ${entry.title} as not watched` : `Mark ${entry.title} as watched`}
                  color={entry.watched ? colors.success : colors.textMuted}
                  disabled={busyMovie === entry.movieId}
                  onPress={() => toggleWatched(entry)}
                  testID={`watched-${entry.movieId}`}
                />
                <IconButton icon="playlist-add" label={`Move or copy ${entry.title}`} onPress={() => openPicker(entry)} testID={`move-${entry.movieId}`} />
                <IconButton
                  icon="remove-circle-outline"
                  label={`Remove ${entry.title} from ${list.name}`}
                  color={colors.danger}
                  disabled={busyMovie === entry.movieId}
                  onPress={() => remove(entry)}
                  testID={`remove-${entry.movieId}`}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      <Button title="Back to my lists" variant="ghost" icon="arrow-back" onPress={() => router.dismissTo("/lists")} style={{ alignSelf: "flex-start" }} />

      <ListEditorSheet
        visible={editing}
        title="Edit list"
        submitLabel="Save changes"
        initial={{ name: list.name, description: list.description, visibility: list.visibility }}
        onClose={() => setEditing(false)}
        onSubmit={async (draft) => {
          await library.updateList(list.id, draft);
          toast("List updated");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  row: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  rowActions: { flexDirection: "row", alignItems: "center" },
});
