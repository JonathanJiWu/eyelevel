import React, { useState, useEffect, createContext, useContext } from "react";
import { Stack } from "expo-router";
import { useColorScheme, Switch, View, StyleSheet, Text } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";

const ThemeContext = createContext({ isDarkMode: true, toggleDarkMode: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export default function RootLayout() {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === "dark");

  useEffect(() => {
    setIsDarkMode(systemColorScheme === "dark");
  }, [systemColorScheme]);

  useEffect(() => {
    // Update the body background color for web
    if (typeof document !== "undefined") {
      document.body.style.backgroundColor = isDarkMode ? "#121212" : "#fff";
      document.body.style.color = isDarkMode ? "#e0e0e0" : "#000";
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      <StatusBar
        style={isDarkMode ? "light" : "dark"}
        backgroundColor={isDarkMode ? "#121212" : "#fff"}
        translucent={true}
      />
      <View style={[styles.container, isDarkMode ? styles.dark : styles.light]}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: isDarkMode ? "#121212" : "#fff" },
            headerTintColor: isDarkMode ? "#fff" : "#000",
            contentStyle: isDarkMode ? styles.dark : styles.light, // Apply theme to screen content
            headerRight: () => (
              <View style={styles.headerRight}>
                <MaterialIcons
                  name={isDarkMode ? "nights-stay" : "wb-sunny"}
                  size={24}
                  color={isDarkMode ? "#fff" : "#000"}
                />
                <Switch value={isDarkMode} onValueChange={toggleDarkMode} style={styles.toggle} />
              </View>
            ),
          }}
        >
          <Stack.Screen name="Login" options={{ headerTitle: "Login" }} />
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
    backgroundColor: "#121212",
    color: "#e0e0e0",
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
});
