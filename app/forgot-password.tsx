import { Link, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { AuthLayout } from "@/src/components/auth/AuthLayout";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { Notice } from "@/src/components/ui/States";
import { TextField } from "@/src/components/ui/TextField";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { friendlyError } from "@/src/lib/errors";
import { validateEmail } from "@/src/lib/validation";

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { colors } = useTheme();
  const { configured, sendPasswordReset } = useAuth();
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const problem = validateEmail(email);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (e) {
      setError(friendlyError(e, "We couldn't send the reset email. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your account email and we'll send you a link to choose a new password.">
      {sent ? (
        <Notice tone="success">
          <AppText testID="reset-sent">If an account exists for {email.trim()}, a password reset link is on its way. Check your inbox and spam folder.</AppText>
        </Notice>
      ) : null}
      <TextField
        label="Email"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          setSent(false);
        }}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        error={error}
        testID="reset-email"
        onSubmitEditing={submit}
      />
      <Button title={sent ? "Send again" : "Send reset link"} onPress={submit} loading={busy} disabled={!configured} fullWidth size="lg" testID="reset-submit" />
      <AppText center variant="muted">
        Remembered it?{" "}
        <Link href={{ pathname: "/login", params: email ? { email } : {} }} style={{ color: colors.primary, fontWeight: "700" }}>
          Back to sign in
        </Link>
      </AppText>
    </AuthLayout>
  );
}
