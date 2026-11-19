import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "@/src/context/ThemeContext";
import { radius } from "@/src/theme/colors";
import { AppText } from "./AppText";
import type { IconName } from "./Button";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  icon?: IconName;
  disabled?: boolean;
  testID?: string;
}

export function Chip({ label, selected, onPress, onRemove, icon, disabled, testID }: ChipProps) {
  const { colors } = useTheme();
  const fg = selected ? colors.primaryText : colors.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onRemove ? "button" : "checkbox"}
      accessibilityState={{ checked: !!selected, disabled: !!disabled }}
      accessibilityLabel={onRemove ? `Remove filter ${label}` : label}
      disabled={disabled || (!onPress && !onRemove)}
      onPress={onPress ?? onRemove}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surfaceAlt,
          borderColor: selected ? colors.primary : colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {icon ? <MaterialIcons name={icon} size={14} color={fg} /> : null}
      <AppText variant="label" color={fg}>
        {label}
      </AppText>
      {onRemove ? <MaterialIcons name="close" size={14} color={fg} /> : null}
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  testID?: string;
}

export function Segmented<T extends string>({ value, options, onChange, testID }: SegmentedProps<T>) {
  const { colors } = useTheme();
  return (
    <View testID={testID} accessibilityRole="tablist" style={[styles.segmented, { backgroundColor: colors.surfaceAlt }]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && { backgroundColor: colors.primary }]}
          >
            <AppText variant="label" color={active ? colors.primaryText : colors.text} numberOfLines={1}>
              {option.label}
              {option.count !== undefined ? ` (${option.count})` : ""}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  segmented: { flexDirection: "row", borderRadius: radius.md, padding: 3, gap: 3, flexWrap: "wrap" },
  segment: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
  },
});
