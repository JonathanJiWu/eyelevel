# Deploying eyelevel

eyelevel is an Expo Router app. The web build consists of:

- **Pre-rendered pages + client bundle** (`npm run build:web` → `dist/client`, `dist/server`; it runs `npx expo export -p web` and writes the pages' Content-Security-Policy)
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
5. Restrict the API key, and optionally turn on App Check: see [1.3](#13-restrict-the-firebase-api-key-and-enable-app-check).

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

### 1.3 Restrict the Firebase API key and enable App Check

The Firebase web config, API key included, ships in every browser bundle and is in this repository's early git history. That is expected (a Firebase web API key identifies the project; it isn't a password, and data access is enforced by `firestore.rules`), but an **unrestricted** key can be used from anywhere to call every API enabled in the project, for example to create accounts in bulk or burn quota. Restricting the key is the fix. Rewriting git history would not help: the key has been public, and clones keep it.

**Restrict the key** (Google Cloud console, a few minutes):

1. Open <https://console.cloud.google.com/apis/credentials?project=eyelevel-2025> and select the key whose value equals `EXPO_PUBLIC_FIREBASE_API_KEY` (usually "Browser key (auto created by Firebase)").
2. **Application restrictions → Websites**, add:
   - `https://<your-domain>/*` (each production domain)
   - `https://eyelevel-2025.firebaseapp.com/*` (Firebase's sign-in handler, used by Google sign-in)
   - optional: `https://*.vercel.app/*` for preview deployments, `http://localhost:8081/*` for local development
3. **API restrictions → Restrict key**, select: *Identity Toolkit API*, *Token Service API* and *Cloud Firestore API*, plus *Firebase App Check API* if you use App Check.
4. **Save.** Restrictions take up to ~5 minutes to apply. Then check sign-in, search and saving a movie on the live site.

Native builds: the JS SDK on iOS/Android sends no browser referrer, so a website-restricted key rejects their requests. Create a second key with API restrictions only (step 3) for native builds and put it in the EAS build environment.

To **rotate** the key instead (optional): create a new browser key, restrict it as above, set `EXPO_PUBLIC_FIREBASE_API_KEY` to it, redeploy, check the site, then delete the old key.

**App Check (optional, web):** proves requests come from your site, not a script reusing the key.

1. Create a reCAPTCHA v3 key at <https://www.google.com/recaptcha/admin> (type *Score based (v3)*, domains: your production domains).
2. Firebase console → **App Check → Apps** → your web app → **reCAPTCHA** → paste the reCAPTCHA *secret* key → Save.
3. Set `EXPO_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` to the reCAPTCHA *site* key and redeploy (the build adds reCAPTCHA's origins to the Content-Security-Policy automatically).
4. Watch **App Check → APIs** for a few days. When almost all requests are verified, press **Enforce** for Cloud Firestore and Authentication. Enforcement also blocks clients without App Check: the native apps (they have no attestation provider yet) and local development without a debug token (`EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN`, registered under *App Check → Manage debug tokens*).

---

## 2. Deploy to Vercel (recommended)

1. <https://vercel.com/new> → **Import Git Repository** → `JonathanJiWu/eyelevel`.
2. Framework preset: **Other** (everything is configured in `vercel.json`: build `npm run build:web`, output `dist/client`, server function `api/index.js`).
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

   **Shared rate limit (recommended):** Vercel runs many instances of the API function, each with its own per-IP limiter. For one limit across all of them, add a Redis database: *Vercel → Storage → Marketplace → Upstash (Redis)* → connect it to the project (this sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`), or create one at <https://console.upstash.com> and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Defaults: 300 API requests per minute per IP (`API_RATE_LIMIT_PER_WINDOW`, `API_RATE_LIMIT_WINDOW_SECONDS`). If Redis is unreachable, requests are allowed and a warning is logged.
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

Without Docker (Node 22.13+):

```bash
npm ci && npm run build:web && TMDB_API_KEY=... PORT=3000 npm run serve
```

`server/index.js` serves static assets with long-lived caching, the pre-rendered pages and `/api/*`, adds security headers (including the Content-Security-Policy), and exposes `GET /healthz`. Put it behind HTTPS (all the hosts above terminate TLS for you). With several instances, set the Upstash variables above for a shared rate limit.

---

## 4. Verify a deployment

Run the automated check first. It covers health and the TMDB key, movie data, pages and the 404 page, security headers, asset caching, and the Firebase config in the bundle:

```bash
npm run verify:deploy -- https://<your-domain>
```

Then check by hand what needs a person (and email):

1. Open the site: the Discover grid loads, search and filters work, a movie page shows details.
2. Create an account → you land on Discover signed in; reload — still signed in.
3. Save a movie, create a list, rate a movie; sign out and back in — everything is still there.
4. Request a password reset — the email arrives.
5. With a second account: send a friend request, accept it, open the friend's profile, compare watchlists.
6. Open the browser console on a few pages: there must be no "Refused to load / connect" messages from the Content-Security-Policy. To try a policy change safely, deploy with `CSP_REPORT_ONLY=true` first.

## 5. Redeploy / roll back

- **App:** push to `master` (Vercel builds and deploys automatically). Roll back from *Vercel → Deployments → ⋯ → Promote to Production* on an earlier deployment.
- **Firestore rules / indexes:** `npm run deploy:firestore -- --project eyelevel-2025` after editing `firestore.rules` / `firestore.indexes.json`. Run `npm run test:rules` first.
- **CI:** `.github/workflows/ci.yml` runs typecheck, lint, unit/API tests, Firestore rules tests, the production build and the Playwright end-to-end suite on every push. `.github/workflows/android.yml` generates the Android project and compiles a release APK whenever dependencies or native configuration change (or on demand), and keeps the APK as a downloadable artifact for 7 days.

## Environment variables reference

| Variable | Where | Required | Purpose |
| --- | --- | --- | --- |
| `TMDB_API_KEY` / `TMDB_READ_ACCESS_TOKEN` | server runtime | yes (one of) | TMDB credential used by `/api/*` |
| `TMDB_API_BASE_URL` | server runtime | no | Override TMDB base URL (tests use the mock) |
| `TMDB_LANGUAGE` | server runtime | no | Default `en-US` |
| `TMDB_TIMEOUT_MS`, `TMDB_MAX_RETRIES` | server runtime | no | Upstream timeout (8000) / retries (2) |
| `API_RATE_LIMIT_BURST`, `API_RATE_LIMIT_PER_SECOND` | server runtime | no | Per-IP limiter in each instance (120 burst, 4/s) |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` + `KV_REST_API_TOKEN`) | server runtime | recommended on Vercel | Rate limit shared by all instances (secret token) |
| `API_RATE_LIMIT_PER_WINDOW`, `API_RATE_LIMIT_WINDOW_SECONDS`, `API_RATE_LIMIT_TIMEOUT_MS` | server runtime | no | Shared limit: 300 requests / 60 s per IP; Redis timeout 500 ms |
| `CSP_REPORT_ONLY`, `CSP_REPORT_URI`, `CSP_DISABLED` | server runtime | no | Content-Security-Policy mode and reporting |
| `CSP_EXTRA_CONNECT_SRC`, `CSP_EXTRA_IMG_SRC`, `CSP_EXTRA_SCRIPT_SRC`, `CSP_EXTRA_FRAME_SRC` | build time | no | Extra allowed origins (space-separated) |
| `PORT`, `EXPO_DIST_DIR`, `TRUST_PROXY_HOPS` | `server/index.js` | no | Node server settings |
| `EXPO_PUBLIC_FIREBASE_*` (6 values) | build time | yes | Firebase web config |
| `EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN` | build time | no | Show "Continue with Google" (web) |
| `EXPO_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` | build time | no | Firebase App Check on the web (reCAPTCHA v3 site key) |
| `EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN` | build time | no | App Check debug token (local development only) |
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

The native projects are not committed: they are generated from `app.json` (Expo's *Continuous Native Generation*). `android/` and `ios/` are git-ignored; `npx expo prebuild`, `npx expo run:android|ios` and EAS Build create them, so they always match the installed Expo SDK.

**Before the first build:**

1. Deploy the website first. The apps call its `/api` routes, so set `EXPO_PUBLIC_API_BASE_URL=https://<your-domain>`.
2. Choose your own app identifiers: in `app.json`, replace `com.anonymous.eyelevel` (`ios.bundleIdentifier`, `android.package`) with a reverse-DNS name you control. It can't be changed after the first store release.
3. Use an API key without website restrictions for native builds (see [1.3](#13-restrict-the-firebase-api-key-and-enable-app-check)).

**Build in the cloud with EAS** (no Mac needed for iOS; needs a free Expo account, plus Apple / Google developer accounts to publish):

```bash
npm install --global eas-cli
```

```bash
eas login
```

```bash
eas init
```

Add the `EXPO_PUBLIC_*` variables (Firebase config, `EXPO_PUBLIC_API_BASE_URL`) under *expo.dev → your project → Environment variables*, for the environments used in `eas.json` (`development`, `preview`, `production`). Then:

```bash
eas build --profile preview --platform android
```

```bash
eas build --profile production --platform all
```

`preview` produces an installable Android APK and an internal-distribution iOS build. `production` produces store builds; `eas submit` uploads them.

**Build locally:** Android needs JDK 17+ and the Android SDK; iOS needs macOS with Xcode and CocoaPods.

```bash
npx expo run:android --variant release
```

```bash
npx expo run:ios --configuration Release
```
