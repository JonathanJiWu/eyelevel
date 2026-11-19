import { limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { RequireAccount } from "@/src/components/AppChrome";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { Button } from "@/src/components/ui/Button";
import { Chip, ChipRow, Segmented } from "@/src/components/ui/Chip";
import { Card, Divider, ScrollScreen, ToggleRow } from "@/src/components/ui/Layout";
import { Sheet } from "@/src/components/ui/Sheet";
import { Notice } from "@/src/components/ui/States";
import { TextField } from "@/src/components/ui/TextField";
import { isUsernameAvailable, UsernameTakenError } from "@/src/data/profile";
import { refs, toActivity } from "@/src/data/refs";
import { AVATAR_COLORS, LIMITS, type Activity } from "@/src/data/types";
import { useAuth } from "@/src/context/AuthContext";
import { useFeedback } from "@/src/context/FeedbackContext";
import { useLibrary } from "@/src/context/LibraryContext";
import { useReferenceData } from "@/src/context/ReferenceDataContext";
import { useSocial } from "@/src/context/SocialContext";
import { useTheme, type ThemeMode } from "@/src/context/ThemeContext";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import { friendlyError } from "@/src/lib/errors";
import { getFirebase } from "@/src/lib/firebase";
import { validateDisplayName, validatePassword, validateUsername } from "@/src/lib/validation";
import { radius, spacing } from "@/src/theme/colors";

export default function ProfileScreen() {
  return (
    <ScrollScreen narrow testID="profile-screen">
      <RequireAccount icon="person" title="Your profile" message="Sign in to manage your profile, privacy settings and preferences.">
        <ProfileContent />
      </RequireAccount>
      <View style={{ marginTop: spacing.xl }}>
        <ThemeCard />
      </View>
    </ScrollScreen>
  );
}

function ProfileContent() {
  const { profile, user, userDoc, usernameNotice, clearUsernameNotice, signOut, resendVerification } = useAuth();
  const library = useLibrary();
  const social = useSocial();
  const { toast } = useFeedback();
  const router = useRouter();
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!profile || !user || !userDoc) return null;
  const usesPassword = user.providerData.some((p) => p.providerId === "password");

  const stats = [
    { label: "Lists", value: library.lists.length },
    { label: "Saved", value: library.library.filter((e) => e.listIds.length).length },
    { label: "Watched", value: library.library.filter((e) => e.watched).length },
    { label: "Friends", value: social.friends.length },
  ];

  return (
    <View style={{ gap: spacing.lg }}>
      {usernameNotice ? (
        <Pressable onPress={clearUsernameNotice}>
          <Notice tone="warning">{usernameNotice}</Notice>
        </Pressable>
      ) : null}
      <Card>
        <View style={styles.identity}>
          <Avatar name={profile.displayName} color={profile.avatarColor} size={64} />
          <View style={{ flex: 1 }}>
            <AppText variant="title" testID="profile-name">
              {profile.displayName}
            </AppText>
            <AppText variant="muted" testID="profile-username">
              @{profile.username}
            </AppText>
            <AppText variant="caption" testID="profile-email">
              {user.email} · only you can see your email
            </AppText>
          </View>
        </View>
        {profile.bio ? <AppText style={{ marginTop: spacing.md }}>{profile.bio}</AppText> : null}
        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.label} style={styles.stat}>
              <AppText variant="title">{s.value}</AppText>
              <AppText variant="caption">{s.label}</AppText>
            </View>
          ))}
        </View>
        <View style={styles.buttons}>
          <Button title="Edit profile" icon="edit" variant="secondary" onPress={() => setEditing(true)} testID="edit-profile" />
          <Button
            title="Sign out"
            icon="logout"
            variant="outline"
            testID="sign-out"
            onPress={async () => {
              try {
                await signOut();
                toast("Signed out");
                router.dismissTo("/");
              } catch (e) {
                toast(friendlyError(e), { type: "error" });
              }
            }}
          />
        </View>
      </Card>

      {!user.emailVerified && usesPassword ? (
        <Notice tone="warning">
          <View style={{ gap: 8 }}>
            <AppText>Please verify your email address. It helps you recover your account.</AppText>
            <Button
              title="Resend verification email"
              size="sm"
              variant="secondary"
              style={{ alignSelf: "flex-start" }}
              onPress={() =>
                resendVerification()
                  .then(() => toast("Verification email sent"))
                  .catch((e) => toast(friendlyError(e), { type: "error" }))
              }
            />
          </View>
        </Notice>
      ) : null}

      <PrivacyCard />
      <PreferencesCard />
      <ActivityCard />

      <Card>
        <AppText variant="title" accessibilityRole="header">
          Account
        </AppText>
        <View style={[styles.buttons, { marginTop: spacing.md }]}>
          {usesPassword ? <Button title="Change password" icon="lock-reset" variant="outline" onPress={() => setChangingPassword(true)} testID="change-password" /> : null}
          <Button title="Delete account" icon="delete-forever" variant="ghost" style={{}} onPress={() => setDeleting(true)} testID="delete-account" />
        </View>
        <AppText variant="caption" style={{ marginTop: spacing.sm }} color={colors.textMuted}>
          Deleting your account permanently removes your profile, lists, ratings, friendships and activity.
        </AppText>
      </Card>

      <EditProfileSheet visible={editing} onClose={() => setEditing(false)} />
      <ChangePasswordSheet visible={changingPassword} onClose={() => setChangingPassword(false)} />
      <DeleteAccountSheet visible={deleting} usesPassword={usesPassword} onClose={() => setDeleting(false)} />
    </View>
  );
}

