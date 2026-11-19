import { Link, Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, View } from "react-native";
import { AuthLayout, safeRedirect } from "@/src/components/auth/AuthLayout";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { LoadingState, Notice } from "@/src/components/ui/States";
import { TextField } from "@/src/components/ui/TextField";
import { googleSignInEnabled } from "@/src/config/env";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { friendlyError } from "@/src/lib/errors";
import { validateEmail } from "@/src/lib/validation";

export default function LoginScreen() {
  const params = useLocalSearchParams<{ redirect?: string; email?: string }>();
  const redirect = safeRedirect(params.redirect);
  const router = useRouter();
  const { colors } = useTheme();
  const { configured, initializing, user, signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null; form?: string | null }>({});
  const [busy, setBusy] = useState<"password" | "google" | null>(null);

  if (initializing) return <LoadingState />;
  if (user && !busy) return <Redirect href={redirect as never} />;

  const submit = async () => {
    const next = { email: validateEmail(email), password: password ? null : "Enter your password." };
    setErrors(next);
    if (next.email || next.password) return;
    setBusy("password");
    try {
      await signIn(email, password);
      router.dismissTo(redirect as never);
    } catch (e) {
      setErrors({ form: friendlyError(e, "Sign-in failed. Please try again.") });
      setBusy(null);
    }
  };

  const google = async () => {
    setBusy("google");
    setErrors({});
    try {
      await signInWithGoogle();
      router.dismissTo(redirect as never);
    } catch (e) {
      setErrors({ form: friendlyError(e, "Google sign-in failed.") });
      setBusy(null);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to see your watchlists and friends.">
      {!configured ? <Notice tone="danger">Sign-in isn't available: this deployment is missing its Firebase configuration.</Notice> : null}
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        error={errors.email}
        testID="login-email"
        onSubmitEditing={submit}
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        password
        autoComplete="current-password"
        error={errors.password}
        testID="login-password"
        onSubmitEditing={submit}
      />
      <View style={{ alignItems: "flex-end" }}>
        <Link href={{ pathname: "/forgot-password", params: email ? { email } : {} }} style={{ color: colors.primary, fontWeight: "600" }} testID="forgot-password-link">
          Forgot password?
        </Link>
      </View>
      {errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}
      <Button title="Sign in" onPress={submit} loading={busy === "password"} disabled={!configured || busy !== null} fullWidth size="lg" testID="login-submit" />
      {googleSignInEnabled && Platform.OS === "web" ? (
        <Button title="Continue with Google" icon="login" variant="outline" onPress={google} loading={busy === "google"} disabled={!configured || busy !== null} fullWidth />
      ) : null}
      <AppText center variant="muted">
        New to eyelevel?{" "}
        <Link href={{ pathname: "/register", params: redirect !== "/" ? { redirect } : {} }} style={{ color: colors.primary, fontWeight: "700" }} testID="register-link">
          Create an account
        </Link>
      </AppText>
    </AuthLayout>
  );
}
