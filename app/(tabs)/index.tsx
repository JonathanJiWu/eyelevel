import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View, type TextInputInstance } from "react-native";
import { ActiveFilters } from "@/src/components/movies/ActiveFilters";
import { FilterSheet } from "@/src/components/movies/FilterSheet";
import { MovieCard } from "@/src/components/movies/MovieCard";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { Container } from "@/src/components/ui/Layout";
import { EmptyState, ErrorState, Notice, Skeleton } from "@/src/components/ui/States";
import { TextField } from "@/src/components/ui/TextField";
import { snapshotFromMovie } from "@/src/data/library";
import { useAuth } from "@/src/context/AuthContext";
import { useLibrary } from "@/src/context/LibraryContext";
import { useSaveMovie } from "@/src/context/SaveMovieContext";
import { useSocial } from "@/src/context/SocialContext";
import { useTheme } from "@/src/context/ThemeContext";
import { useMovieFeed } from "@/src/hooks/useMovieFeed";
import { useResponsive } from "@/src/hooks/useResponsive";
import { participantFromSharedIndex, popularAmongFriends } from "@/src/lib/compare";
import { countActiveFilters, defaultFilters, filtersToParams, hasActiveCriteria, parseFilters, sameFilters, type MovieFilters } from "@/src/lib/filters";
import { cleanSearchParams } from "@/src/lib/params";
import { MIN_QUERY_LENGTH, SEARCH_SCAN_RESULTS } from "@/src/lib/search";
import { radius, spacing } from "@/src/theme/colors";
import { shadow } from "@/src/theme/shadow";
import type { MovieSummary } from "@/src/types/movies";

const GAP = 12;
/** Order-independent key for a params object. */
function paramsKey(params: Record<string, string>): string {
  return JSON.stringify(Object.keys(params).sort().map((k) => [k, params[k]]));
}

const FILTER_KEYS = ["genres", "genreMode", "yearFrom", "yearTo", "ratingMin", "votesMin", "language", "runtime", "certification", "sort"];