function PrivacyCard() {
  const { profile, userDoc, updateProfile, updatePrivacy } = useAuth();
  const { toast } = useFeedback();
  const [saving, setSaving] = useState<string | null>(null);
  if (!profile || !userDoc) return null;

  const save = async (key: string, fn: () => Promise<void>) => {
    setSaving(key);
    try {
      await fn();
      toast("Privacy settings saved");
    } catch (e) {
      toast(friendlyError(e), { type: "error" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card testID="privacy-settings">
      <AppText variant="title" accessibilityRole="header">
        Privacy
      </AppText>
      <AppText variant="muted" style={{ marginBottom: spacing.sm }}>
        Friends only ever see lists you mark “Friends” — private lists are never shared. Your email is never shown to anyone.
      </AppText>
      <ToggleRow
        label="Appear in search"
        description="Let people find you by name or username."
        value={profile.discoverable}
        disabled={saving !== null}
        onValueChange={(v) => save("discoverable", () => updateProfile({ discoverable: v }))}
        testID="toggle-discoverable"
      />
      <Divider />
      <ToggleRow
        label="Accept friend requests"
        value={profile.allowFriendRequests}
        disabled={saving !== null}
        onValueChange={(v) => save("requests", () => updateProfile({ allowFriendRequests: v }))}
        testID="toggle-requests"
      />
      <Divider />
      <ToggleRow
        label="Show friends what I've watched"
        value={userDoc.privacy.shareWatched}
        disabled={saving !== null}
        onValueChange={(v) => save("watched", () => updatePrivacy({ ...userDoc.privacy, shareWatched: v }))}
        testID="toggle-share-watched"
      />
      <Divider />
      <ToggleRow
        label="Show friends my ratings"
        value={userDoc.privacy.shareRatings}
        disabled={saving !== null}
        onValueChange={(v) => save("ratings", () => updatePrivacy({ ...userDoc.privacy, shareRatings: v }))}
        testID="toggle-share-ratings"
      />
    </Card>
  );
}

function PreferencesCard() {
  const { userDoc, updatePreferences } = useAuth();
  const { genres, languages } = useReferenceData();
  const { toast } = useFeedback();
  const router = useRouter();
  const [favorites, setFavorites] = useState<number[]>(userDoc?.preferences.favoriteGenres ?? []);
  const [language, setLanguage] = useState<string | null>(userDoc?.preferences.preferredLanguage ?? null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setFavorites(userDoc?.preferences.favoriteGenres ?? []);
    setLanguage(userDoc?.preferences.preferredLanguage ?? null);
  }, [userDoc]);
  if (!userDoc) return null;
  const dirty =
    JSON.stringify([...favorites].sort()) !== JSON.stringify([...userDoc.preferences.favoriteGenres].sort()) ||
    language !== userDoc.preferences.preferredLanguage;

  return (
    <Card testID="preferences">
      <AppText variant="title" accessibilityRole="header">
        Movie preferences
      </AppText>
      <AppText variant="muted" style={{ marginBottom: spacing.sm }}>
        Pick favorite genres (up to {LIMITS.favoriteGenres}) for quick “For you” browsing.
      </AppText>
      <ChipRow>
        {genres.map((g) => (
          <Chip
            key={g.id}
            label={g.name}
            selected={favorites.includes(g.id)}
            onPress={() =>
              setFavorites((f) => (f.includes(g.id) ? f.filter((x) => x !== g.id) : f.length >= LIMITS.favoriteGenres ? f : [...f, g.id]))
            }
            testID={`fav-genre-${g.id}`}
          />
        ))}
      </ChipRow>
      <AppText variant="label" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
        Preferred original language
      </AppText>
      <ChipRow>
        <Chip label="Any" selected={language === null} onPress={() => setLanguage(null)} />
        {languages.slice(0, 10).map((l) => (
          <Chip key={l.code} label={l.name} selected={language === l.code} onPress={() => setLanguage(l.code)} />
        ))}
      </ChipRow>
      <View style={[styles.buttons, { marginTop: spacing.md }]}>
        <Button
          title="Save preferences"
          disabled={!dirty}
          loading={saving}
          testID="save-preferences"
          onPress={async () => {
            setSaving(true);
            try {
              await updatePreferences({ favoriteGenres: favorites, preferredLanguage: language });
              toast("Preferences saved");
            } catch (e) {
              toast(friendlyError(e), { type: "error" });
            } finally {
              setSaving(false);
            }
          }}
        />
        {userDoc.preferences.favoriteGenres.length ? (
          <Button
            title="Browse my genres"
            icon="explore"
            variant="ghost"
            onPress={() =>
              router.dismissTo({
                pathname: "/",
                params: {
                  genres: userDoc.preferences.favoriteGenres.join(","),
                  ...(userDoc.preferences.preferredLanguage ? { language: userDoc.preferences.preferredLanguage } : {}),
                },
              })
            }
          />
        ) : null}
      </View>
    </Card>
  );
}

const ACTIVITY_TEXT: Record<Activity["type"], (a: Activity) => string> = {
  added: (a) => `Added ${a.title ?? "a movie"} to ${a.listName ?? "a list"}`,
  removed: (a) => `Removed ${a.title ?? "a movie"} from ${a.listName ?? "a list"}`,
  rated: (a) => `Rated ${a.title ?? "a movie"} ${"★".repeat(a.rating ?? 0)}`,
  unrated: (a) => `Cleared your rating for ${a.title ?? "a movie"}`,
  watched: (a) => `Watched ${a.title ?? "a movie"}`,
  unwatched: (a) => `Marked ${a.title ?? "a movie"} as not watched`,
  list_created: (a) => `Created the list ${a.listName ?? ""}`,
  list_updated: (a) => `Updated the list ${a.listName ?? ""}`,
  list_deleted: (a) => `Deleted the list ${a.listName ?? ""}`,
  friend_added: () => "Made a new friend",
};

function ActivityCard() {
  const { user } = useAuth();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    const q = query(refs.activity(getFirebase().db, user.uid), orderBy("createdAt", "desc"), limit(15));
    return onSnapshot(
      q,
      (snap) => setItems(snap.docs.map(toActivity).filter((a): a is Activity => a !== null)),
      (e) => setError(friendlyError(e, "Couldn't load your activity.")),
    );
  }, [user]);
  return (
    <Card testID="activity">
      <AppText variant="title" accessibilityRole="header">
        Recent activity
      </AppText>
      <AppText variant="caption" style={{ marginBottom: spacing.sm }}>
        Only you can see this.
      </AppText>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {items === null && !error ? <AppText variant="muted">Loading…</AppText> : null}
      {items?.length === 0 ? <AppText variant="muted">Nothing yet — start by saving a movie.</AppText> : null}
      {items?.map((a) => (
        <View key={a.id} style={styles.activityRow}>
          <AppText style={{ flex: 1 }}>{ACTIVITY_TEXT[a.type](a)}</AppText>
          <AppText variant="caption">{a.createdAt ? a.createdAt.toDate().toLocaleDateString() : "just now"}</AppText>
        </View>
      ))}
    </Card>
  );
}

