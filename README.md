# map_choice_be

TypeScript/Express backend for the MapChoice Expo app. Securely proxies Google Places API calls with multiple layers of protection.

## Stack

- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Express
- **Auth/Security**: Firebase App Check, Firebase Auth
- **Database**: Firestore (rate limit & quota tracking)
- **Logging**: Pino (JSON in production, pretty in development)
- **Deployment**: Railway

## Request Pipeline

Every `/api/*` request passes through this chain:

```
helmet → cors → express.json → pino-http
  → ipRateLimiter          (express-rate-limit, per IP)
  → appCheckSecureMiddleware (Firebase App Check + replay protection)
  → authMiddleware          (Firebase Auth + per-user quotas)
  → Router → MapController → MapService → Google Places API
  → errorHandler
```

## API

### `GET /health`
Returns `{ status: "OK" }`. Used by Railway as a liveness check.

### `POST /api/map/parse`
Resolves a place to coordinates.

**Request body** (one of):
```json
{ "placeId": "ChIJN1t_tDeuEmsRUsoyG83frY4" }
{ "query": "Sydney Opera House" }
```

**Required headers:**
| Header | Description |
|--------|-------------|
| `X-Firebase-AppCheck` | Firebase App Check token |
| `X-Request-Nonce` | UUID, one-time use |
| `X-Request-Timestamp` | Unix ms, must be within ±5 min of server |
| `X-Request-Signature` | `SHA256(token:nonce:timestamp:SHA256(body))` |

**Success response:**
```json
{ "success": true, "lat": -33.8688, "lng": 151.2093 }
```

## Security Layers

1. **Firebase App Check** — verifies the request originates from a legitimate app instance
2. **Nonce** — one-time UUID prevents replay attacks (10-min expiry, in-memory store)
3. **Timestamp** — request must be within ±5 minutes of server time
4. **Signature** — `SHA256(token:nonce:timestamp:bodyHash)` detects body tampering
5. **Device quota** — 10 requests/device/day via Firestore atomic transactions
6. **User quota** — 20 requests/user/day, 200/month via Firestore
7. **Global quota** — 10,000 geocoding calls/month (matches Google free tier)
8. **IP rate limit** — configurable via `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MINUTES`

## Local Development

### Prerequisites
- Node.js 20+
- A Firebase project with App Check and Firestore enabled
- A Google Cloud project with the Geocoding API enabled

### Setup

```bash
npm install
cp .env.example .env
# Fill in your credentials in .env
npm run dev
```

Set `SKIP_APP_CHECK=true` in `.env` to bypass App Check during local development.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIREBASE_PROJECT_ID` | yes | — | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | yes | — | Service account email |
| `FIREBASE_PRIVATE_KEY` | yes | — | Service account private key |
| `GOOGLE_GEOCODING_API_KEY` | yes | — | Google Places/Geocoding API key |
| `NODE_ENV` | yes | — | `development` or `production` |
| `PORT` | no | `3000` | HTTP port (Railway injects this automatically) |
| `SKIP_APP_CHECK` | no | `false` | Bypass App Check in development only |
| `DAILY_REQUEST_LIMIT` | no | `20` | Per-user daily geocoding limit |
| `MONTHLY_REQUEST_LIMIT` | no | `200` | Per-user monthly geocoding limit |
| `GLOBAL_GEOCODING_LIMIT` | no | `10000` | Global monthly geocoding limit |
| `RATE_LIMIT_WINDOW_MINUTES` | no | `1` | IP rate limit window |
| `RATE_LIMIT_MAX` | no | `60` | Max requests per IP per window |
| `LOG_LEVEL` | no | `info` (prod) / `debug` (dev) | Pino log level |
| `ALLOWED_ORIGINS` | no | — | Comma-separated CORS origins |

## Scripts

```bash
npm run dev           # Hot-reload dev server
npm run build         # Compile TypeScript → dist/
npm start             # Run compiled output
npm test              # Run all tests
npm run test:coverage # Tests with coverage report
npm run lint          # ESLint
npm run format        # Prettier (write)
npm run format:check  # Prettier (check only)
```

## Git Hooks (Husky)

| Hook | What it does |
|------|-------------|
| `pre-commit` | Runs lint-staged (Prettier + ESLint) on staged `.ts` files, then `tsc --noEmit` |
| `pre-push` | Blocks direct pushes to `main`; runs full test suite |

## Deployment (Railway)

See [`.claude/cicd-plan.md`](.claude/cicd-plan.md) for the full CI/CD setup.

**Quick summary:**
- Railway auto-deploys on merge to `main`
- Build: `npm install && npm run build`
- Start: `npm start`
- All secrets are set in Railway's Variables panel — never committed to the repo
- `validateEnv()` runs at startup and exits with code 1 if any required env var is missing
