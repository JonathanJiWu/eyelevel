import React, { useState, useEffect, createContext, useContext } from "react";
import { Stack } from "expo-router";
import { useColorScheme, Switch, View, StyleSheet } from "react-native";

const ThemeContext = createContext({ isDarkMode: false, toggleDarkMode: () => { } });

export function useTheme() {
  return useContext(ThemeContext);
}

export default function RootLayout() {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === "dark");

  useEffect(() => {
    setIsDarkMode(systemColorScheme === "dark");
  }, [systemColorScheme]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      <View style={[styles.container, isDarkMode ? styles.dark : styles.light]}>
        <Stack screenOptions={{ headerStyle: { backgroundColor: isDarkMode ? "#000" : "#fff" }, headerTintColor: isDarkMode ? "#fff" : "#000" }}>
          <Stack.Screen name="Login" options={{ headerTitle: "Login" }} />
          <Stack.Screen name="Explore" options={{ headerTitle: "Explore" }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <Switch value={isDarkMode} onValueChange={toggleDarkMode} style={styles.toggle} />
      </View>
    </ThemeContext.Provider>
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
