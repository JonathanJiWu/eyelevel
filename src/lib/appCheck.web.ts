import type { FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { appCheckDebugToken, appCheckSiteKey, useFirebaseEmulators } from "@/src/config/env";

/**
 * Firebase App Check (web): attaches a reCAPTCHA v3 attestation to Firebase
 * requests so the project can reject traffic that doesn't come from this
 * site. Optional: enabled when EXPO_PUBLIC_FIREBASE_APPCHECK_SITE_KEY is set
 * (see DEPLOYMENT.md, "Restrict the Firebase API key and enable App Check").
 */
export function startAppCheck(app: FirebaseApp): void {
  if (!appCheckSiteKey || useFirebaseEmulators || typeof window === "undefined") return;
  if (appCheckDebugToken) {
    // Local development only: register this token in the Firebase console.
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
  }
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
}
