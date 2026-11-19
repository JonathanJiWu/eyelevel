import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { RequireAccount } from "@/src/components/AppChrome";
import { UserRow } from "@/src/components/social/UserRow";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { Card, ScrollScreen, SectionHeader } from "@/src/components/ui/Layout";
import { EmptyState, LoadingState, Notice } from "@/src/components/ui/States";
import { TextField } from "@/src/components/ui/TextField";
import { searchProfiles } from "@/src/data/profile";
import type { Profile } from "@/src/data/types";
import { useAuth } from "@/src/context/AuthContext";
import { useLibrary } from "@/src/context/LibraryContext";
import { useSocial } from "@/src/context/SocialContext";
import { useTheme } from "@/src/context/ThemeContext";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import { participantFromLibrary, participantFromSharedIndex, sharedSavedCount } from "@/src/lib/compare";
import { friendlyError } from "@/src/lib/errors";
import { getFirebase } from "@/src/lib/firebase";
import { spacing } from "@/src/theme/colors";

export default function FriendsScreen() {
  return (
    <ScrollScreen testID="friends-screen">
      <RequireAccount icon="group" title="Watch with friends" message="Sign in to add friends, see what they want to watch and compare watchlists.">
        <FriendsContent />
      </RequireAccount>
    </ScrollScreen>
  );
}

function FriendsContent() {
  const social = useSocial();
  const library = useLibrary();
  const { user, profile } = useAuth();
  const router = useRouter();

  const me = useMemo(() => participantFromLibrary(user?.uid ?? "", profile?.displayName ?? "You", library.library), [user, profile, library.library]);
  const overlap = (uid: string) => {
    const f = social.friend(uid);
    if (!f?.index) return null;
    return sharedSavedCount(me, participantFromSharedIndex(uid, "", f.index));
  };

  if (!social.ready) return social.error ? <Notice tone="danger">{social.error}</Notice> : <LoadingState label="Loading friends…" />;

  return (
    <View style={{ gap: spacing.xl }}>
      <FindPeople />

      {social.incoming.length ? (
        <View style={{ gap: spacing.sm }} testID="incoming-requests">
          <SectionHeader title="Friend requests" subtitle={`${social.incoming.length} waiting for you`} />
          {social.incoming.map((r) => (r.profile ? <UserRow key={r.uid} profile={r.profile} subtitle="wants to be friends" /> : null))}
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }} testID="friends-list">
        <SectionHeader
          title="Friends"
          subtitle={social.friends.length ? `${social.friends.length} friend${social.friends.length === 1 ? "" : "s"}` : undefined}
          action={
            social.friends.length ? <Button title="Compare" icon="compare-arrows" variant="secondary" onPress={() => router.push("/compare")} testID="open-compare" /> : null
          }
        />
        {social.friends.length === 0 ? (
          <EmptyState icon="person-add" title="No friends yet" message="Search for people above by username or name and send them a request." />
        ) : (
          social.friends.map((f) => {
            const shared = overlap(f.uid);
            return f.profile ? (
              <UserRow
                key={f.uid}
                profile={f.profile}
                subtitle={shared === null ? "nothing shared yet" : `${shared} movie${shared === 1 ? "" : "s"} in common`}
                right={
                  <Button
                    title="Compare"
                    size="sm"
                    variant="outline"
                    onPress={() => router.push({ pathname: "/compare", params: { with: f.uid } })}
                    testID={`compare-${f.profile.username}`}
                  />
                }
              />
            ) : null;
          })
        )}
      </View>

      {social.outgoing.length ? (
        <View style={{ gap: spacing.sm }} testID="outgoing-requests">
          <SectionHeader title="Sent requests" />
          {social.outgoing.map((r) => (r.profile ? <UserRow key={r.uid} profile={r.profile} subtitle="request sent" /> : null))}
        </View>
      ) : null}
    </View>
  );
}

function FindPeople() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [term, setTerm] = useState("");
  const query = useDebouncedValue(term.trim(), 300);
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.replace(/^@/, "").length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchProfiles(getFirebase().db, query, user?.uid)
      .then((r) => !cancelled && setResults(r))
      .catch((e) => !cancelled && setError(friendlyError(e, "Search failed. Please try again.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, user]);

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <AppText variant="title" accessibilityRole="header">
          Find people
        </AppText>
        <TextField
          value={term}
          onChangeText={setTerm}
          placeholder="Search by username or name"
          icon="person-search"
          onClear={() => setTerm("")}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search people"
          testID="people-search"
        />
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {!loading && query.replace(/^@/, "").length >= 2 && results.length === 0 && !error ? (
          <AppText variant="muted" testID="people-no-results">
            No one found for “{query}”. People who turned off discoverability won't appear.
          </AppText>
        ) : null}
        <View style={{ gap: spacing.sm }} testID="people-results">
          {results.map((p) => (
            <UserRow key={p.uid} profile={p} />
          ))}
        </View>
      </View>
    </Card>
  );
}
