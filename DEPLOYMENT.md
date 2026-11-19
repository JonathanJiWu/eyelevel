# Deploying eyelevel

eyelevel is an Expo Router app. The web build consists of:

- **Pre-rendered pages + client bundle** (`npx expo export -p web` → `dist/client`, `dist/server`)
- **API routes** (`app/api/*+api.ts`) — the server-side TMDB proxy. They run on the server only and are where the TMDB key lives.
- **Firebase Auth + Cloud Firestore** for accounts and data (project `eyelevel-2025`). Access control is enforced by `firestore.rules`.

Any host that can run the Expo server output works. The repo ships ready-to-use configuration for **Vercel** (recommended, free tier, deploys on every git push) and a **Dockerfile** for container hosts (Render, Fly.io, Railway, Google Cloud Run, a VPS…).

---

## 1. Prerequisites (one-time)

| You need | Where to get it |
| --- | --- |
| Firebase project with Auth + Firestore | <https://console.firebase.google.com> (the repo is linked to `eyelevel-2025` in `.firebaserc`) |
| TMDB API key (v3) **or** API Read Access Token (v4) | <https://www.themoviedb.org/settings/api> |
| A host | Vercel account connected to GitHub, or any Docker/Node host |

### 1.1 Firebase console

1. **Authentication → Sign-in method** → enable **Email/Password**. (Optional: enable **Google** and set `EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN=true`.)
2. **Firestore Database** → create the database in **production mode** if it doesn't exist yet.
3. **Project settings → General → Your apps** → add a **Web app** if there is none, and copy its config values (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
4. **Authentication → Settings → Authorized domains** → add your production domain (e.g. `eyelevel.vercel.app`). Required for Google sign-in and for password-reset links that return to the app.
5. Recommended: Google Cloud Console → *APIs & Services → Credentials* → restrict the browser API key to your domains (HTTP referrers). The key is public by design (it ships in every Firebase web app); restricting it limits abuse.

### 1.2 Deploy Firestore security rules and indexes

From a machine where you can log in to Firebase:

```bash
npx firebase-tools@15.37.0 login
```

```bash
npm run deploy:firestore -- --project eyelevel-2025
```

This publishes `firestore.rules` and `firestore.indexes.json` (two composite indexes for people search, plus indexing exemptions for the shared-index maps). **Rules are the authorization layer — deploy them before (or together with) the app.** Index builds can take a few minutes; people search returns an error until they finish.

> Existing data is safe: the rules only *restrict* access. Legacy v1 documents (`users/{uid}` with `watchlist`, `name`, `friends`) are kept as-is and migrated on the user's next sign-in (see [Data migration](#data-migration)).

---

## 2. Deploy to Vercel (recommended)

1. <https://vercel.com/new> → **Import Git Repository** → `JonathanJiWu/eyelevel`.
2. Framework preset: **Other** (everything is configured in `vercel.json`: build `npx expo export -p web`, output `dist/client`, server function `api/index.js`).
3. **Environment Variables** (set for *Production* and *Preview*):

   | Name | Value | Secret? |
   | --- | --- | --- |
   | `TMDB_API_KEY` | your TMDB v3 key (or set `TMDB_READ_ACCESS_TOKEN` instead) | **yes** — server only |
   | `EXPO_PUBLIC_FIREBASE_API_KEY` | from the Firebase web app config | no (public) |
   | `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | `eyelevel-2025.firebaseapp.com` | no |
   | `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `eyelevel-2025` | no |
   | `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | `eyelevel-2025.firebasestorage.app` | no |
   | `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | from the config | no |
   | `EXPO_PUBLIC_FIREBASE_APP_ID` | from the config | no |

   `EXPO_PUBLIC_*` values are inlined into the browser bundle at **build time** — redeploy after changing them. Never prefix the TMDB key with `EXPO_PUBLIC_`.
4. **Deploy.** Pushing to the production branch (`master`) redeploys automatically; every other branch/PR gets a preview URL.
5. Add the Vercel domain to Firebase **Authorized domains** (step 1.1.4). Custom domains: *Vercel → Project → Settings → Domains* (HTTPS certificates are automatic).

## 3. Deploy with Docker / any Node host

```bash
docker build -t eyelevel \
  --build-arg EXPO_PUBLIC_FIREBASE_API_KEY=... \
  --build-arg EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=... \
  --build-arg EXPO_PUBLIC_FIREBASE_APP_ID=... .
```

```bash
docker run -p 3000:3000 -e TMDB_API_KEY=... eyelevel
```

Without Docker (Node 20+):

```bash
npm ci && npm run build:web && TMDB_API_KEY=... PORT=3000 npm run serve
```

`server/index.js` serves static assets with long-lived caching, the pre-rendered pages and `/api/*`, adds security headers, and exposes `GET /healthz`. Put it behind HTTPS (all the hosts above terminate TLS for you).

---

## 4. Verify a deployment

1. `GET https://<your-domain>/api/health` → `{"ok":true,"tmdbConfigured":true,...}`. If `tmdbConfigured` is `false`, the TMDB variable is missing on the server.
2. Open the site: the Discover grid loads, search and filters work, a movie page shows details.
3. Create an account → you land on Discover signed in; reload — still signed in.
4. Save a movie, create a list, rate a movie; sign out and back in — everything is still there.
5. Request a password reset — the email arrives.
6. With a second account: send a friend request, accept it, open the friend's profile, compare watchlists.

## 5. Redeploy / roll back

- **App:** push to `master` (Vercel builds and deploys automatically). Roll back from *Vercel → Deployments → ⋯ → Promote to Production* on an earlier deployment.
- **Firestore rules / indexes:** `npm run deploy:firestore -- --project eyelevel-2025` after editing `firestore.rules` / `firestore.indexes.json`. Run `npm run test:rules` first.
- **CI:** `.github/workflows/ci.yml` runs typecheck, lint, unit/API tests, Firestore rules tests, the production build and the Playwright end-to-end suite on every push.

## Environment variables reference

| Variable | Where | Required | Purpose |
| --- | --- | --- | --- |
| `TMDB_API_KEY` / `TMDB_READ_ACCESS_TOKEN` | server runtime | yes (one of) | TMDB credential used by `/api/*` |
| `TMDB_API_BASE_URL` | server runtime | no | Override TMDB base URL (tests use the mock) |
| `TMDB_LANGUAGE` | server runtime | no | Default `en-US` |
| `TMDB_TIMEOUT_MS`, `TMDB_MAX_RETRIES` | server runtime | no | Upstream timeout (8000) / retries (2) |
| `API_RATE_LIMIT_BURST`, `API_RATE_LIMIT_PER_SECOND` | server runtime | no | Per-IP limiter (120 burst, 4/s) |
| `PORT`, `EXPO_DIST_DIR`, `TRUST_PROXY_HOPS` | `server/index.js` | no | Node server settings |
| `EXPO_PUBLIC_FIREBASE_*` (6 values) | build time | yes | Firebase web config |
| `EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN` | build time | no | Show "Continue with Google" (web) |
| `EXPO_PUBLIC_API_BASE_URL` | build time (native only) | for iOS/Android | Deployed site URL serving `/api` |
| `EXPO_PUBLIC_TMDB_IMAGE_BASE_URL` | build time | no | Image CDN override (tests) |
| `EXPO_PUBLIC_USE_FIREBASE_EMULATORS` (+ host/ports) | build time | no | Local development against emulators |

## Data migration

Schema v2 is documented in `src/data/types.ts`. When a user with v1 data signs in for the first time:

1. A public profile and a unique username are created (from their old `name`).
2. Their old `watchlist` array is imported into a new **private** list called "Watchlist" (one library document per movie; duplicates and malformed entries are skipped).
3. Their old one-way `friends` entries become **friend requests**, so nobody becomes a friend without accepting.
4. `schemaVersion: 2` is set. The legacy fields are **not deleted**, so the migration is non-destructive and can be audited or reverted.

## Native apps (iOS / Android)

The same codebase builds for native with EAS (`eas build`). Set `EXPO_PUBLIC_API_BASE_URL` to the deployed site so the app can reach `/api`, and add the Firebase config variables to the EAS environment. Native store releases are not part of this deployment.
