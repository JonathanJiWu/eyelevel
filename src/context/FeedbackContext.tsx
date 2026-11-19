/**
 * Cross-platform user feedback: toasts and confirm dialogs.
 * (React Native's Alert.alert is a no-op on web, so the app never uses it.)
 */
import { MaterialIcons } from "@expo/vector-icons";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { Sheet } from "@/src/components/ui/Sheet";
import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing } from "@/src/theme/colors";
import { shadow } from "@/src/theme/shadow";

type ToastType = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  type: ToastType;
  actionLabel?: string;
  onAction?: () => void;
}
interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface FeedbackValue {
  toast: (message: string, options?: { type?: ToastType; actionLabel?: string; onAction?: () => void; durationMs?: number }) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const toast = useCallback<FeedbackValue["toast"]>(
    (message, options = {}) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, message, type: options.type ?? "success", actionLabel: options.actionLabel, onAction: options.onAction }]);
      timers.current.set(id, setTimeout(() => dismiss(id), options.durationMs ?? (options.actionLabel ? 6000 : 3500)));
    },
    [dismiss],
  );

  const confirm = useCallback<FeedbackValue["confirm"]>(
    (options) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve })),
    [],
  );

  const closeDialog = (result: boolean) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);
  const icon = { success: "check-circle", error: "error", info: "info" } as const;
  const tint = { success: colors.success, error: colors.danger, info: colors.primary };

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <View style={[styles.toastArea, { pointerEvents: "box-none", bottom: insets.bottom + (Platform.OS === "web" ? 72 : 88) }]}>
        {toasts.map((t) => (
          <View
            key={t.id}
            testID="toast"
            accessibilityLiveRegion="polite"
            {...({ role: t.type === "error" ? "alert" : "status" } as object)}
            style={[styles.toast, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: tint[t.type] }]}
          >
            <MaterialIcons name={icon[t.type]} size={20} color={tint[t.type]} />
            <AppText style={{ flex: 1 }}>{t.message}</AppText>
            {t.actionLabel && t.onAction ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                <AppText variant="label" color={colors.primary}>
                  {t.actionLabel}
                </AppText>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => dismiss(t.id)} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
      </View>
      <Sheet
        visible={!!dialog}
        onClose={() => closeDialog(false)}
        title={dialog?.title ?? ""}
        maxWidth={440}
        testID="confirm-dialog"
        footer={
          <>
            <Button title={dialog?.cancelLabel ?? "Cancel"} variant="outline" onPress={() => closeDialog(false)} />
            <Button
              title={dialog?.confirmLabel ?? "Confirm"}
              variant={dialog?.destructive ? "danger" : "primary"}
              onPress={() => closeDialog(true)}
              testID="confirm-dialog-confirm"
            />
          </>
        }
      >
        {dialog?.message ? <AppText>{dialog.message}</AppText> : null}
      </Sheet>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackValue {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback must be used inside FeedbackProvider");
  return value;
}

const styles = StyleSheet.create({
  toastArea: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, zIndex: 1000 },
  toast: {
    width: "100%",
    maxWidth: 480,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 4,
    ...shadow("md"),
  },
});
