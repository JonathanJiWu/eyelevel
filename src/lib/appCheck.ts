import type { FirebaseApp } from "firebase/app";

/**
 * Firebase App Check is set up on web only (reCAPTCHA v3, see appCheck.web.ts).
 * Native builds use the JS SDK without an attestation provider.
 */
export function startAppCheck(_app: FirebaseApp): void {}