export default function DiscoverScreen() {
  const rawParams = useLocalSearchParams<Record<string, string>>();
  const params = useMemo(() => cleanSearchParams(rawParams), [rawParams]);
  const router = useRouter();
  const { colors } = useTheme();
  const { columns, contentWidth } = useResponsive();
  const library = useLibrary();
  const { quickSave, savingId } = useSaveMovie();

  // Initial state is always the defaults so the statically rendered HTML and
  // the first client render match; URL params are applied right after mount.
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<MovieFilters>(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInputInstance>(null);
  const searching = query.trim().length >= MIN_QUERY_LENGTH;
  const feed = useMovieFeed(query, filters);

  // Debounce typing (no request per keystroke).
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input), 350);
    return () => clearTimeout(timer);
  }, [input]);

  // Two-way sync with the URL (shareable searches, refresh, back/forward).
  const current = useRef({ query, filters });
  useLayoutEffect(() => {
    current.current = { query, filters };
  });
  const lastUrlKey = useRef<string | null>(null);
  const skipNextUrlWrite = useRef(false);
  const urlKey = paramsKey(params);

  useEffect(() => {
    // URL -> state, unless this URL is the one we just wrote ourselves.
    if (lastUrlKey.current === urlKey) return;
    lastUrlKey.current = urlKey;
    const fromUrl = parseFilters(params);
    const q = params.q ?? "";
    const changed = !sameFilters(current.current.filters, fromUrl) || current.current.query.trim() !== q.trim();
    if (!changed) return;
    skipNextUrlWrite.current = true;
    setFilters(fromUrl);
    setInput(q);
    setQuery(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);

  useEffect(() => {
    // state -> URL (skipped once after applying the URL, when state is stale).
    if (skipNextUrlWrite.current) {
      skipNextUrlWrite.current = false;
      return;
    }
    const wanted: Record<string, string> = { ...(query.trim() ? { q: query.trim() } : {}), ...filtersToParams(filters) };
    const key = paramsKey(wanted);
    if (key === urlKey) return;
    lastUrlKey.current = key;
    const next: Record<string, string | undefined> = { q: undefined };
    for (const name of FILTER_KEYS) next[name] = undefined;
    router.setParams({ ...next, ...wanted });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters]);

  const numColumns = columns(150, 7);
  const tileWidth = Math.floor((contentWidth - GAP * (numColumns - 1)) / numColumns);
  const activeCount = countActiveFilters(filters);

  const suggestions = focused && input.trim().length >= MIN_QUERY_LENGTH && input === query && feed.status === "ready" ? feed.movies.slice(0, 6) : [];

  const openMovie = useCallback((id: number) => router.push({ pathname: "/movie/[id]", params: { id: String(id) } }), [router]);

  const renderItem = useCallback(
    ({ item }: { item: MovieSummary }) => (
      <MovieCard
        movie={item}
        width={tileWidth}
        onPress={() => openMovie(item.id)}
        saved={library.isSaved(item.id)}
        busy={savingId === item.id}
        onQuickAdd={() => quickSave(snapshotFromMovie(item))}
      />
    ),
    [tileWidth, openMovie, library, savingId, quickSave],
  );

  const title = searching ? `Results for “${query.trim()}”` : hasActiveCriteria(filters) ? "Filtered movies" : "Popular right now";

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      {!searching && !hasActiveCriteria(filters) ? <FriendsAreSaving width={tileWidth} onOpen={openMovie} /> : null}
      <View style={styles.titleRow}>
        <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={2}>
          {title}
        </AppText>
        {feed.status === "ready" && feed.totalResults > 0 ? (
          <AppText variant="muted" testID="result-count">
            {feed.meta?.estimatedTotal ? "About " : ""}
            {feed.totalResults.toLocaleString()} {feed.totalResults === 1 ? "movie" : "movies"}
          </AppText>
        ) : null}
      </View>
      {feed.meta?.fuzzy ? <Notice>Few exact matches for “{query.trim()}”, so we included close spellings.</Notice> : null}
      {feed.meta?.truncated && feed.meta.mode === "search" ? (
        <AppText variant="caption" testID="search-truncated">
          Filtering the {SEARCH_SCAN_RESULTS.toLocaleString()} best matches for this search. Try a more specific title for more.
        </AppText>
      ) : null}
    </View>
  );

  const empty =
    feed.status === "loading" ? (
      <View style={styles.skeletonGrid}>
        {Array.from({ length: numColumns * 2 }, (_, i) => (
          <View key={i} style={{ width: tileWidth, gap: 6 }}>
            <Skeleton height={(tileWidth * 3) / 2} />
            <Skeleton height={12} width="80%" />
          </View>
        ))}
      </View>
    ) : feed.status === "error" ? (
      <ErrorState message={feed.error ?? undefined} onRetry={feed.retry} />
    ) : (
      <EmptyState
        icon="search-off"
        title={searching ? "No movies match your search" : "No movies match these filters"}
        message={activeCount ? "Try removing a filter or widening the year range." : "Check the spelling or try a different title."}
        actionLabel={activeCount ? "Clear filters" : undefined}
        onAction={activeCount ? () => setFilters({ ...filters, ...parseFilters({}), sort: filters.sort }) : undefined}
        testID="discover-empty"
      />
    );

  const footer =
    feed.movies.length === 0 ? undefined : feed.loadingMore ? (
      <View style={styles.footer}>
        <ActivityIndicator color={colors.primary} />
      </View>
    ) : feed.loadMoreError ? (
      <View style={styles.footer}>
        <AppText variant="muted">{feed.loadMoreError}</AppText>
        <Button title="Retry" size="sm" variant="secondary" onPress={feed.retry} />
      </View>
    ) : !feed.hasMore ? (
      <View style={styles.footer}>
        <AppText variant="caption" testID="end-of-results">
          You&apos;ve reached the end.
        </AppText>
      </View>
    ) : (
      <View style={styles.footer}>
        <Button title="Show more movies" variant="secondary" size="sm" onPress={feed.loadMore} testID="load-more" />
      </View>
    );

  // Tall screens: if the loaded movies don't fill the viewport there is
  // nothing to scroll, so keep loading pages until they do.
  const [listHeight, setListHeight] = useState(0);
  // Content height together with the number of movies it was measured for:
  // a measurement of the loading skeleton (or of fewer movies) must not
  // trigger loading another page.
  const [content, setContent] = useState({ height: 0, count: -1 });
  const contentHeight = content.count === feed.movies.length ? content.height : 0;
  useEffect(() => {
    if (feed.status !== "ready" || !feed.hasMore || feed.loadingMore || feed.loadMoreError) return;
    if (listHeight > 0 && contentHeight > 0 && contentHeight < listHeight + 200) feed.loadMore();
  }, [feed, listHeight, contentHeight]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.searchArea, { borderBottomColor: colors.border }]}>
        <Container>
          <View style={styles.searchRow}>
            <View style={{ flex: 1 }}>
              <TextField
                ref={inputRef}
                value={input}
                onChangeText={setInput}
                placeholder="Search movies by title…"
                icon="search"
                onClear={() => setInput("")}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Search movies"
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 150)}
                onSubmitEditing={() => {
                  setFocused(false);
                  inputRef.current?.blur();
                }}
                testID="search-input"
              />
            </View>
            <Button
              title={activeCount ? `Filters (${activeCount})` : "Filters"}
              icon="tune"
              variant={activeCount ? "primary" : "secondary"}
              onPress={() => setFiltersOpen(true)}
              testID="open-filters"
            />
          </View>
          <ActiveFilters filters={filters} onChange={setFilters} />
          {suggestions.length ? (
            <View style={[styles.suggestions, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="search-suggestions">
              {suggestions.map((m) => (
                <Pressable
                  key={m.id}
                  accessibilityRole="link"
                  onPress={() => {
                    setFocused(false);
                    openMovie(m.id);
                  }}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.suggestion, (hovered || pressed) && { backgroundColor: colors.primarySoft }]}
                >
                  <MaterialIcons name="movie" size={18} color={colors.textMuted} />
                  <AppText numberOfLines={1} style={{ flex: 1 }}>
                    {m.title}
                  </AppText>
                  <AppText variant="caption">{m.year ?? ""}</AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Container>
      </View>
      <FlatList
        key={`grid-${numColumns}`}
        testID="movie-grid"
        data={feed.movies}
        keyExtractor={(m) => String(m.id)}
        renderItem={renderItem}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: GAP } : undefined}
        contentContainerStyle={[styles.listContent, { width: contentWidth }]}
        style={{ flex: 1 }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        // Ignore end-reached events until the list has been measured with the
        // current movies: right after a page arrives FlatList still holds the
        // loading skeleton's (shorter) content size and would fire at once.
        onEndReached={() => {
          if (content.count === feed.movies.length) feed.loadMore();
        }}
        onEndReachedThreshold={0.6}
        // FlatList's onEndReached can miss on web; also check the distance to
        // the end on every scroll (loadMore ignores duplicate calls).
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          if (contentSize.height - (contentOffset.y + layoutMeasurement.height) < layoutMeasurement.height * 0.6) feed.loadMore();
        }}
        scrollEventThrottle={100}
        onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => setContent({ height: h, count: feed.movies.length })}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={numColumns * 4}
        windowSize={7}
        removeClippedSubviews={false}
      />
      <FilterSheet visible={filtersOpen} filters={filters} onApply={setFilters} onClose={() => setFiltersOpen(false)} />
    </View>
  );
}

