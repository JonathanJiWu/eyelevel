# Production image for any container host (Render, Fly.io, Railway, Cloud Run…).
#
#   docker build -t eyelevel \
#     --build-arg EXPO_PUBLIC_FIREBASE_API_KEY=... --build-arg EXPO_PUBLIC_FIREBASE_APP_ID=... .
#   docker run -p 3000:3000 -e TMDB_API_KEY=... eyelevel
#
# EXPO_PUBLIC_* values are public client config baked in at build time;
# TMDB_API_KEY is a runtime secret and must NOT be passed as a build arg.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG EXPO_PUBLIC_FIREBASE_API_KEY
ARG EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=eyelevel-2025.firebaseapp.com
ARG EXPO_PUBLIC_FIREBASE_PROJECT_ID=eyelevel-2025
ARG EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=eyelevel-2025.firebasestorage.app
ARG EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG EXPO_PUBLIC_FIREBASE_APP_ID
ARG EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN
ENV CI=1
RUN npx expo export -p web

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
# The exported server bundles are self-contained; the runtime only needs the
# HTTP server and the Expo request handler.
RUN npm init -y >/dev/null && npm install --no-audit --no-fund express@4.22.3 compression@1.8.1 @expo/server@0.5.3
COPY --from=build /app/dist ./dist
COPY server ./server
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
