# eyelevel

Discover movies, build watchlists, and see what your friends want to watch.

eyelevel is a React Native + web app (Expo Router) backed by Firebase and the TMDB movie database. It runs as a website and can be built for iOS and Android from the same code.

## Features

- **Accounts** — email/password registration and sign-in, persistent sessions, password reset by email, email verification, change password, delete account (removes all data). Optional Google sign-in on the web.
- **Profiles** — display name, unique `@username`, bio, avatar color, favorite genres and preferred language.
- **Discover** — popular movies, fast search (debounced, partial titles, typo tolerant: *"interstelar"* finds *Interstellar*), infinite scroll, and filters that combine: genres (any/all), release years, TMDB score, popularity (vote count), original language, runtime, US age rating, and sorting. Every filter also works together with a text search (the server filters and sorts the top 500 matches). Filters live in the URL, so results survive reloads and can be shared.
- **Movie pages** — poster, backdrop, score, runtime, certification, genres, overview, director/writers, cast, trailer, recommendations.
- **Watchlists** — create, rename, describe, delete and organize multiple lists; add a movie to several lists; mark watched; rate 1–5 stars; sort and filter within a list; undo removals; activity history.
- **Friends** — find people by username or name, send/cancel/accept/decline requests, remove friends, live updates and a request badge.
- **Cross-referencing** — see which friends saved or watched a movie, view friends' shared lists, compare with one friend (both want / only you / only them / watched together / ratings) or several friends at once (what *everyone* wants to watch), with a match score.
- **Privacy** — each list is *Private* or *Friends*; choose whether friends see your watched history and ratings; opt out of search or friend requests. Your email is never shown to anyone.
- Light/dark theme, responsive layouts for phone, tablet and desktop, accessible labels, loading/empty/error states everywhere.

## Tech stack

| Layer | Technology |
| --- | --- |
| App | Expo SDK 58, Expo Router (static rendering + API routes), React 19, React Native 0.88 (New Architecture), React Native Web |
| Auth & data | Firebase Authentication, Cloud Firestore (security rules in `firestore.rules`) |
| Movie data | TMDB API v3, accessed **only** through the app's server-side `/api` routes |
| Hosting | Vercel (`vercel.json` + `api/index.js`) or any Node/Docker host (`server/index.js`, `Dockerfile`) |
| Tests | Jest (unit + API), `@firebase/rules-unit-testing` (rules + data layer, Firestore emulator), Playwright (end-to-end with Auth/Firestore emulators and a mock TMDB API) |

## Architecture

```
Browser / native app
  ├─ Firebase Auth ............ sign-in, sessions, password reset
  ├─ Cloud Firestore .......... profiles, lists, library, friendships (authorized by firestore.rules)
  └─ /api/* (server) .......... TMDB proxy: caching, retries, rate limiting, normalization
                                  └─ TMDB API (key never leaves the server)
```

- Pages are served with a strict **Content-Security-Policy** (`server/csp.js`): scripts only from the site itself, images only from the TMDB CDN, network access only to the API and Firebase.
- The API is **rate limited** per client IP: per server instance, and optionally across all instances through Upstash Redis (`src/server/rateLimit.ts`).

- `app/` — routes (screens) and `app/api/` server routes.
- `src/context/` — auth, library (watchlists), social (friends), theme, feedback (toasts/dialogs).
- `src/data/` — Firestore data model (`types.ts`), reads/writes (atomic batches), legacy migration.
- `src/server/` — TMDB client, normalization, API helpers (server only).
- `src/lib/` — filters, search ranking, comparison logic, validation, API client.
- `firestore.rules`, `firestore.indexes.json` — backend authorization and indexes.

Friends never read each other's private data. Each user's client maintains one friends-readable **shared index** document containing only what that user chose to share; the security rules allow friends to read that document and nothing else.

## Getting started

Requirements: Node 22.13+ (or 24.3+), and Java 21+ for the Firebase emulators.

```bash
npm ci
```

### Option A — fully local (emulators + mock movie data, no accounts needed)

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

### Option B — real Firebase project and TMDB key

Copy `.env.example` to `.env.local`, fill in the values (see the comments in the file), then:

```bash
npm run web
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run web` / `npm start` | Dev server (web / native via Expo) |
| `npm run build:web` | Production export to `dist/` (and its Content-Security-Policy) |
| `npm run serve` | Serve the production build (`server/index.js`) |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm test` | Unit + API tests (mock TMDB in-process) |
| `npm run test:rules` | Firestore security rules + data layer tests (starts the Firestore emulator) |
| `npm run test:e2e` | Builds the app, starts emulators + mock TMDB + server, runs Playwright |
| `npm run deploy:firestore -- --project eyelevel-2025` | Deploy security rules and indexes |

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for step-by-step instructions (Firebase setup, rules deployment, Vercel or Docker, environment variables, verification and rollback).

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
