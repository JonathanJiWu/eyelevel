import { MaterialIcons } from "@expo/vector-icons";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { Tabs } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabHeader } from "@/src/components/AppChrome";
import { useSocial } from "@/src/context/SocialContext";
import { useTheme } from "@/src/context/ThemeContext";

export default function TabLayout() {
  const { colors } = useTheme();
  const { incoming } = useSocial();
  const pending = incoming.length;
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        header: () => <TabHeader />,
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
        // Tab links point at the tab itself, without the current query string,
        // so statically rendered HTML and the browser agree on the href.
        tabBarButton: (props: BottomTabBarButtonProps) => <PlatformPressable {...props} href={props.href?.split("?")[0]} />,
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
          tabBarIcon: ({ color, size }: { color: string; size: number }) => <MaterialIcons name="group" size={size} color={color} />,
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, color: "#FFFFFF", fontWeight: "700" },
          tabBarAccessibilityLabel: pending > 0 ? `Friends, ${pending} pending friend request${pending === 1 ? "" : "s"}` : "Friends",
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
