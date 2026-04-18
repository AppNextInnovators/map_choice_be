# Post-Deployment Test Plan (Railway)

Replace `BASE_URL` with your Railway URL throughout.

```bash
BASE_URL=https://your-app.railway.app
```

---

## 1. Health Check
```bash
curl -s $BASE_URL/health
# Expected: {"status":"OK","message":"Server is running"}
```

---

## 2. Security Headers (Helmet)
```bash
curl -sI $BASE_URL/health | grep -i "x-content-type\|x-frame\|strict-transport"
# Expected: Helmet headers present
```

---

## 3. App Check — Missing Token
```bash
curl -s -X POST $BASE_URL/api/map/parse \
  -H "Content-Type: application/json" \
  -d '{"query":"Eiffel Tower"}'
# Expected: 401 APP_CHECK_TOKEN_MISSING
```

---

## 4. App Check — Invalid Token
```bash
curl -s -X POST $BASE_URL/api/map/parse \
  -H "Content-Type: application/json" \
  -H "X-Firebase-AppCheck: invalid-token" \
  -d '{"query":"Eiffel Tower"}'
# Expected: 401 APP_CHECK_TOKEN_INVALID
```

---

## 5. Security Headers — Missing Nonce/Timestamp/Signature
*(requires a valid App Check token from a real device)*
```bash
curl -s -X POST $BASE_URL/api/map/parse \
  -H "Content-Type: application/json" \
  -H "X-Firebase-AppCheck: <valid_token>" \
  -d '{"query":"Eiffel Tower"}'
# Expected: 400 SECURITY_HEADERS_MISSING
```

---

## 6. Timestamp Validation — Expired
```bash
curl -s -X POST $BASE_URL/api/map/parse \
  -H "Content-Type: application/json" \
  -H "X-Firebase-AppCheck: <valid_token>" \
  -H "X-Request-Nonce: $(uuidgen)" \
  -H "X-Request-Timestamp: 1000000" \
  -H "X-Request-Signature: badsig" \
  -d '{"query":"Eiffel Tower"}'
# Expected: 400 TIMESTAMP_EXPIRED
```

---

## 7. Replay Attack — Reused Nonce
Send two identical requests (same nonce) in quick succession:
```bash
NONCE=$(uuidgen)
TS=$(date +%s)000
# First request — passes nonce check (may fail on signature)
# Second request with same NONCE — Expected: 400 NONCE_REUSED
```

---

## 8. Signature Validation — Tampered Body
```bash
TS=$(date +%s)000
NONCE=$(uuidgen)
curl -s -X POST $BASE_URL/api/map/parse \
  -H "Content-Type: application/json" \
  -H "X-Firebase-AppCheck: <valid_token>" \
  -H "X-Request-Nonce: $NONCE" \
  -H "X-Request-Timestamp: $TS" \
  -H "X-Request-Signature: deadbeef" \
  -d '{"query":"Eiffel Tower"}'
# Expected: 400 INVALID_SIGNATURE
```

---

## 9. Map Parse — Missing / Invalid Parameters
*(with all valid security headers)*
```bash
# No parameters
-d '{}'
# Expected: 400 MISSING_PARAMETERS

# placeId too long (>300 chars)
# Expected: 400 INVALID_PLACE_ID

# query too long (>500 chars)
# Expected: 400 INVALID_QUERY
```

---

## 10. Map Parse — Valid placeId
```bash
# ChIJN1t_tDeuEmsRUsoyG83frY4 = Google Sydney
-d '{"placeId":"ChIJN1t_tDeuEmsRUsoyG83frY4"}'
# Expected: 200 {"success":true,"lat":-33.86...,"lng":151.20...}
```

---

## 11. Map Parse — Valid query
```bash
-d '{"query":"Sydney Opera House"}'
# Expected: 200 with lat/lng
```

---

## 12. Body Size Limit (10kb)
```bash
python3 -c "print('{\"query\":\"' + 'A'*11000 + '\"}')" | \
  curl -s -X POST $BASE_URL/api/map/parse \
    -H "Content-Type: application/json" \
    -d @-
# Expected: 413 Payload Too Large
```

---

## 13. IP Rate Limiter
*(triggers after RATE_LIMIT_MAX requests within RATE_LIMIT_WINDOW_MINUTES)*
```bash
for i in $(seq 1 70); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE_URL/api/map/parse \
    -H "Content-Type: application/json" \
    -d '{}'
done
# Expected: 429 IP_RATE_LIMIT_EXCEEDED after limit is hit
# Check RateLimit-Remaining header decreasing on each response
```

---

## 14. Device Quota (10 req/day via Firestore)
*(requires a real App Check token + valid signatures from the mobile app)*

Make 11 successful requests from the same device instance within 24 hours.
- Requests 1–10: `200 OK`
- Request 11: `429 RATE_LIMIT_EXCEEDED` with `retryAfter` seconds until reset

---

## 15. User Daily / Monthly Quota
*(triggered after billable geocode calls)*

- After `DAILY_REQUEST_LIMIT` (default 20) billable calls in one day → `429`
- After `MONTHLY_REQUEST_LIMIT` (default 200) billable calls in a month → `429`
- Verify counters in Firestore `userQuotas` collection

---

## 16. CORS
```bash
# Should be blocked
curl -sI -X OPTIONS $BASE_URL/api/map/parse \
  -H "Origin: https://attacker.com" \
  -H "Access-Control-Request-Method: POST"
# Expected: No Access-Control-Allow-Origin header (or not matching attacker.com)

# Should be allowed (replace with your ALLOWED_ORIGINS value)
curl -sI -X OPTIONS $BASE_URL/api/map/parse \
  -H "Origin: <your_allowed_origin>" \
  -H "Access-Control-Request-Method: POST"
# Expected: Access-Control-Allow-Origin matches your origin
```

---

## 17. Unknown Routes
```bash
curl -s $BASE_URL/api/nonexistent
# Expected: 404
```

---

## Priority Order

| Priority | Test                              | Why                           |
| -------- | --------------------------------- | ----------------------------- |
| 1        | Health check                      | Confirms deployment succeeded |
| 2        | App Check missing/invalid         | Core security gate            |
| 3        | Valid map parse (placeId + query) | Core functionality            |
| 4        | IP rate limiter                   | Flood protection              |
| 5        | Body size limit                   | Abuse protection              |
| 6        | Timestamp / nonce / signature     | Anti-replay                   |
| 7        | Device + user quotas              | Requires real device tokens   |
