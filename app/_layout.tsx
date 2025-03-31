import React, { useState, useEffect } from "react";
import { Stack } from "expo-router";
import { useColorScheme, Switch, View, StyleSheet } from "react-native";

export default function RootLayout() {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === "dark");

  useEffect(() => {
    setIsDarkMode(systemColorScheme === "dark");
  }, [systemColorScheme]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  return (
    <View style={[styles.container, isDarkMode ? styles.dark : styles.light]}>
      <Stack>
        <Stack.Screen name="Login" options={{ headerTitle: "Login" }} />
        <Stack.Screen name="Explore" options={{ headerTitle: "Explore" }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <Switch value={isDarkMode} onValueChange={toggleDarkMode} style={styles.toggle} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dark: {
    backgroundColor: "#000",
    color: "#fff",
  },
  light: {
    backgroundColor: "#fff",
    color: "#000",
  },
  toggle: {
    position: "absolute",
    top: 10,
    right: 10,
  },
});