/** Horizontal row of movies saved by friends (most-saved first). */
function FriendsAreSaving({ width, onOpen }: { width: number; onOpen: (id: number) => void }) {
  const { user } = useAuth();
  const { friends } = useSocial();
  const library = useLibrary();
  const { quickSave } = useSaveMovie();
  const movies = useMemo(() => {
    const participants = friends.filter((f) => f.index).map((f) => participantFromSharedIndex(f.uid, f.profile?.displayName ?? "Friend", f.index));
    return popularAmongFriends(participants, 1).slice(0, 15);
  }, [friends]);
  if (!user || movies.length === 0) return null;
  const tile = Math.min(width, 150);
  return (
    <View style={{ gap: spacing.sm }} testID="friends-saving">
      <AppText variant="title" accessibilityRole="header">
        Your friends want to watch
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: GAP }}>
        {movies.map((m) => (
          <MovieCard
            key={m.movieId}
            width={tile}
            movie={{ id: m.movieId, title: m.title, posterPath: m.posterPath, year: m.year }}
            onPress={() => onOpen(m.movieId)}
            saved={library.isSaved(m.movieId)}
            onQuickAdd={() =>
              quickSave({ movieId: m.movieId, title: m.title, posterPath: m.posterPath, releaseDate: null, year: m.year, genreIds: [], voteAverage: 0, originalLanguage: null })
            }
            footnote={`${m.savedBy.length} friend${m.savedBy.length === 1 ? "" : "s"}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchArea: { paddingTop: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 10 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 4 },
  suggestions: {
    position: "absolute",
    top: 52,
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    zIndex: 20,
    ...shadow("lg"),
  },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 12, marginTop: spacing.md },
  listContent: { alignSelf: "center", paddingBottom: 48 },
  skeletonGrid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  footer: { paddingVertical: 24, alignItems: "center", gap: 10 },
});
