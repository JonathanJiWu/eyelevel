import { Link, Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { AuthLayout, safeRedirect } from "@/src/components/auth/AuthLayout";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { LoadingState, Notice } from "@/src/components/ui/States";
import { TextField } from "@/src/components/ui/TextField";
import { isUsernameAvailable } from "@/src/data/profile";
import { LIMITS } from "@/src/data/types";
import { useAuth } from "@/src/context/AuthContext";
import { useFeedback } from "@/src/context/FeedbackContext";
import { useTheme } from "@/src/context/ThemeContext";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import { errorCode, friendlyError } from "@/src/lib/errors";
import { canUseFirebase, getFirebase } from "@/src/lib/firebase";
import { usernameFromName, validateDisplayName, validateEmail, validatePassword, validateUsername } from "@/src/lib/validation";

type Field = "displayName" | "username" | "email" | "password" | "confirm" | "form";

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ redirect?: string }>();
  const redirect = safeRedirect(params.redirect);
  const router = useRouter();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const { configured, initializing, user, signUp } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string | null>>>({});
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [busy, setBusy] = useState(false);
  const debouncedUsername = useDebouncedValue(username.trim(), 400);

  // Suggest a username from the display name until the user edits it.
  useEffect(() => {
    if (!usernameTouched && displayName.trim()) setUsername(usernameFromName(displayName));
  }, [displayName, usernameTouched]);

  useEffect(() => {
    if (!canUseFirebase() || validateUsername(debouncedUsername)) {
      setAvailability("idle");
      return;
    }
    let cancelled = false;
    setAvailability("checking");
    isUsernameAvailable(getFirebase().db, debouncedUsername)
      .then((ok) => !cancelled && setAvailability(ok ? "available" : "taken"))
      .catch(() => !cancelled && setAvailability("idle"));
    return () => {
      cancelled = true;
    };
  }, [debouncedUsername]);

  if (initializing) return <LoadingState />;
  if (user && !busy) return <Redirect href={redirect as never} />;

  const submit = async () => {
    const next: Partial<Record<Field, string | null>> = {
      displayName: validateDisplayName(displayName),
      username: validateUsername(username) ?? (availability === "taken" ? `@${username.trim()} is already taken.` : null),
      email: validateEmail(email),
      password: validatePassword(password),
      confirm: password === confirm ? null : "Passwords don't match.",
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    try {
      if (!(await isUsernameAvailable(getFirebase().db, username))) {
        setErrors({ username: `@${username.trim()} is already taken.` });
        setBusy(false);
        return;
      }
      await signUp({ email, password, displayName, username });
      toast("Welcome to eyelevel! We sent you an email to verify your address.");
      router.dismissTo(redirect as never);
    } catch (e) {
      const code = errorCode(e);
      if (code === "auth/email-already-in-use" || code === "auth/invalid-email") setErrors({ email: friendlyError(e) });
      else if (code === "auth/weak-password" || code === "auth/password-does-not-meet-requirements") setErrors({ password: friendlyError(e) });
      else setErrors({ form: friendlyError(e, "We couldn't create your account. Please try again.") });
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Save movies, share watchlists with friends and find something to watch together.">
      {!configured ? <Notice tone="danger">Sign-up isn't available: this deployment is missing its Firebase configuration.</Notice> : null}
      <TextField label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={LIMITS.displayName} autoComplete="name" error={errors.displayName} testID="register-name" />
      <TextField
        label="Username"
        value={username}
        onChangeText={(t) => {
          setUsernameTouched(true);
          setUsername(t.replace(/\s/g, ""));
        }}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={LIMITS.username.max}
        error={errors.username ?? (availability === "taken" ? `@${username.trim()} is already taken.` : null)}
        helper={availability === "checking" ? "Checking availability…" : availability === "available" ? `@${username.trim()} is available` : "Friends can find you by this. Letters, numbers and _."}
        testID="register-username"
      />
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" inputMode="email" error={errors.email} testID="register-email" />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        password
        autoComplete="new-password"
        error={errors.password}
        helper="At least 8 characters, including a letter and a number."
        testID="register-password"
      />
      <TextField label="Confirm password" value={confirm} onChangeText={setConfirm} password autoComplete="new-password" error={errors.confirm} testID="register-confirm" onSubmitEditing={submit} />
      {errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}
      <Button title="Create account" onPress={submit} loading={busy} disabled={!configured} fullWidth size="lg" testID="register-submit" />
      <AppText center variant="muted">
        Already have an account?{" "}
        <Link href={{ pathname: "/login", params: redirect !== "/" ? { redirect } : {} }} style={{ color: colors.primary, fontWeight: "700" }} testID="login-link">
          Sign in
        </Link>
      </AppText>
    </AuthLayout>
  );
}
