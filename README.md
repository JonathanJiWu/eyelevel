# eyelevel

[![CI](https://github.com/JonathanJiWu/eyelevel/actions/workflows/ci.yml/badge.svg)](https://github.com/JonathanJiWu/eyelevel/actions/workflows/ci.yml)
[![Android build](https://github.com/JonathanJiWu/eyelevel/actions/workflows/android.yml/badge.svg)](https://github.com/JonathanJiWu/eyelevel/actions/workflows/android.yml)

Discover movies, build watchlists, and see what your friends want to watch.

eyelevel is a React Native app built with Expo Router. The same code runs as a website and as iOS and Android apps. Accounts and data live in Firebase; movie data comes from TMDB through the app's own server, so the TMDB key never reaches a browser.

## Features

- **Accounts**: sign up with email and password, stay signed in, reset a forgotten password by email, verify your email, change your password, or delete your account and all its data. Optional Google sign-in on the web.
- **Profiles**: display name, unique `@username`, bio, avatar color, favorite genres and preferred language.
- **Discover**: popular movies, fast search that matches partial titles and tolerates typos (*"interstelar"* finds *Interstellar*), and infinite scroll. Filters combine freely: genres (any or all), release years, TMDB score, popularity, original language, runtime, US age rating and sort order. They also work together with a search, over the top 500 matches. Filters live in the URL, so results survive a reload and can be shared.
- **Movie pages**: poster, backdrop, score, runtime, age rating, genres, overview, director and writers, cast, trailer and recommendations.
- **Watchlists**: create, rename, describe, delete and organize several lists; add a movie to more than one list; mark movies watched; rate them 1–5 stars; sort and filter inside a list; undo a removal; see your activity history.
- **Friends**: find people by username or name; send, cancel, accept and decline requests; remove friends. Updates arrive live, with a badge for new requests.
- **Watching together**: see which friends saved or watched a movie, browse friends' shared lists, compare with one friend (both want it, only you, only them, watched together, ratings) or with several friends at once (what *everyone* wants to watch), with a match score.
- **Privacy**: each list is *Private* or *Friends*. You choose whether friends see your watched history and ratings, and whether people can find you or send you requests. Your email is never shown to anyone.
- Light and dark themes, layouts for phone, tablet and desktop, accessible labels, and loading, empty and error states throughout.

## Tech stack

| Layer | Technology |
| --- | --- |
| App | Expo SDK 58, Expo Router (pre-rendered pages + API routes), React 19, React Native 0.88, React Native Web |
| Accounts and data | Firebase Authentication, Cloud Firestore (access rules in `firestore.rules`) |
| Movie data | TMDB API, called only from the app's server (`/api` routes) |
| Hosting | Vercel (`vercel.json`, `api/index.js`) or any Node or Docker host (`server/index.js`, `Dockerfile`) |
| Native builds | EAS Build (`eas.json`); native projects are generated from `app.json` |
| Tests | Jest, `@firebase/rules-unit-testing` with the Firestore emulator, Playwright |

## How it works

```
Browser or native app
  ├─ Firebase Auth ........... sign-in, sessions, password reset
  ├─ Cloud Firestore ......... profiles, lists, saved movies, friendships (checked by firestore.rules)
  └─ /api/* (the app server) . movie data: caching, retries, rate limiting, clean JSON
                                 └─ TMDB API (the key stays on the server)
```

Project layout:

- `app/`: screens (one file per route); `app/api/`: server routes
- `src/context/`: app state for auth, watchlists, friends, theme, toasts and dialogs
- `src/data/`: the Firestore data model (`types.ts`), atomic writes, migration of old accounts
- `src/server/`: TMDB client, search and filtering, rate limiting, HTTP helpers (server only)
- `src/lib/`: filters, search ranking, comparisons, validation, API client
- `server/`: the Node server and the Content-Security-Policy builder; `api/index.js`: the Vercel function
- `firestore.rules`, `firestore.indexes.json`: database access rules and indexes
- `e2e/`, `tests/`: end-to-end, unit, API and security-rules tests

**Privacy by design.** Friends never read each other's private data. Each user's app keeps one friends-readable *shared index* document that holds only what that user chose to share, and the security rules let friends read that document and nothing else.

**Security.**

- Pages are served with a strict Content-Security-Policy: scripts only from the site itself, images only from the TMDB image CDN, and network access only to the API and Firebase.
- The API is rate limited per visitor: in each server instance, and optionally across all instances through Upstash Redis.
- Optional Firebase App Check proves that requests come from the real site.
- Secrets live only in the server's environment and are never committed.

## Getting started

Requirements: Node 22.13 or newer (or 24.3+), and Java 21+ for the Firebase emulators.

```bash
npm ci
```

### Run everything locally (no accounts needed)

This uses the Firebase emulators and a mock movie API with sample data. Start each in its own terminal:

```bash
npm run emulators
```

```bash
npm run mock:tmdb
```

```bash
EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-eyelevel \
EXPO_PUBLIC_AUTH_EMULATOR_PORT=9099 EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT=8080 \
TMDB_API_BASE_URL=http://127.0.0.1:4010/3 TMDB_API_KEY=test-key \
EXPO_PUBLIC_TMDB_IMAGE_BASE_URL=http://127.0.0.1:4010/img npm run web
```

Open <http://localhost:8081>.

### Run against real Firebase and TMDB

Copy `.env.example` to `.env.local` and fill in the values; the comments in the file say where each one comes from. Then:

```bash
npm run web
```

For the iOS or Android app during development, run `npm run ios` or `npm run android` (this builds a development app; it needs Xcode or the Android SDK).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run web` / `npm start` | Development server (web / native) |
| `npm run build:web` | Production build in `dist/`, including its Content-Security-Policy |
| `npm run serve` | Serve the production build with `server/index.js` |
| `npm run verify:deploy -- <url>` | Check a deployed site end to end |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm test` | Unit and API tests |
| `npm run test:rules` | Firestore security rules and data layer tests (starts the Firestore emulator) |
| `npm run test:e2e` | Builds the app, starts the emulators, mock movie API and server, then runs Playwright |
| `npm run deploy:firestore -- --project eyelevel-2025` | Publish the security rules and indexes |

## Testing

- **Unit and API tests** (`tests/unit`): filters, search ranking, validation, rate limiting, the Content-Security-Policy, and the real API routes against a mock TMDB server.
- **Security rules tests** (`tests/rules`): every Firestore rule, plus the app's data layer, against the Firestore emulator.
- **End-to-end tests** (`e2e/`): sign-up and sign-in, password reset, search and filters, infinite scroll, watchlists, friends and privacy boundaries, layouts at phone, tablet and desktop sizes, and a check that the app never violates its Content-Security-Policy. They run in Chromium against the production build, the Firebase emulators and the mock movie API.

GitHub Actions runs all of these on every push (`.github/workflows/ci.yml`). When dependencies or native configuration change, `.github/workflows/android.yml` also generates the Android project and compiles a release APK.

## Deployment

The quickest route is Vercel, which builds from this repository and redeploys on every push:

1. Publish the Firestore rules and indexes: `npm run deploy:firestore -- --project eyelevel-2025`.
2. Import the repository at <https://vercel.com/new>. The build settings come from `vercel.json`.
3. Set the environment variables: the TMDB key, which stays on the server, and the six public Firebase web config values. Then deploy.
4. Check the live site:

   ```bash
   npm run verify:deploy -- https://your-domain.example
   ```

[DEPLOYMENT.md](DEPLOYMENT.md) covers every step in detail. It also covers Docker and other Node hosts, the full list of environment variables, restricting the Firebase API key, the shared rate limit, rollback, and data migration.

### Native apps

iOS and Android apps are built with EAS Build from the same code: `eas build --profile preview --platform android`, for example. The `android/` and `ios/` folders are generated from `app.json` and are not committed. Before the first store release, replace the placeholder app ID `com.anonymous.eyelevel` with your own. See *Native apps* in DEPLOYMENT.md.

## Data source

Movie data and images are provided by [TMDB](https://www.themoviedb.org/). This product uses the TMDB API but is not endorsed or certified by TMDB.

## License

MIT. See [LICENSE](LICENSE).
