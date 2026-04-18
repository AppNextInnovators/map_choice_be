# CI/CD Plan — map_choice_be → Railway

## Overview

GitHub Actions runs CI on every push/PR. Railway auto-deploys on merge to `main`.

```
push/PR → GitHub Actions CI → merge to main → Railway auto-deploy
```

---

## CI Pipeline (GitHub Actions)

### Trigger
- Every push to any branch
- Every pull request targeting `main`

### Steps

| Step          | Command                       | Fail on error |
| ------------- | ----------------------------- | ------------- |
| Checkout      | `actions/checkout`            | yes           |
| Setup Node 20 | `actions/setup-node@v4`       | yes           |
| Install deps  | `npm ci`                      | yes           |
| Lint          | `npm run lint`                | yes           |
| Type check    | `npx tsc --noEmit`            | yes           |
| Tests         | `npm test -- --ci --coverage` | yes           |
| Build         | `npm run build`               | yes           |

### Workflow file: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: map_choice_be/package-lock.json

      - name: Install dependencies
        working-directory: map_choice_be
        run: npm ci

      - name: Lint
        working-directory: map_choice_be
        run: npm run lint

      - name: Type check
        working-directory: map_choice_be
        run: npx tsc --noEmit

      - name: Test
        working-directory: map_choice_be
        run: npm test -- --ci --coverage
        env:
          NODE_ENV: test
          FIREBASE_PROJECT_ID: test-project
          FIREBASE_CLIENT_EMAIL: test@test.iam.gserviceaccount.com
          FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n"
          GOOGLE_GEOCODING_API_KEY: test-key

      - name: Build
        working-directory: map_choice_be
        run: npm run build
```

> Note: The env vars in the `Test` step are fake/stub values. Tests mock Firebase — they do not make real network calls. Do NOT use real credentials in CI.

---

## CD Pipeline (Railway)

Railway handles deployment automatically once connected to GitHub.

### Setup (one-time)

1. Railway dashboard → project → **Settings → Source**
2. Connect GitHub repo
3. Set **Root Directory** to `map_choice_be`
4. Set **Build Command**: `npm install && npm run build`
5. Set **Start Command**: `npm start`
6. Enable **Deploy on push to** `main` branch only

### Deploy flow on merge to `main`

```
merge to main
  → Railway detects push
  → runs npm install && npm run build
  → if build succeeds → replaces running container (zero-downtime)
  → if build fails → Railway keeps previous deployment running
```

### Branch protection (recommended)

Set on GitHub under **Settings → Branches → main**:
- Require status checks: `ci` job must pass
- Require PR before merging
- No direct pushes to `main`

This ensures Railway never receives broken code — CI must be green before any merge.

---

## Environment Variables in Railway

All secrets live in Railway's **Variables** panel (not in the repo).

| Variable                    | Source                      |
| --------------------------- | --------------------------- |
| `FIREBASE_PROJECT_ID`       | Firebase Console            |
| `FIREBASE_CLIENT_EMAIL`     | Service account JSON        |
| `FIREBASE_PRIVATE_KEY`      | Service account JSON        |
| `GOOGLE_GEOCODING_API_KEY`  | Google Cloud Console        |
| `NODE_ENV`                  | Set to `production`         |
| `DAILY_REQUEST_LIMIT`       | App config                  |
| `MONTHLY_REQUEST_LIMIT`     | App config                  |
| `GLOBAL_GEOCODING_LIMIT`    | App config                  |
| `RATE_LIMIT_WINDOW_MINUTES` | App config                  |
| `RATE_LIMIT_MAX`            | App config                  |
| `LOG_LEVEL`                 | `info`                      |
| `ALLOWED_ORIGINS`           | Your app's origin if needed |

`PORT` is injected automatically by Railway — do not set it.

---

## Rollback

If a bad deploy reaches production:

1. Railway dashboard → **Deployments** tab
2. Click the last known-good deployment
3. Click **Redeploy** — Railway re-runs that build instantly

---

## Summary

```
Developer pushes branch
  → CI runs (lint + typecheck + tests + build)
  → opens PR to main
  → CI must be green to merge
  → merge triggers Railway deploy
  → validateEnv() runs at startup — bad env vars kill the process before traffic hits
  → /health endpoint confirms successful boot
```
