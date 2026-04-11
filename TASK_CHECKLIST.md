# Production hardening — task checklist

Track fixes from the pre-production failure audit. Check boxes as completed.

## Critical

- [x] **News authorization** — Restrict create/update/delete news to admins (`requireAdmin` on mutating routes).
- [x] **Webhook body limit** — Cap `express.raw()` payload size (e.g. 512kb) to prevent memory DoS.
- [x] **Webhook invalid JSON** — Return 400 on `JSON.parse` failure instead of `{}` + silent 200.
- [x] **Unhandled promise rejection** — Do not shut down the API process on every `unhandledRejection` (log + metrics; keep `uncaughtException` → graceful shutdown).

## High

- [x] **Trust proxy** — Configurable `trust proxy` for correct `req.ip` / rate limiting behind reverse proxies.
- [x] **getAllPlans** — Avoid Razorpay `plans.all({ count: 50 })` cap; fetch each active plan by ID from DB (source of truth).
- [x] **getSubscription** — Stable response shape when Razorpay fails (`database` + `razorpay` + optional error field).
- [x] **createPlan rollback** — If `Plan.create` fails after Razorpay plan creation, attempt REST `DELETE /v1/plans/:id` (see `deleteRazorpayPlan` in `razorpayInstance.js`; SDK has no `plans.delete`).
- [x] **Worker unhandledRejection** — Align with API: log unhandled rejections without exiting the worker process (still shutdown on `uncaughtException`).
- [x] **YouTube channel ID** — Read `YOUTUBE_CHANNEL_ID` from env (with safe default) instead of hard-coding only in source.

## Medium

- [x] **Mongo pool** — Raise default `maxPoolSize` slightly (e.g. 10 → 25) to reduce pool wait under load.
- [x] **YouTube controller** — Use `asyncHandler` + `ApiResponse` for consistent errors and JSON shape.
- [x] **Admin seed** — Refuse default password when `NODE_ENV=production` without `ADMIN_PASSWORD`.

## Low / cleanup

- [x] **Remove unused `xml2js`** dependency from `package.json`.

## Logging (implemented)

- **Pino** — JSON logs in production (`NODE_ENV=production`); **pino-pretty** in dev (requires devDependencies).
- **Env:** `LOG_LEVEL` (e.g. `info`, `warn`, `error`, `debug`). Default: `info` in prod, `debug` locally.
- **Request correlation:** `X-Request-Id` header (or generated); attached to logs via AsyncLocalStorage; access line per request (`http_request` with `statusCode`, `durationMs`).
- **Probe noise:** Successful `GET /livez` and `GET /readyz` are not access-logged.

## Deferred (documented — not automated in code)

- Redis-backed distributed rate limiting.
- Payment saga / webhook idempotency ledger / Razorpay↔Mongo reconciliation job.
- Replacing `withTimeout` wrappers with driver-level `maxTimeMS` / abortable queries.

---

**Legend:** Update checkboxes to `[x]` as each item lands in `main`.
