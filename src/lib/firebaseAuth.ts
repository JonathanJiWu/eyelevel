// Web: persist sessions in IndexedDB (falls back to localStorage).
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import type { FirebaseApp } from "firebase/app";

export function createAuth(app: FirebaseApp): Auth {
  return initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
}
