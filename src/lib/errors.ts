/** Turn Firebase / network errors into messages a user can act on. */
const AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/user-not-found": "Email or password is incorrect.",
  "auth/invalid-email": "That email address isn't valid.",
  "auth/missing-email": "Enter your email address.",
  "auth/email-already-in-use": "An account with this email already exists. Try signing in instead.",
  "auth/weak-password": "That password is too weak. Use at least 8 characters with letters and numbers.",
  "auth/password-does-not-meet-requirements": "That password doesn't meet the project's password policy.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/requires-recent-login": "For security, please enter your current password again.",
  "auth/operation-not-allowed": "This sign-in method isn't enabled for this app.",
  "auth/popup-closed-by-user": "The sign-in window was closed before finishing.",
  "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups and try again.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/unauthorized-domain": "This domain isn't authorized for sign-in yet (add it in Firebase Auth settings).",
  "auth/expired-action-code": "This link has expired. Request a new one.",
  "auth/invalid-action-code": "This link is invalid or was already used.",
};

const FIRESTORE_MESSAGES: Record<string, string> = {
  "permission-denied": "You don't have permission to do that.",
  unavailable: "We can't reach the server right now. Check your connection and try again.",
  "deadline-exceeded": "The request timed out. Please try again.",
  "resource-exhausted": "The service is busy right now. Please try again shortly.",
  "not-found": "That item no longer exists.",
  "already-exists": "That already exists.",
  unauthenticated: "Please sign in again.",
  "failed-precondition": "That can't be done right now. Refresh and try again.",
};

export function errorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}

/** Errors thrown by the app's own data layer carry user-facing messages. */
const APP_ERRORS = new Set(["LibraryError", "FriendError", "UsernameTakenError", "ApiError"]);

export function friendlyError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof Error && APP_ERRORS.has(error.name) && error.message) return error.message;
  const code = errorCode(error);
  if (code) {
    if (AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
    const short = code.replace(/^firestore\//, "");
    if (FIRESTORE_MESSAGES[short]) return FIRESTORE_MESSAGES[short];
  }
  if (error instanceof Error && /network|fetch/i.test(error.message)) {
    return "Network error. Check your connection and try again.";
  }
  return fallback;
}
