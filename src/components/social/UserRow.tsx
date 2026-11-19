import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { Button } from "@/src/components/ui/Button";
import type { Profile } from "@/src/data/types";
import { useFeedback } from "@/src/context/FeedbackContext";
import { useSocial, type Relationship } from "@/src/context/SocialContext";
import { useTheme } from "@/src/context/ThemeContext";
import { friendlyError } from "@/src/lib/errors";
import { radius } from "@/src/theme/colors";

/** Relationship-aware action buttons (add / cancel / accept / decline / remove). */
export function RelationshipActions({ uid, name, compact }: { uid: string; name: string; compact?: boolean }) {
  const social = useSocial();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const relation: Relationship = social.relationship(uid);

  const run = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await fn();
      toast(success);
    } catch (error) {
      toast(friendlyError(error, error instanceof Error && error.name === "FriendError" ? error.message : "That didn't work. Please try again."), {
        type: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const size = compact ? "sm" : "md";
  switch (relation) {
    case "self":
      return null;
    case "friend":
      return (
        <Button
          title="Friends"
          icon="check"
          variant="outline"
          size={size}
          loading={busy === "remove"}
          testID={`remove-friend-${uid}`}
          onPress={async () => {
            const ok = await confirm({
              title: `Remove ${name}?`,
              message: "You'll stop seeing each other's shared watchlists. You can add each other again later.",
              confirmLabel: "Remove friend",
              destructive: true,
            });
            if (ok) await run("remove", () => social.removeFriend(uid), `Removed ${name} from your friends`);
          }}
        />
      );
    case "incoming":
      return (
        <View style={styles.actions}>
          <Button
            title="Accept"
            size={size}
            loading={busy === "accept"}
            testID={`accept-${uid}`}
            onPress={() => run("accept", () => social.acceptRequest(uid), `You and ${name} are now friends`)}
          />
          <Button
            title="Decline"
            variant="outline"
            size={size}
            loading={busy === "decline"}
            testID={`decline-${uid}`}
            onPress={() => run("decline", () => social.declineRequest(uid), "Request declined")}
          />
        </View>
      );
    case "outgoing":
      return (
        <Button
          title="Cancel request"
          variant="outline"
          size={size}
          loading={busy === "cancel"}
          testID={`cancel-${uid}`}
          onPress={() => run("cancel", () => social.cancelRequest(uid), "Request cancelled")}
        />
      );
    default:
      return (
        <Button
          title="Add friend"
          icon="person-add"
          size={size}
          loading={busy === "add"}
          testID={`add-friend-${uid}`}
          onPress={() =>
            run(
              "add",
              async () => {
                const result = await social.sendRequest(uid);
                if (result === "accepted") throw Object.assign(new Error(`You and ${name} are now friends`), { name: "Accepted" });
              },
              `Friend request sent to ${name}`,
            ).catch(() => undefined)
          }
        />
      );
  }
}

export function UserRow({ profile, subtitle, right }: { profile: Profile; subtitle?: string; right?: React.ReactNode }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`user-row-${profile.username}`}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${profile.displayName}, @${profile.username}`}
        onPress={() => router.push({ pathname: "/user/[uid]", params: { uid: profile.uid } })}
        style={styles.identity}
      >
        <Avatar name={profile.displayName} color={profile.avatarColor} size={44} />
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" numberOfLines={1}>
            {profile.displayName}
          </AppText>
          <AppText variant="caption" numberOfLines={1}>
            @{profile.username}
            {subtitle ? ` · ${subtitle}` : ""}
          </AppText>
        </View>
      </Pressable>
      {right ?? <RelationshipActions uid={profile.uid} name={profile.displayName} compact />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  identity: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 180 },
  actions: { flexDirection: "row", gap: 8 },
});
