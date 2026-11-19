/**
 * Authentication + account state.
 *
 * - Firebase Auth handles credentials and session persistence (IndexedDB on
 *   web, AsyncStorage on native), so sessions survive refreshes and restarts.
 * - After sign-in the user's public profile and private user doc are
 *   subscribed. Missing profiles are created automatically (new accounts,
 *   Google sign-ins, and legacy v1 users, whose data is migrated without
 *   deleting anything).
 */
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updatePassword,
  updateProfile as updateAuthProfile,
  type User,
} from "firebase/auth";
import { getDoc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc } from "firebase/firestore";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { isFirebaseConfigured } from "@/src/config/env";
import { deleteUserData } from "@/src/data/account";
import { sendFriendRequest } from "@/src/data/friends";
import {
  clearProfileCache,
  setupAccount,
  setupAccountWithGeneratedUsername,
  updatePreferences as savePreferences,
  updatePrivacy as savePrivacy,
  updateProfile as saveProfile,
  UsernameTakenError,
  type ProfilePatch,
} from "@/src/data/profile";
import { refs, toProfile, toUserDoc } from "@/src/data/refs";
import { DEFAULT_PREFERENCES, DEFAULT_PRIVACY, SCHEMA_VERSION, type Preferences, type PrivacySettings, type Profile, type UserDoc } from "@/src/data/types";
import { errorCode, friendlyError } from "@/src/lib/errors";
import { canUseFirebase, getFirebase } from "@/src/lib/firebase";
import { sanitizeText } from "@/src/lib/validation";

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  username: string;
}

interface AuthValue {
  configured: boolean;
  initializing: boolean;
  user: User | null;
  profile: Profile | null;
  userDoc: UserDoc | null;
  /** Signed in AND profile + private doc are loaded. */
  accountReady: boolean;
  accountError: string | null;
  /** Set when sign-up had to pick a different username than requested. */
  usernameNotice: string | null;
  clearUsernameNotice: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string | null) => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<void>;
  updatePrivacy: (privacy: PrivacySettings) => Promise<void>;
  updatePreferences: (preferences: Preferences) => Promise<void>;
  retrySetup: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

interface PendingRegistration {
  email: string;
  displayName: string;
  username: string;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [userDocLoaded, setUserDocLoaded] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [usernameNotice, setUsernameNotice] = useState<string | null>(null);
  const [setupAttempt, setSetupAttempt] = useState(0);
  const pending = useRef<PendingRegistration | null>(null);
  const setupInFlight = useRef(new Map<string, Promise<void>>());
  // While an account is being deleted its profile disappears; never "repair" it.
  const deleting = useRef(false);

