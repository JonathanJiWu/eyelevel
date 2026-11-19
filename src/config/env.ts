/**
 * Public client configuration.
 *
 * Only variables prefixed with EXPO_PUBLIC_ are inlined into the client
 * bundle (they must be referenced as `process.env.EXPO_PUBLIC_X` literally).
 * Nothing secret belongs here: the Firebase web config is a public project
 * identifier (access is enforced by Firestore security rules), and the TMDB
 * credential lives only on the server (see src/server/tmdb.ts).
 */

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
};

export const useFirebaseEmulators = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true";
export const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";
export const authEmulatorPort = Number(process.env.EXPO_PUBLIC_AUTH_EMULATOR_PORT || 9099);
export const firestoreEmulatorPort = Number(process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080);

export const isFirebaseConfigured = useFirebaseEmulators
  ? Boolean(firebaseConfig.projectId)
  : Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

/**
 * Base URL of the eyelevel API. Empty on web (same origin). Native builds
 * must set EXPO_PUBLIC_API_BASE_URL to the deployed site, e.g.
 * https://eyelevel.example.com
 */
export const apiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

export const tmdbImageBaseUrl = (process.env.EXPO_PUBLIC_TMDB_IMAGE_BASE_URL || "https://image.tmdb.org/t/p").replace(
  /\/+$/,
  "",
);

export const googleSignInEnabled = process.env.EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN === "true";
