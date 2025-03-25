import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      {/* <Stack.Screen name="Home" options={{ headerTitle: "Home" }} /> */}
      <Stack.Screen name="Login" options={{ headerTitle: "Login" }} />
      <Stack.Screen name="Explore" options={{ headerTitle: "Explore" }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>

  );
}
