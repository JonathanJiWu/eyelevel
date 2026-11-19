import { MaterialIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderActions, Wordmark } from "@/src/components/AppChrome";
import { AppText } from "@/src/components/ui/AppText";
import { useSocial } from "@/src/context/SocialContext";
import { useTheme } from "@/src/context/ThemeContext";

function RequestsBadge({ color, size }: { color: string; size: number }) {
  const { incoming } = useSocial();
  const { colors } = useTheme();
  return (
    <View>
      <MaterialIcons name="group" size={size} color={color} />
      {incoming.length > 0 ? (
        <View
          accessibilityLabel={`${incoming.length} pending friend requests`}
          style={{
            position: "absolute",
            top: -4,
            right: -10,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.danger,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 4,
          }}
        >
          <AppText style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "700" }}>{incoming.length}</AppText>
        </View>
      ) : null}
    </View>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitle: () => <Wordmark />,
        headerTitleAlign: "left",
        headerRight: () => <HeaderActions />,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          height: 64 + insets.bottom,
          paddingTop: 4,
          paddingBottom: 4 + insets.bottom,
        },
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
        // A fixed label position keeps server-rendered HTML identical to the
        // first client render (the default depends on window width).
        tabBarLabelPosition: "below-icon",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Discover",
          tabBarButtonTestID: "tab-discover",
          tabBarIcon: ({ color, size }: { color: string; size: number }) => <MaterialIcons name="explore" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{
          title: "My Lists",
          tabBarButtonTestID: "tab-lists",
          tabBarIcon: ({ color, size }: { color: string; size: number }) => <MaterialIcons name="movie" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarButtonTestID: "tab-friends",
          tabBarIcon: ({ color, size }: { color: string; size: number }) => <RequestsBadge color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarButtonTestID: "tab-profile",
          tabBarIcon: ({ color, size }: { color: string; size: number }) => <MaterialIcons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
