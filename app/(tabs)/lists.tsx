import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { RequireAccount } from "@/src/components/AppChrome";
import { ListEditorSheet } from "@/src/components/movies/ListEditorSheet";
import { Poster } from "@/src/components/movies/Poster";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { ScrollScreen, SectionHeader } from "@/src/components/ui/Layout";
import { EmptyState, LoadingState, Notice } from "@/src/components/ui/States";
import { useFeedback } from "@/src/context/FeedbackContext";
import { useLibrary, type ListSummary } from "@/src/context/LibraryContext";
import { useTheme } from "@/src/context/ThemeContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { radius, spacing } from "@/src/theme/colors";

export default function ListsScreen() {
  return (
    <ScrollScreen testID="lists-screen">
      <RequireAccount icon="movie" title="Your watchlists live here" message="Sign in to create watchlists, rate movies and keep track of what you've watched.">
        <ListsContent />
      </RequireAccount>
    </ScrollScreen>
  );
}

function ListsContent() {
  const library = useLibrary();
  const router = useRouter();
  const { toast } = useFeedback();
  const { columns, contentWidth } = useResponsive();
  const [creating, setCreating] = useState(false);
  const cols = Math.min(columns(260, 4), 4);
  const cardWidth = Math.floor((contentWidth - spacing.md * (cols - 1)) / cols);
  const watched = library.library.filter((e) => e.watched).length;
  const rated = library.library.filter((e) => e.rating !== null).length;

  if (!library.ready) return library.error ? <Notice tone="danger">{library.error}</Notice> : <LoadingState label="Loading your lists…" />;

  return (
    <View style={{ gap: spacing.lg }}>
      <SectionHeader
        title="My lists"
        subtitle={`${library.lists.length} list${library.lists.length === 1 ? "" : "s"} · ${watched} watched · ${rated} rated`}
        action={<Button title="New list" icon="add" onPress={() => setCreating(true)} testID="create-list" />}
      />
      {library.error ? <Notice tone="danger">{library.error}</Notice> : null}
      {library.lists.length === 0 ? (
        <EmptyState
          icon="playlist-add"
          title="No lists yet"
          message="Create a list, then add movies from Discover."
          actionLabel="Create your first list"
          onAction={() => setCreating(true)}
        />
      ) : (
        <View style={styles.grid}>
          {library.lists.map((list) => (
            <ListCard key={list.id} list={list} width={cardWidth} onPress={() => router.push({ pathname: "/list/[id]", params: { id: list.id } })} />
          ))}
        </View>
      )}
      <ListEditorSheet
        visible={creating}
        title="New list"
        submitLabel="Create list"
        onClose={() => setCreating(false)}
        onSubmit={async (draft) => {
          const id = await library.createList(draft);
          toast(`Created “${draft.name.trim()}”`);
          router.push({ pathname: "/list/[id]", params: { id } });
        }}
      />
    </View>
  );
}

function ListCard({ list, width, onPress }: { list: ListSummary; width: number; onPress: () => void }) {
  const { colors } = useTheme();
  const posters = [...list.posters, null, null, null, null].slice(0, 4);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${list.name}, ${list.count} movies, ${list.visibility === "friends" ? "shared with friends" : "private"}`}
      onPress={onPress}
      testID={`list-card-${list.name}`}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.card,
        { width, backgroundColor: colors.surface, borderColor: hovered ? colors.primary : colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.mosaic}>
        {posters.map((p, i) => (
          <View key={i} style={styles.mosaicCell}>
            {p ? <Poster path={p} title={list.name} size="w185" rounded={false} fill /> : <View style={[styles.mosaicEmpty, { backgroundColor: colors.surfaceAlt }]} />}
          </View>
        ))}
      </View>
      <View style={{ padding: spacing.md, gap: 4 }}>
        <View style={styles.titleRow}>
          <AppText variant="subtitle" numberOfLines={1} style={{ flex: 1 }}>
            {list.name}
          </AppText>
          <MaterialIcons name={list.visibility === "friends" ? "group" : "lock"} size={18} color={colors.textMuted} />
        </View>
        <AppText variant="caption">
          {list.count} movie{list.count === 1 ? "" : "s"} · {list.visibility === "friends" ? "Friends can see" : "Private"}
        </AppText>
        {list.description ? (
          <AppText variant="muted" numberOfLines={2}>
            {list.description}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  mosaic: { flexDirection: "row", aspectRatio: 2.2 },
  mosaicCell: { flex: 1, overflow: "hidden" },
  mosaicEmpty: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
