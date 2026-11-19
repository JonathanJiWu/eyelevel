import { MaterialIcons } from "@expo/vector-icons";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { RequireAccount } from "@/src/components/AppChrome";
import { RelationshipActions } from "@/src/components/social/UserRow";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { Button } from "@/src/components/ui/Button";
import { Card, ScrollScreen, SectionHeader } from "@/src/components/ui/Layout";
import { EmptyState, ErrorState, LoadingState } from "@/src/components/ui/States";
import { getProfileCached } from "@/src/data/profile";
import type { Profile } from "@/src/data/types";
import { useAuth } from "@/src/context/AuthContext";
import { useLibrary } from "@/src/context/LibraryContext";
import { useSocial } from "@/src/context/SocialContext";
import { useTheme } from "@/src/context/ThemeContext";
import { participantFromLibrary, participantFromSharedIndex, compareParticipants } from "@/src/lib/compare";
import { friendlyError } from "@/src/lib/errors";
import { getFirebase } from "@/src/lib/firebase";
import { radius, spacing } from "@/src/theme/colors";

export default function UserScreen() {
  return (
    <ScrollScreen narrow>
      <RequireAccount icon="person" title="Sign in to view profiles" message="Profiles and shared watchlists are only visible to signed-in members.">
        <UserContent />
      </RequireAccount>
    </ScrollScreen>
  );
}

function UserContent() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { user, profile: myProfile } = useAuth();
  const social = useSocial();
  const library = useLibrary();
  const router = useRouter();
  const { colors } = useTheme();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const friend = uid ? social.friend(uid) : undefined;
  const relation = uid ? social.relationship(uid) : "none";

  useEffect(() => {
    if (!uid || uid === user?.uid) return;
    let cancelled = false;
    setError(null);
    getProfileCached(getFirebase().db, uid)
      .then((p) => !cancelled && setProfile(p))
      .catch((e) => !cancelled && setError(friendlyError(e, "We couldn't load this profile.")));
    return () => {
      cancelled = true;
    };
  }, [uid, user]);

  const comparison = useMemo(() => {
    if (!friend?.index || !user) return null;
    return compareParticipants([
      participantFromLibrary(user.uid, myProfile?.displayName ?? "You", library.library),
      participantFromSharedIndex(friend.uid, friend.profile?.displayName ?? "Friend", friend.index),
    ]);
  }, [friend, user, myProfile, library.library]);

  if (uid && uid === user?.uid) return <Redirect href="/profile" />;
  if (error) return <ErrorState message={error} />;
  if (profile === undefined) return <LoadingState label="Loading profile…" />;
  if (profile === null) {
    return <EmptyState icon="person-off" title="Profile not found" message="This account may have been deleted." actionLabel="Back to friends" onAction={() => router.dismissTo("/friends")} />;
  }

  const lists = Object.entries(friend?.index?.lists ?? {}).sort(([, a], [, b]) => b.u - a.u);
  const sharedMovies = Object.keys(friend?.index?.movies ?? {}).length;

  return (
    <View style={{ gap: spacing.lg }} testID="user-profile">
      <Stack.Screen options={{ title: profile.displayName }} />
      <Card>
        <View style={styles.identity}>
          <Avatar name={profile.displayName} color={profile.avatarColor} size={64} />
          <View style={{ flex: 1 }}>
            <AppText variant="title">{profile.displayName}</AppText>
            <AppText variant="muted">@{profile.username}</AppText>
          </View>
        </View>
        {profile.bio ? <AppText style={{ marginTop: spacing.md }}>{profile.bio}</AppText> : null}
        <View style={{ marginTop: spacing.lg, flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <RelationshipActions uid={profile.uid} name={profile.displayName} />
          {relation === "friend" ? (
            <Button title="Compare watchlists" icon="compare-arrows" variant="secondary" onPress={() => router.push({ pathname: "/compare", params: { with: profile.uid } })} testID="compare-with-user" />
          ) : null}
        </View>
      </Card>

      {relation !== "friend" ? (
        <EmptyState
          icon="lock"
          title={`${profile.displayName}'s lists are private`}
          message={relation === "outgoing" ? "Your friend request is pending." : "Become friends to see the watchlists they share and compare tastes."}
          testID="not-friends-notice"
        />
      ) : !friend?.indexLoaded ? (
        <LoadingState label="Loading shared lists…" />
      ) : (
        <>
          {comparison ? (
            <Card testID="taste-match">
              <AppText variant="subtitle">You and {profile.displayName}</AppText>
              <View style={styles.statsRow}>
                <Stat value={`${comparison.matchScore}%`} label="match" />
                <Stat value={String(comparison.everyone.length)} label="both want to watch" />
                <Stat value={String(sharedMovies)} label="movies shared" />
              </View>
            </Card>
          ) : null}
          <SectionHeader title="Shared lists" subtitle={lists.length ? undefined : "Nothing shared yet."} />
          {lists.length === 0 ? (
            <EmptyState icon="visibility-off" title="No shared lists" message={`${profile.displayName} hasn't shared any lists with friends yet.`} />
          ) : (
            lists.map(([listId, list]) => (
              <Pressable
                key={listId}
                accessibilityRole="link"
                onPress={() => router.push({ pathname: "/shared/[uid]/[listId]", params: { uid: profile.uid, listId } })}
                style={[styles.listRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                testID={`shared-list-${list.n}`}
              >
                <MaterialIcons name="movie" size={24} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <AppText variant="subtitle">{list.n}</AppText>
                  <AppText variant="caption">
                    {list.c} movie{list.c === 1 ? "" : "s"}
                    {list.d ? ` · ${list.d}` : ""}
                  </AppText>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </>
      )}
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <AppText variant="title">{value}</AppText>
      <AppText variant="caption" center>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  statsRow: { flexDirection: "row", marginTop: spacing.md, gap: spacing.sm },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
});
