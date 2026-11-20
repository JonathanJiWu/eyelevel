import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, waitForPendingWrites, type Firestore } from "firebase/firestore";
import {
  authEmulatorPort,
  emulatorHost,
  firebaseConfig,
  firestoreEmulatorPort,
  isFirebaseConfigured,
  useFirebaseEmulators,
} from "@/src/config/env";
import { startAppCheck } from "./appCheck";
import { createAuth } from "./firebaseAuth";

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let services: FirebaseServices | null = null;

/** Firebase can only run in a client (browser or device), never during static rendering. */
export const canUseFirebase = () => isFirebaseConfigured && typeof window !== "undefined";

/**
 * Lazily initialize Firebase. Throws when Firebase is not configured so
 * callers can show a configuration message instead of crashing.
 *
 * Firestore uses the in-memory cache on purpose: a persistent (IndexedDB)
 * cache would keep one account's private data on a shared device after
 * sign-out.
 */
export function getFirebase(): FirebaseServices {
  if (services) return services;
  if (!canUseFirebase()) {
    throw new Error(
      "Firebase is not configured. Set the EXPO_PUBLIC_FIREBASE_* environment variables (see .env.example).",
    );
  }
  const fresh = !getApps().length;
  const app = fresh ? initializeApp(firebaseConfig.apiKey ? firebaseConfig : { ...firebaseConfig, apiKey: "demo-api-key" }) : getApp();
  // Before any Auth / Firestore request, so they carry App Check tokens.
  if (fresh) startAppCheck(app);
  const auth = createAuth(app);
  const db = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true });
  if (useFirebaseEmulators) {
    connectAuthEmulator(auth, `http://${emulatorHost}:${authEmulatorPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulatorHost, firestoreEmulatorPort);
    // Test hook (emulator builds only): lets end-to-end tests wait until all
    // local writes are acknowledged before reloading the page.
    (window as unknown as { __eyelevel?: object }).__eyelevel = { waitForPendingWrites: () => waitForPendingWrites(db) };
  }
  services = { app, auth, db };
  return services;
}