  useEffect(() => {
    if (!canUseFirebase()) {
      setInitializing(false);
      return;
    }
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setInitializing(false);
    });
  }, []);

  // Subscribe to the signed-in user's profile and private doc.
  useEffect(() => {
    if (!user) deleting.current = false;
    setProfile(null);
    setUserDoc(null);
    setProfileLoaded(false);
    setUserDocLoaded(false);
    setAccountError(null);
    if (!user) return;
    const { db } = getFirebase();
    const onError = (error: unknown) => setAccountError(friendlyError(error, "We couldn't load your account."));
    const unsubProfile = onSnapshot(
      refs.profile(db, user.uid),
      (snap) => {
        if (!snap.exists() && snap.metadata.fromCache) return;
        setProfile(toProfile(snap));
        setProfileLoaded(true);
      },
      onError,
    );
    const unsubUser = onSnapshot(
      refs.user(db, user.uid),
      (snap) => {
        if (!snap.exists() && snap.metadata.fromCache) return;
        setUserDoc(toUserDoc(snap));
        setUserDocLoaded(true);
      },
      onError,
    );
    return () => {
      unsubProfile();
      unsubUser();
    };
  }, [user]);

  /** Create profile/defaults (or migrate legacy data) exactly once per user. */
  const ensureAccount = useCallback((current: User): Promise<void> => {
    const existingRun = setupInFlight.current.get(current.uid);
    if (existingRun) return existingRun;
    const run = (async () => {
      const { db } = getFirebase();
      const [profileSnap, userSnap, listsSnap] = await Promise.all([
        getDoc(refs.profile(db, current.uid)),
        getDoc(refs.user(db, current.uid)),
        getDocs(query(refs.watchlists(db, current.uid), limit(1))),
      ]);
      const existing = toUserDoc(userSnap);
      if (profileSnap.exists()) {
        if (!existing || existing.schemaVersion < SCHEMA_VERSION) {
          await setDoc(
            refs.user(db, current.uid),
            {
              email: current.email,
              privacy: existing?.privacy ?? DEFAULT_PRIVACY,
              preferences: existing?.preferences ?? DEFAULT_PREFERENCES,
              schemaVersion: SCHEMA_VERSION,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
        return;
      }
      const registration = pending.current && pending.current.email === current.email ? pending.current : null;
      const fallbackName =
        registration?.displayName ||
        existing?.name ||
        current.displayName ||
        (current.email ? current.email.split("@")[0] : "Movie fan");
      const base = { uid: current.uid, email: current.email, displayName: sanitizeText(fallbackName, 40), existing, hasLists: !listsSnap.empty };
      if (registration) {
        try {
          await setupAccount(db, { ...base, username: registration.username });
        } catch (error) {
          if (!(error instanceof UsernameTakenError)) throw error;
          const created = await setupAccountWithGeneratedUsername(db, { ...base, preferredUsername: registration.username });
          setUsernameNotice(`@${registration.username} was just taken, so you're @${created.username}. You can change it in your profile.`);
        }
      } else {
        await setupAccountWithGeneratedUsername(db, base);
      }
      pending.current = null;
      // Legacy friends were one-directional; invite them to confirm instead of
      // silently creating friendships they never agreed to.
      const legacyFriends = Array.isArray(existing?.friends) ? existing!.friends : [];
      for (const friend of legacyFriends.slice(0, 50)) {
        const id = friend && typeof friend === "object" ? (friend as { id?: unknown }).id : null;
        if (typeof id === "string" && id && id !== current.uid) {
          await sendFriendRequest(db, current.uid, id).catch(() => undefined);
        }
      }
    })().finally(() => setupInFlight.current.delete(current.uid));
    setupInFlight.current.set(current.uid, run);
    return run;
  }, []);

  useEffect(() => {
    if (!user || !profileLoaded || !userDocLoaded || deleting.current) return;
    if (profile && userDoc && userDoc.schemaVersion >= SCHEMA_VERSION) return;
    let cancelled = false;
    ensureAccount(user).catch((error) => {
      if (!cancelled) setAccountError(friendlyError(error, "We couldn't finish setting up your account."));
    });
    return () => {
      cancelled = true;
    };
  }, [user, profile, userDoc, profileLoaded, userDocLoaded, ensureAccount, setupAttempt]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { auth } = getFirebase();
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const { auth } = getFirebase();
      const email = input.email.trim();
      pending.current = { email, displayName: input.displayName, username: input.username.trim() };
      const credential = await createUserWithEmailAndPassword(auth, email, input.password);
      await updateAuthProfile(credential.user, { displayName: sanitizeText(input.displayName, 40) }).catch(() => undefined);
      sendEmailVerification(credential.user).catch(() => undefined);
      await ensureAccount(credential.user);
    },
    [ensureAccount],
  );

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS !== "web") throw new Error("Google sign-in is available on the web app.");
    const { auth } = getFirebase();
    await signInWithPopup(auth, new GoogleAuthProvider());
  }, []);

  const signOut = useCallback(async () => {
    const { auth } = getFirebase();
    await firebaseSignOut(auth);
    clearProfileCache();
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { auth } = getFirebase();
    const origin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : null;
    try {
      await sendPasswordResetEmail(auth, email.trim(), origin ? { url: `${origin}/login` } : undefined);
    } catch (error) {
      const code = errorCode(error);
      if (origin && (code === "auth/unauthorized-continue-uri" || code === "auth/invalid-continue-uri")) {
        await sendPasswordResetEmail(auth, email.trim());
        return;
      }
      // Don't reveal whether an account exists for this address.
      if (code === "auth/user-not-found") return;
      throw error;
    }
  }, []);

  const resendVerification = useCallback(async () => {
    const { auth } = getFirebase();
    if (!auth.currentUser) throw new Error("Please sign in again.");
    await sendEmailVerification(auth.currentUser);
  }, []);

  const reauthenticate = useCallback(async (password: string | null) => {
    const { auth } = getFirebase();
    const current = auth.currentUser;
    if (!current) throw new Error("Please sign in again.");
    const usesPassword = current.providerData.some((p) => p.providerId === "password");
    if (usesPassword) {
      if (!password) throw new Error("Enter your current password.");
      await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email ?? "", password));
    } else if (Platform.OS === "web") {
      await reauthenticateWithPopup(current, new GoogleAuthProvider());
    }
    return current;
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const current = await reauthenticate(currentPassword);
      await updatePassword(current, newPassword);
    },
    [reauthenticate],
  );

  const deleteAccount = useCallback(
    async (password: string | null) => {
      const current = await reauthenticate(password);
      const { db } = getFirebase();
      deleting.current = true;
      try {
        await deleteUserData(db, current.uid, profile?.usernameLower ?? null);
        await deleteUser(current);
      } catch (error) {
        deleting.current = false;
        throw error;
      }
      clearProfileCache();
    },
    [reauthenticate, profile],
  );

  const updateProfile = useCallback(
    async (patch: ProfilePatch) => {
      if (!profile) throw new Error("Your profile is still loading.");
      await saveProfile(getFirebase().db, profile, patch);
    },
    [profile],
  );

  const updatePrivacy = useCallback(
    async (privacy: PrivacySettings) => {
      if (!user) throw new Error("Please sign in.");
      await savePrivacy(getFirebase().db, user.uid, privacy);
    },
    [user],
  );

  const updatePreferences = useCallback(
    async (preferences: Preferences) => {
      if (!user) throw new Error("Please sign in.");
      await savePreferences(getFirebase().db, user.uid, preferences);
    },
    [user],
  );

  const accountReady = Boolean(user && profile && userDoc && userDoc.schemaVersion >= SCHEMA_VERSION);

  const value = useMemo<AuthValue>(
    () => ({
      configured: isFirebaseConfigured,
      initializing,
      user,
      profile,
      userDoc,
      accountReady,
      accountError,
      usernameNotice,
      clearUsernameNotice: () => setUsernameNotice(null),
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      sendPasswordReset,
      resendVerification,
      changePassword,
      deleteAccount,
      updateProfile,
      updatePrivacy,
      updatePreferences,
      retrySetup: () => {
        setAccountError(null);
        setSetupAttempt((n) => n + 1);
      },
    }),
    [
      initializing,
      user,
      profile,
      userDoc,
      accountReady,
      accountError,
      usernameNotice,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      sendPasswordReset,
      resendVerification,
      changePassword,
      deleteAccount,
      updateProfile,
      updatePrivacy,
      updatePreferences,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
