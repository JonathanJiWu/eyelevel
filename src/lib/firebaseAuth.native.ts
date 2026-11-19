// iOS / Android: persist sessions in AsyncStorage so users stay signed in.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeAuth, type Auth, type Persistence } from "firebase/auth";
import type { FirebaseApp } from "firebase/app";

// getReactNativePersistence only exists in the React Native build of
// firebase/auth (which Metro resolves on native); the web typings omit it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getReactNativePersistence } = require("firebase/auth") as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

export function createAuth(app: FirebaseApp): Auth {
  return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}
