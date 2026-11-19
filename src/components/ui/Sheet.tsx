import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/context/ThemeContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { radius, spacing } from "@/src/theme/colors";
import { AppText } from "./AppText";
import { IconButton } from "./Button";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  testID?: string;
  maxWidth?: number;
}

/** Bottom sheet on phones, centered dialog on wider screens. */
export function Sheet({ visible, onClose, title, children, footer, testID, maxWidth = 560 }: SheetProps) {
  const { colors } = useTheme();
  const { width, height } = useResponsive();
  const insets = useSafeAreaInsets();
  const wide = width >= 700;
  return (
    <Modal visible={visible} transparent animationType={wide ? "fade" : "slide"} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay, justifyContent: wide ? "center" : "flex-end" }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
          <View
            testID={testID}
            accessibilityViewIsModal
            {...({ role: "dialog", "aria-label": title } as object)}
            style={[
              styles.panel,
              {
                backgroundColor: colors.surface,
                maxWidth: wide ? maxWidth : undefined,
                width: wide ? "92%" : "100%",
                maxHeight: wide ? height * 0.85 : height * 0.9,
                borderRadius: wide ? radius.lg : 0,
                borderTopLeftRadius: radius.lg,
                borderTopRightRadius: radius.lg,
                paddingBottom: wide ? spacing.lg : Math.max(insets.bottom, spacing.lg),
              },
            ]}
          >
            <View style={styles.header}>
              <AppText variant="title" style={{ flex: 1 }} accessibilityRole="header">
                {title}
              </AppText>
              <IconButton icon="close" label="Close" onPress={onClose} />
            </View>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? <View style={[styles.footer, { borderTopColor: colors.border }]}>{footer}</View> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center" },
  panel: { overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
