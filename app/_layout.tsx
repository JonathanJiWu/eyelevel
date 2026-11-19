import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Platform } from "react-native";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { HeaderActions } from "@/src/components/AppChrome";
import { AuthProvider } from "@/src/context/AuthContext";
import { FeedbackProvider } from "@/src/context/FeedbackContext";
import { LibraryProvider } from "@/src/context/LibraryContext";
import { ReferenceDataProvider } from "@/src/context/ReferenceDataContext";
import { SaveMovieProvider } from "@/src/context/SaveMovieContext";
import { SocialProvider } from "@/src/context/SocialContext";
import { ThemeProvider, useTheme } from "@/src/context/ThemeContext";

function ThemedStack() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textStrong,
          headerTitleStyle: { fontWeight: "700" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
          headerRight: () => <HeaderActions />,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "eyelevel" }} />
        <Stack.Screen name="movie/[id]" options={{ title: "Movie" }} />
        <Stack.Screen name="list/[id]" options={{ title: "Watchlist" }} />
        <Stack.Screen name="user/[uid]" options={{ title: "Profile" }} />
        <Stack.Screen name="shared/[uid]/[listId]" options={{ title: "Shared list" }} />
        <Stack.Screen name="compare" options={{ title: "Compare watchlists" }} />
        <Stack.Screen name="login" options={{ title: "Sign in" }} />
        <Stack.Screen name="register" options={{ title: "Create account" }} />
        <Stack.Screen name="forgot-password" options={{ title: "Reset password" }} />
        <Stack.Screen name="+not-found" options={{ title: "Not found" }} />
      </Stack>
    </>
  );
}

// The server has no window: give react-navigation the same frame during
// static rendering and the first client render (it re-measures after mount),
// otherwise header layout differs and React hydration fails.
const WEB_INITIAL_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 1024, height: 768 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={Platform.OS === "web" ? WEB_INITIAL_METRICS : undefined}>
      <ThemeProvider>
        <FeedbackProvider>
          <ReferenceDataProvider>
            <AuthProvider>
              <LibraryProvider>
                <SocialProvider>
                  <SaveMovieProvider>
                    <ThemedStack />
                  </SaveMovieProvider>
                </SocialProvider>
              </LibraryProvider>
            </AuthProvider>
          </ReferenceDataProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
