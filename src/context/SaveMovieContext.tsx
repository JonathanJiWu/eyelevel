/**
 * App-wide "save movie" actions: one-tap quick add (to the default list)
 * and a multi-list picker sheet for organizing a movie across lists.
 */
import { MaterialIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { Chip, ChipRow } from "@/src/components/ui/Chip";
import { Sheet } from "@/src/components/ui/Sheet";
import { Notice } from "@/src/components/ui/States";
import { TextField } from "@/src/components/ui/TextField";
import type { MovieSnapshot, Visibility } from "@/src/data/types";
import { friendlyError } from "@/src/lib/errors";
import { validateListName } from "@/src/lib/validation";
import { radius } from "@/src/theme/colors";
import { useAuth } from "./AuthContext";
import { useFeedback } from "./FeedbackContext";
import { useLibrary } from "./LibraryContext";
import { useTheme } from "./ThemeContext";

interface SaveMovieValue {
  openPicker: (movie: MovieSnapshot) => Promise<void>;
  quickSave: (movie: MovieSnapshot) => Promise<void>;
  savingId: number | null;
}

const SaveMovieContext = createContext<SaveMovieValue | null>(null);

export function SaveMovieProvider({ children }: { children: React.ReactNode }) {
  const { waitForAuth } = useAuth();
  const library = useLibrary();
  const { toast } = useFeedback();
  const router = useRouter();
  const pathname = usePathname();
  const [movie, setMovie] = useState<MovieSnapshot | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const goToLogin = useCallback(() => {
    toast("Sign in to save movies to your watchlists.", { type: "info" });
    router.push({ pathname: "/login", params: { redirect: pathname } });
  }, [router, pathname, toast]);

  // Wait for the session to be restored before deciding the user is signed
  // out (a click right after page load must not bounce through /login).
  const openPicker = useCallback(
    async (next: MovieSnapshot) => {
      if (!(await waitForAuth())) return goToLogin();
      setMovie(next);
    },
    [waitForAuth, goToLogin],
  );

  const quickSave = useCallback(
    async (next: MovieSnapshot) => {
      if (!(await waitForAuth())) return goToLogin();
      if (library.isSaved(next.movieId)) {
        setMovie(next);
        return;
      }
      setSavingId(next.movieId);
      try {
        const list = await library.quickAdd(next);
        toast(`Added "${next.title}" to ${list.name}`, { actionLabel: "Change", onAction: () => setMovie(next) });
      } catch (error) {
        toast(friendlyError(error, "Couldn't save that movie."), { type: "error" });
      } finally {
        setSavingId(null);
      }
    },
    [waitForAuth, goToLogin, library, toast],
  );

  const value = useMemo(() => ({ openPicker, quickSave, savingId }), [openPicker, quickSave, savingId]);

  return (
    <SaveMovieContext.Provider value={value}>
      {children}
      {movie ? <ListPickerSheet movie={movie} onClose={() => setMovie(null)} /> : null}
    </SaveMovieContext.Provider>
  );
}

function ListPickerSheet({ movie, onClose }: { movie: MovieSnapshot; onClose: () => void }) {
  const { colors } = useTheme();
  const library = useLibrary();
  const { toast } = useFeedback();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Initialize from the user's lists once they are loaded (the sheet can be
  // opened before the library finishes loading).
  useEffect(() => {
    if (!library.ready || initialized) return;
    const known = new Set(library.lists.map((l) => l.id));
    setSelected(new Set((library.entryFor(movie.movieId)?.listIds ?? []).filter((id) => known.has(id))));
    if (library.lists.length === 0) {
      setCreating(true);
      setNewName("Watchlist");
    }
    setInitialized(true);
  }, [library, movie.movieId, initialized]);
  const [newVisibility, setNewVisibility] = useState<Visibility>("friends");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const ids = [...selected];
      if (creating && newName.trim()) {
        const problem = validateListName(newName);
        if (problem) {
          setNameError(problem);
          setSaving(false);
          return;
        }
        // Creating the list and adding the movie happen in one atomic write.
        await library.createList({ name: newName, visibility: newVisibility }, { movie, keepListIds: ids });
        toast(`Saved "${movie.title}" to ${ids.length + 1} list${ids.length ? "s" : ""}`);
      } else {
        await library.setMovieLists(movie, ids);
        toast(ids.length ? `Saved "${movie.title}" to ${ids.length} list${ids.length === 1 ? "" : "s"}` : `Removed "${movie.title}" from your lists`);
      }
      onClose();
    } catch (e) {
      setError(friendlyError(e, "Couldn't update your lists."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Save to lists"
      testID="list-picker"
      footer={
        <>
          <Button title="Cancel" variant="outline" onPress={onClose} />
          <Button title="Save" onPress={save} loading={saving} disabled={!initialized} testID="list-picker-save" />
        </>
      }
    >
      <AppText variant="muted" numberOfLines={2}>
        {movie.title}
        {movie.year ? ` (${movie.year})` : ""}
      </AppText>
      {!initialized ? <AppText variant="muted">Loading your lists…</AppText> : null}
      {(initialized ? library.lists : []).map((list) => {
        const checked = selected.has(list.id);
        return (
          <Pressable
            key={list.id}
            testID={`list-option-${list.name}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={list.name}
            onPress={() => toggle(list.id)}
            style={[styles.option, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primarySoft : "transparent" }]}
          >
            <MaterialIcons name={checked ? "check-box" : "check-box-outline-blank"} size={22} color={checked ? colors.primary : colors.textMuted} />
            <View style={{ flex: 1 }}>
              <AppText variant="subtitle" style={{ fontSize: 15 }}>
                {list.name}
              </AppText>
              <AppText variant="caption">
                {list.count} movie{list.count === 1 ? "" : "s"} · {list.visibility === "friends" ? "Friends can see" : "Private"}
              </AppText>
            </View>
            <MaterialIcons name={list.visibility === "friends" ? "group" : "lock"} size={18} color={colors.textMuted} />
          </Pressable>
        );
      })}
      {!initialized ? null : creating ? (
        <View style={{ gap: 10 }}>
          <TextField
            label="New list name"
            value={newName}
            onChangeText={(t) => {
              setNewName(t);
              setNameError(null);
            }}
            placeholder="e.g. Date night"
            maxLength={60}
            error={nameError}
            testID="new-list-name"
          />
          <ChipRow>
            <Chip label="Friends can see" icon="group" selected={newVisibility === "friends"} onPress={() => setNewVisibility("friends")} />
            <Chip label="Private" icon="lock" selected={newVisibility === "private"} onPress={() => setNewVisibility("private")} />
          </ChipRow>
        </View>
      ) : (
        <Button title="New list" icon="add" variant="ghost" onPress={() => setCreating(true)} style={{ alignSelf: "flex-start" }} testID="list-picker-new" />
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Sheet>
  );
}

export function useSaveMovie(): SaveMovieValue {
  const value = useContext(SaveMovieContext);
  if (!value) throw new Error("useSaveMovie must be used inside SaveMovieProvider");
  return value;
}

const styles = StyleSheet.create({
  option: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderWidth: 1, borderRadius: radius.md },
});
