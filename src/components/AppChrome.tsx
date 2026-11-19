import { usePathname, useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { Button, IconButton, type IconName } from "@/src/components/ui/Button";
import { EmptyState, LoadingState, Notice } from "@/src/components/ui/States";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";

/** The "eyelevel" wordmark used in headers (tapping goes home). */
export function Wordmark() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel="eyelevel home" onPress={() => router.dismissTo("/")}>
      <AppText style={[styles.wordmark, { color: colors.textStrong }]}>
        eye<AppText style={[styles.wordmark, { color: colors.primary }]}>level</AppText>
      </AppText>
    </Pressable>
  );
}

/**
 * Header for the tab screens. Rendered by us (instead of react-navigation's
 * Header) because that one sizes itself from a window measurement taken at
 * module load, which differs between static rendering and the browser and
 * breaks hydration.
 */
export function TabHeader() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: colors.background }} {...({ role: "banner" } as object)}>
      <View style={styles.tabHeader}>
        <Wordmark />
        <View style={{ flex: 1 }} />
        <HeaderActions />
      </View>
    </View>
  );
}

const AUTH_ROUTES = ["/login", "/register", "/forgot-password"];

/** Header right side: theme toggle + account shortcut. */
export function HeaderActions() {
  const { isDark, toggle } = useTheme();
  const { user, profile, initializing } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <View style={styles.actions}>
      <IconButton
        icon={isDark ? "light-mode" : "dark-mode"}
        label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        onPress={toggle}
        testID="theme-toggle"
      />
      {initializing || (!user && AUTH_ROUTES.includes(pathname)) ? null : user ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          onPress={() => router.dismissTo("/profile")}
          testID="header-profile"
          style={{ marginLeft: 4 }}
        >
          <Avatar name={profile?.displayName ?? user.email ?? "You"} color={profile?.avatarColor} size={32} />
        </Pressable>
      ) : (
        <Button
          title="Sign in"
          size="sm"
          onPress={() => router.push({ pathname: "/login", params: pathname && pathname !== "/login" ? { redirect: pathname } : {} })}
          testID="header-sign-in"
        />
      )}
    </View>
  );
}

/**
 * Wraps signed-in-only content. Shows a friendly prompt when signed out and
 * a loading/error state while the account is being prepared.
 */
export function RequireAccount({
  children,
  icon = "lock",
  title,
  message,
}: {
  children: React.ReactNode;
  icon?: IconName;
  title: string;
  message: string;
}) {
  const { configured, initializing, user, accountReady, accountError, retrySetup } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  if (!configured) {
    return (
      <EmptyState
        icon="cloud-off"
        title="Accounts aren't configured"
        message="This deployment is missing its Firebase configuration, so sign-in and saved data are unavailable. Movie browsing still works."
      />
    );
  }
  if (initializing) return <LoadingState />;
  if (!user) {
    return (
      <EmptyState
        icon={icon}
        title={title}
        message={message}
        actionLabel="Sign in or create an account"
        onAction={() => router.push({ pathname: "/login", params: { redirect: pathname } })}
        testID="sign-in-prompt"
      />
    );
  }
  if (accountError) {
    return (
      <View style={{ padding: 24, gap: 12 }}>
        <Notice tone="danger">{accountError}</Notice>
        <Button title="Try again" onPress={retrySetup} />
      </View>
    );
  }
  if (!accountReady) return <LoadingState label="Setting up your account…" />;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  wordmark: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  actions: { flexDirection: "row", alignItems: "center", gap: 4, marginRight: 12 },
  tabHeader: { height: 64, flexDirection: "row", alignItems: "center", paddingLeft: 16 },
});
