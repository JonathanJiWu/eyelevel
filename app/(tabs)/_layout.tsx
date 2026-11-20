import { MaterialIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router/tabs";
import React from "react";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabHeader } from "@/src/components/AppChrome";
import { TabBarButton } from "@/src/components/TabBarButton";
import { useSocial } from "@/src/context/SocialContext";
import { useTheme } from "@/src/context/ThemeContext";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

function TabIcon({ name, color, size }: { name: IconName; color: ColorValue; size: number }) {
  // The tab bar passes the tint colors set below (always strings).
  return <MaterialIcons name={name} size={size} color={typeof color === "number" || color == null ? undefined : color} />;
}

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
        tabBarButton: (props) => <TabBarButton {...props} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Discover",
          tabBarButtonTestID: "tab-discover",
          tabBarIcon: (props) => <TabIcon name="explore" {...props} />,
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{
          title: "My Lists",
          tabBarButtonTestID: "tab-lists",
          tabBarIcon: (props) => <TabIcon name="movie" {...props} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarButtonTestID: "tab-friends",
          tabBarIcon: (props) => <TabIcon name="group" {...props} />,
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
          tabBarIcon: (props) => <TabIcon name="person" {...props} />,
        }}
      />
    </Tabs>
  );
}
