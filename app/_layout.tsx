import React, { useState, useEffect, createContext, useContext } from "react";
import { Stack } from "expo-router";
import { useColorScheme, Switch, View, StyleSheet, Text, TouchableOpacity } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

const ThemeContext = createContext({ isDarkMode: true, toggleDarkMode: () => { } });

export function useTheme() {
  return useContext(ThemeContext);
}

export default function RootLayout() {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark mode

  useEffect(() => {
    setIsDarkMode(systemColorScheme === "dark" || true); // Always default to dark mode
  }, [systemColorScheme]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      <View style={[styles.container, isDarkMode ? styles.dark : styles.light]}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: isDarkMode ? "#121212" : "#fff" },
            headerTintColor: isDarkMode ? "#fff" : "#000",
            headerRight: () => (
              <View style={styles.headerRight}>
                <MaterialIcons
                  name={isDarkMode ? "nights-stay" : "wb-sunny"}
                  size={24}
                  color={isDarkMode ? "#fff" : "#000"}
                />
                <Switch value={isDarkMode} onValueChange={toggleDarkMode} style={styles.toggle} />
                <TouchableOpacity>
                  <Text style={[styles.signInText, isDarkMode && styles.darkText]}>
                    Sign In
                  </Text>
                </TouchableOpacity>
              </View>
            ),
          }}
        >
          <Stack.Screen name="Login" options={{ headerTitle: "Login" }} />
          <Stack.Screen name="Explore" options={{ headerTitle: "Explore" }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </View>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dark: {
    backgroundColor: "#121212", // Android's default dark mode background
    color: "#e0e0e0", // Light gray text
  },
  light: {
    backgroundColor: "#fff",
    color: "#000",
  },
  toggle: {
    marginHorizontal: 10,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  signInText: {
    fontSize: 16,
    color: "#000",
  },
  darkText: {
    color: "#fff",
  },
});
