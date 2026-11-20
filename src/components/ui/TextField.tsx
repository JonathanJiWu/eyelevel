import { MaterialIcons } from "@expo/vector-icons";
import React, { forwardRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from "react-native";
import { useTheme } from "@/src/context/ThemeContext";
import { radius } from "@/src/theme/colors";
import { AppText } from "./AppText";
import type { IconName } from "./Button";

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  helper?: string | null;
  icon?: IconName;
  onClear?: () => void;
  /** Shows a show/hide toggle for passwords. */
  password?: boolean;
}

export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, error, helper, icon, onClear, password, style, multiline, editable = true, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;
  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText variant="label" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          { borderColor, backgroundColor: editable ? colors.input : colors.surfaceAlt },
          multiline && { minHeight: 90, alignItems: "flex-start", paddingVertical: 8 },
        ]}
      >
        {icon ? <MaterialIcons name={icon} size={20} color={colors.textMuted} style={{ marginRight: 8 }} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={password && !revealed}
          multiline={multiline}
          editable={editable}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            styles.input,
            { color: colors.text },
            multiline && { textAlignVertical: "top", minHeight: 72 },
            // Remove the default browser focus ring; the border shows focus instead.
            { outlineStyle: "none" } as object,
            style,
          ]}
          {...rest}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            onPress={() => setRevealed((v) => !v)}
            hitSlop={8}
          >
            <MaterialIcons name={revealed ? "visibility-off" : "visibility"} size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
        {onClear && rest.value ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear" onPress={onClear} hitSlop={8}>
            <MaterialIcons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" color={colors.danger} style={styles.message} accessibilityRole="alert">
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="caption" style={styles.message}>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { width: "100%" },
  label: { marginBottom: 6 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 10 },
  message: { marginTop: 4 },
});
