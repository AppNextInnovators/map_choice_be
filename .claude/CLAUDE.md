# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev           # Hot-reload dev server (tsx watch)
npm run build         # Compile TypeScript to dist/
npm start             # Run compiled output

# Testing
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
npm run test:debug    # Verbose, serial (--runInBand)

# Linting
npm run lint          # ESLint on src/**/*.ts

# Utilities
npm run test:firestore    # Test Firestore connectivity
npm run test:app-check    # Test App Check
npm run clear:rate-limits # Reset Firestore rate limit records
```

To run a single test file:
```bash
npx jest src/__tests__/appCheckMiddleware.test.ts
```

## Architecture

This is a TypeScript/Express backend for an Expo React Native app. Its primary purpose is to securely proxy Google Places API calls with multiple layers of protection.

### Request Pipeline

Every `/api/*` request passes through this middleware chain in order:

```
helmet → cors → express.json → pino-http
  → ipRateLimiter (60 req/min per IP, express-rate-limit)
  → appCheckSecureMiddleware (Firebase App Check + replay protection)
  → Router → MapController → MapService → Google Places API
  → errorHandler
```

### Security Layers (`src/middleware/appCheckMiddleware.ts`)

`appCheckSecureMiddleware` is the core security gate. It validates four things on every request:

1. **Firebase App Check token** (`X-Firebase-AppCheck` header) — verifies request comes from a legitimate app instance
2. **Nonce** (`X-Request-Nonce`) — UUID checked against an in-memory store to prevent replay attacks; entries expire after 10 minutes
3. **Timestamp** (`X-Request-Timestamp`) — must be within ±5 minutes of server time
4. **Signature** (`X-Request-Signature`) — `SHA256(token:nonce:timestamp:bodyHash)` verifies body integrity
5. **Device quota** — 10 requests per device per 24 hours, enforced via Firestore atomic transactions (`deviceQuotas` collection)

Set `SKIP_APP_CHECK=true` in `.env` to bypass all of this in development.

### Map Feature (`src/controllers/mapController.ts`, `src/services/mapService.ts`)

`POST /api/map/parse` accepts `{ placeId?, query? }` and returns `{ success, lat, lng }`.

`MapService.geocodeApiCall()` has two paths:
- `placeId` provided → `fetchByPlaceId()` (direct lookup, lowest-cost SKU)
- `query` provided → `findPlaceIdByText()` (text search, free SKU) → `fetchByPlaceId()`

Both external calls use a 5-second timeout.

### Firebase Setup (`src/config/firebase.ts`)

Firebase Admin SDK initializes from `service-account.json` (not committed). The module exports singleton instances of the Firebase app, App Check, and Firestore. Credentials can alternatively be provided via environment variables (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).

### Logging (`src/lib/logger.ts`)

Pino logger: pretty-printed in development, JSON in production. The `/health` endpoint is excluded from request logs.

## Environment Variables

See `.env.example`. Key variables:
- `SKIP_APP_CHECK=true` — bypasses Firebase App Check in development
- `GOOGLE_GEOCODING_API_KEY` — required for Google Places API calls
- `FIREBASE_*` — service account credentials (alternative to `service-account.json`)
- `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` — configure IP rate limiter (defaults: 60000ms / 60 req)
