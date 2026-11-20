import type { BottomTabBarButtonProps } from "expo-router/tabs";
import React from "react";
import { type GestureResponderEvent, Platform, Pressable } from "react-native";

type PressEvent = React.MouseEvent<HTMLAnchorElement, MouseEvent> | GestureResponderEvent;

/**
 * Bottom tab button. On web it renders a real link to the tab, so tabs can be
 * opened in a new browser tab, and the browser handles modified clicks itself.
 * The link drops the current query string, so the statically rendered href
 * and the first client render agree (otherwise hydration fails).
 */
export function TabBarButton({
  href,
  onPress,
  style,
  children,
  disabled,
  ref: _ref,
  // PlatformPressable-only props that a plain Pressable doesn't understand.
  pressColor: _pressColor,
  pressOpacity: _pressOpacity,
  hoverEffect: _hoverEffect,
  ...rest
}: BottomTabBarButtonProps) {
  const link = Platform.OS === "web" && href != null ? href.split("?")[0] : undefined;

  const handlePress = (e: PressEvent) => {
    if (link != null) {
      const event = e as React.MouseEvent<HTMLAnchorElement, MouseEvent>;
      const modified = event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
      const leftClick = event.button == null || event.button === 0;
      // Let the browser open the link (new tab, new window, …).
      if (modified || !leftClick) return;
      e.preventDefault();
    }
    onPress?.(e);
  };

  return (
    <Pressable
      accessible
      role={link != null ? "link" : "button"}
      // The tab bar passes role="tab" and aria-selected; those take precedence.
      {...rest}
      // react-native-web renders an <a href> when given `href`.
      {...(link != null ? ({ href: link } as object) : null)}
      disabled={disabled}
      onPress={disabled ? undefined : handlePress}
      style={({ pressed }) => [{ cursor: disabled ? "auto" : "pointer", opacity: pressed && !disabled ? 0.7 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}