function ThemeCard() {
  const { mode, setMode } = useTheme();
  return (
    <Card>
      <AppText variant="title" accessibilityRole="header" style={{ marginBottom: spacing.sm }}>
        Appearance
      </AppText>
      <Segmented<ThemeMode>
        value={mode}
        onChange={setMode}
        testID="theme-mode"
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
    </Card>
  );
}

// Sheets mount their form only while open so state is initialized
// synchronously on every open (no reset effect racing user input).
function EditProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  return visible && profile ? <EditProfileForm onClose={onClose} /> : null;
}

function EditProfileForm({ onClose }: { onClose: () => void }) {
  const { profile, updateProfile, user } = useAuth();
  const { toast } = useFeedback();
  const { colors } = useTheme();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [color, setColor] = useState(profile?.avatarColor ?? AVATAR_COLORS[0]);
  const [errors, setErrors] = useState<{ displayName?: string | null; username?: string | null; form?: string | null }>({});
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [saving, setSaving] = useState(false);
  const debouncedUsername = useDebouncedValue(username.trim(), 400);

  useEffect(() => {
    if (!profile || debouncedUsername.toLowerCase() === profile.usernameLower || validateUsername(debouncedUsername)) {
      setAvailability("idle");
      return;
    }
    let cancelled = false;
    setAvailability("checking");
    isUsernameAvailable(getFirebase().db, debouncedUsername, user?.uid)
      .then((ok) => !cancelled && setAvailability(ok ? "available" : "taken"))
      .catch(() => !cancelled && setAvailability("idle"));
    return () => {
      cancelled = true;
    };
  }, [debouncedUsername, profile, user]);

  const submit = async () => {
    const next = { displayName: validateDisplayName(displayName), username: validateUsername(username) };
    setErrors(next);
    if (next.displayName || next.username) return;
    setSaving(true);
    try {
      await updateProfile({ displayName, username, bio, avatarColor: color });
      toast("Profile updated");
      onClose();
    } catch (e) {
      if (e instanceof UsernameTakenError) setErrors({ username: e.message });
      else setErrors({ form: e instanceof Error && !("code" in e) ? e.message : friendlyError(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Edit profile"
      testID="edit-profile-sheet"
      footer={
        <>
          <Button title="Cancel" variant="outline" onPress={onClose} />
          <Button title="Save" onPress={submit} loading={saving} testID="save-profile" />
        </>
      }
    >
      <TextField label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={LIMITS.displayName} error={errors.displayName} testID="profile-display-name" />
      <TextField
        label="Username"
        value={username}
        onChangeText={(t) => setUsername(t.replace(/\s/g, ""))}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={LIMITS.username.max}
        error={errors.username ?? (availability === "taken" ? `@${username.trim()} is already taken.` : null)}
        helper={availability === "checking" ? "Checking availability…" : availability === "available" ? `@${username.trim()} is available` : "Letters, numbers and underscores."}
        testID="profile-username-input"
      />
      <TextField label="Bio" value={bio} onChangeText={setBio} multiline maxLength={LIMITS.bio} helper={`${bio.length}/${LIMITS.bio}`} testID="profile-bio" />
      <AppText variant="label">Avatar color</AppText>
      <View style={styles.colors}>
        {AVATAR_COLORS.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityState={{ checked: c === color }}
            accessibilityLabel={`Color ${c}`}
            onPress={() => setColor(c)}
            style={[styles.swatch, { backgroundColor: c, borderColor: c === color ? colors.textStrong : "transparent" }]}
          />
        ))}
      </View>
      {errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}
    </Sheet>
  );
}

function ChangePasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return visible ? <ChangePasswordForm onClose={onClose} /> : null;
}

function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const { changePassword } = useAuth();
  const { toast } = useFeedback();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: string | null; next?: string | null; confirm?: string | null; form?: string | null }>({});
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    const e = {
      current: current ? null : "Enter your current password.",
      next: validatePassword(next),
      confirm: next === confirm ? null : "Passwords don't match.",
    };
    setErrors(e);
    if (e.current || e.next || e.confirm) return;
    setSaving(true);
    try {
      await changePassword(current, next);
      toast("Password changed");
      onClose();
    } catch (err) {
      setErrors({ form: friendlyError(err) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Change password"
      footer={
        <>
          <Button title="Cancel" variant="outline" onPress={onClose} />
          <Button title="Change password" onPress={submit} loading={saving} testID="submit-password-change" />
        </>
      }
    >
      <TextField label="Current password" value={current} onChangeText={setCurrent} password autoComplete="current-password" error={errors.current} testID="current-password" />
      <TextField label="New password" value={next} onChangeText={setNext} password autoComplete="new-password" error={errors.next} helper="At least 8 characters with a letter and a number." testID="new-password" />
      <TextField label="Confirm new password" value={confirm} onChangeText={setConfirm} password autoComplete="new-password" error={errors.confirm} testID="confirm-new-password" />
      {errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}
    </Sheet>
  );
}

function DeleteAccountSheet({ visible, usesPassword, onClose }: { visible: boolean; usesPassword: boolean; onClose: () => void }) {
  return visible ? <DeleteAccountForm usesPassword={usesPassword} onClose={onClose} /> : null;
}

function DeleteAccountForm({ usesPassword, onClose }: { usesPassword: boolean; onClose: () => void }) {
  const { deleteAccount } = useAuth();
  const { toast } = useFeedback();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Delete account"
      testID="delete-account-sheet"
      footer={
        <>
          <Button title="Cancel" variant="outline" onPress={onClose} />
          <Button
            title="Delete forever"
            variant="danger"
            loading={busy}
            disabled={confirmText.trim().toUpperCase() !== "DELETE" || (usesPassword && !password)}
            testID="confirm-delete-account"
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                await deleteAccount(usesPassword ? password : null);
                onClose();
                toast("Your account was deleted");
                router.dismissTo("/");
              } catch (e) {
                setError(friendlyError(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      }
    >
      <Notice tone="danger">This permanently deletes your profile, watchlists, ratings, friendships and activity. It can't be undone.</Notice>
      {usesPassword ? <TextField label="Password" value={password} onChangeText={setPassword} password testID="delete-password" /> : null}
      <TextField label='Type "DELETE" to confirm' value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" testID="delete-confirm-text" />
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  stats: { flexDirection: "row", justifyContent: "space-around", marginTop: spacing.lg },
  stat: { alignItems: "center" },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  colors: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 34, height: 34, borderRadius: radius.pill, borderWidth: 3 },
});
