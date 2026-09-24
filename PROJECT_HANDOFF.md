# Surplus to Shelter — current engineering handoff

Updated 2026-09-24 during production hardening. **Work is ongoing; do not call the whole project production-ready.** The earlier “100% complete, no known issues” handoff is archived at `docs/PROJECT_HANDOFF_PRE_HARDENING.md` and is historical, not current truth.

## User objective and constraints

Improve the existing project in place: audit → harden backend/security/concurrency → improve production operation → redesign/polish frontend → verify. Preserve React/Vite/TypeScript/Tailwind/Leaflet and Express/Prisma/SQLite modular monolith. Preserve all role flows and dual fulfillment. No unnecessary services or AI additions. No mocks replacing real application data. User explicitly said **continue doing the work** during this session.

Confirmed business rules:
- One donation with independent 1:N allocations; allocated quantity cannot exceed donation quantity.
- Capacity = max − occupancy − incoming reservations; server/database authoritative.
- Matching hard constraints precede weighted scoring (urgency .35, need .30, capacity .20, distance .15). No manual donor/receiver cherry-picking.
- Platform driver OR receiver-owned logistics, common custody lifecycle. Safe switching before pickup.
- Lowest total ETA resolves simultaneous claims. **User approved an approximately two-second claim window** in this session.
- Donor owns pickup code; receiver owns delivery code; assigned transporter submits verification. Receiver coordinator handles own logistics.
- Impact only from verified deliveries; preserve existing conversion factors, label equivalences as estimates.

## Architecture and repository

Backend: Express 4, TypeScript, Prisma 6.19.3 generated client, SQLite. Frontend: React 19, Vite 8, Tailwind 4, Leaflet, Socket.io. Frontend dev port **3000**, backend 4000. Original documentation incorrectly claimed 5173. Actual default AI implementation is heuristic fallback with optional configured inference endpoint; it is not a verified model benchmark.

No AGENTS.md found. Entire project was untracked at takeover; no commits or destructive git operations were performed. `.gitignore` now excludes environment files, databases, dependencies, builds. Local `.env` is not published and contains an explicit private `DEMO_MODE=true` plus a generated persistent encryption key; production refuses demo mode. Never print/commit that key.

## IMPLEMENTED

### Backend/access/security
- Shared application Prisma client; domain services keep dependency injection.
- Password hashing with salted async scrypt; opaque random session tokens stored hashed in new `Session` model, 12-hour expiry, HttpOnly/SameSite=Strict cookies (Secure in production), login/logout, credential setter script. Production ignores caller-selected identity headers. Demo directory returns only id/name/role and is absent outside demo mode.
- Authenticated API boundary, admin RBAC, delivery ownership/assigned-transporter authorization, strict mutation validation, bounded JSON body, explicit CORS origins, write-origin checks and in-process IP rate limits.
- Response sanitation removes OTPs, contact fields, audit payloads, password/token hashes from general resource graphs. Exact job addresses withheld until assignment; donor cannot see receiver coordinates; receiver donor location only for its own-logistics flow. Dedicated owner code endpoints remain.
- Six-digit random OTPs, AES-256-GCM encrypted at rest and bound to allocation/stage, expire at safe deadline, five persistent failed attempts per stage, redacted attempt audit, consumed codes cleared. Verification checks assigned identity, state, availability, deadline, replay. Invalid attempts commit their audit before a controlled error is returned.
- Controlled domain errors, generic safe unexpected/database errors, request IDs and JSON request/error logs without body/secrets. `/health`, database `/ready`, shutdown handling.
- Server-side dispatch advisor uses actual allocation, receiver and driver counts instead of frontend fabricated numbers.

### Integrity/concurrency/domain
- Matching and allocation balances are read inside a transaction after obtaining SQLite writer lock. Atomic conditional capacity increments, rejection/release/rematch in one transaction, conditional accept prevents concurrent accept/reject overwrites.
- Accepted-only fulfillment, owns-logistics/personnel checks, deadline checks, driver availability reservation, no double active assignment, pre-pickup-only cancellation, correct assignment cleanup on mode switch and completion.
- Parent donation fulfilled only when completed quantities reach original donation quantity; rejected historical rows no longer block completion and partial rescue no longer falsely fulfills parent.
- Durable two-second `DriverClaim` window, deterministic ETA ordering/tie-break, feasible claimant wins; tests prove two competing claims produce one winner.
- Idempotent expiry maintenance releases capacity, cancels active assignments, clears OTPs and never invents impact. Bounded pending/partial rematching runs every 30 seconds in deadline order; interrupted donation matching is retried instead of returning a misleading failed creation.
- Stable matching tie-breaks, weights validation, malformed preference JSON handling, availableAt included in matching feasibility.

### Database/performance
- Baseline + hardening + legacy cleanup migrations in `backend/prisma/migrations`.
- Query-pattern indexes, partial unique indexes for one accepted assignment per delivery/driver, SQLite triggers enforce nonnegative/feasible receiver capacity and parent allocation quantity bounds.
- Existing development DB upgraded after proving the migration on a copy. Row counts for users/donations/allocations/deliveries/impact preserved; SQLite integrity/foreign-key checks passed. Backup: `/tmp/annsafe-before-hardening.db`; verification copy `/tmp/annsafe-upgrade-check.db`. Preserve a durable backup outside /tmp if needed.
- Legacy completed driver assignments repaired, completed codes removed, historical attempt plaintext redacted.
- Donation/allocation/open-job lists have cursor pagination (50 default, max100), array responses with `X-Next-Cursor`. UI Load more wired.
- Impact totals/averages/mode/category statistics aggregate in database. Admin entity snapshots capped at100; actual totals use counts.

### Realtime
- Socket authentication derives user/role rooms on server; arbitrary role/user joins ignored and resource rooms checked.
- Small ID-only invalidation events replace raw delivery/OTP broadcasts; union targeting avoids duplicate room emissions.
- Location writes validate coordinates, assignment and state; five-second per-socket throttle; exact updates target operational receiver/admin rather than stale delivery rooms.
- Session periodically rechecked; logout disconnects user sockets. Frontend socket recreated per identity, reconnect triggers REST reload, stable event callback subscription.

### Frontend
- Warm neutral light palette, restrained task navigation, mobile bottom modes, sign-in view, coherent focus/touch styles, reduced-motion support, no decorative gradients/glows.
- Existing role features preserved, clear task language, compact donor quick-fill disclosure, real API data.
- Accessible shared dialog (focus trap/Escape/restore), inline retry/error states replacing alerts, cancellation/mode-switch dialogs replacing prompts, labelled key inputs.
- Receiver coordinator can view pickup details and verify both custody steps through actual UI; browser end-to-end verified.
- Map popup user text uses DOM textContent (stored-XSS fix), stable map initialization, valid zero coordinates, route lines labelled estimated.
- Lazy role pages and map reduce initial JS from503.83kB to~280kB before gzip (~88.5kB gzip). Full build no oversized initial chunk warning.
- Screenshots in `docs/validation`; all four roles tested at1440px and390px without horizontal overflow or page exceptions, active courier and own-logistics flows included.

### Deployment/tooling
- `.env.example`, `.gitignore`, `.dockerignore`, multi-stage non-root `Dockerfile`, persistent-volume `compose.yaml`, single-origin production static serving, `docs/DEPLOYMENT.md`.
- `npm test` in backend runs isolated migrations + hardening/session regressions under `/tmp`; original database untouched by tests.
- Demo reset now requires `ALLOW_DEMO_RESET=true` and cannot run in production. Legacy domain test refuses non-/tmp databases.

## VERIFIED (latest completed checks)

- Backend TypeScript build passes.
- Frontend TypeScript/Vite production build passes (~280kB initial JS).
- New isolated hardening suite passes: capacity race, database constraint, duplicate matching, accept race, rejected invalid fulfillment, lowest-ETA dispatch, cancellation ownership, encrypted OTP/stage binding, persistent failed audit, expiry/lockout/replay, one impact under concurrent completion, driver release, rejection race, mode switching, concurrent expiration, safe API privacy, pagination/aggregate numbers, strict request validation, password login, socket room isolation.
- Non-demo session suite passes: forged identity headers ignored, directory unavailable, login cookie, origin rejection, logout revocation and socket disconnect.
- Browser suite (`/tmp/check-annsafe.mjs`, uses existing Playwright installation under `/home/samashech/Documents/fire-forge/node_modules`) passes four role pages desktop/mobile and receiver coordinator pickup+receipt. It seeds a new isolated database and starts temporary servers on3300/4400, then stops them. Latest run DB `/tmp/annsafe-browser-JarNCD`.
- Frontend lint exits0 with remaining React hook/fast-refresh warnings. Do not claim zero warnings.
- Docker daemon check fails permission denied even after approved unsandboxed access; container not yet built/run. Do not claim Docker validation.

## PARTIALLY IMPLEMENTED / REMAINING — continue here

1. Finish current product/visual review and regression pass. One small visual regression found: donor delivery mode/status was hidden after pickup along with OTP button; restore status visibility while keeping consumed-code button hidden. Admin environmental heading currently awkward (“Estimated environmental Ecological Offsets”); clean copy. Seed quick-fill “40kg produce” mismatches meal-only intake; correct/clarify units.
2. Secure operational OTP recovery/reissue for lockout/legacy active codes is absent. Existing active four-digit codes fail closed; local migrated DB had completed deliveries only. Need scoped audited recovery with cooldown/versioned attempt counters, not a blanket reset that bypasses guessing limits.
3. Production account/profile onboarding is incomplete. Password tool only sets existing user credentials; no public registration, recovery or admin provisioning UI. Do not deploy using demo accounts.
4. Dispatch records persist, but a closed window after process crash resolves only when a new claimant request arrives. Add bounded recovery sweeper and robust duplicate resolver tests. Location priority uses submitted coordinates; freshness/accuracy is not independently verified.
5. Realtime remains single-process; no durable notification/outbox delivery. REST reconnect recovers snapshots. Add periodic/visibility reconciliation if needed and ensure expiry/rematch events refresh every role/capacity view.
6. Matching feasibility does not yet explicitly require a currently feasible platform driver when receiver has no own logistics; real claim feasibility does. Urgency is constant across receivers for one donation; maintenance orders backlog by deadline. Do not change scoring/business policy without understanding this.
7. Scope large admin lists/truncation clearly in UI; category aggregate and cap100 implemented but map pagination/filter controls not. Multi-process load, sustained thousands-user benchmarks and query-plan evidence not completed. SQLite is deliberately single-node, not declared horizontally scalable.
8. Original phase test scripts and demo walkthrough assume public demo directory profiles, plaintext four-digit OTP fields and unauthenticated AI endpoints; not yet all modernized/re-run. Some original negative tests catch their own failures. New npm test is the validated gate; do not claim every legacy suite passes.
9. Test tablet/320px layouts, keyboard/dialog navigation, real production cookies/static assets, offline map/error states, race recovery/repeated submissions. Some legacy microcopy remains technical; admin layout still quite long on mobile and driver map composition can improve. Driver current-job priority and actionable estimated ETA presentation need final designer review.
10. Docker build/compose/HTTPS smoke test pending daemon access. Environment validation, hard proxy/IP configuration, CSP/content headers, account password KDF review, external tile policy and backup/restore operational test need completion. No deployment/publishing performed.
11. Auditable business logs currently mainly delivery DB events + generic HTTP logs; allocation/donation event coverage and persistent notifications need review.
12. Startup maintenance retries fail batch-wide on first error; improve per-item isolation. Bounded backlog selection can starve later entries; evaluate retry scheduling, without introducing an unnecessary queue service.
13. Check driver claim FK/retention (DriverClaim currently scalar IDs only), model constraint completeness, raw SQL date representation consistency in average matching duration, API conflict mapping and all legacy error paths.

## OPTIONAL FUTURE WORK

PostgreSQL migration only with a concrete multi-node need; distributed socket adapter/rate limiter then. Road routing/traffic provider if operationally required; current map is estimated corridors. Public registration/password recovery with verified email; real notification provider; load-tested queues if needed. No ML/microservices required.

## Useful commands

```
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix frontend run lint
node backend/scripts/test-hardening.mjs  # needs localhost binding
node /tmp/check-annsafe.mjs             # needs browser + local listeners
```

Do not recreate the application or overwrite user data. Continue from actual code and this handoff. Update this document after the remaining work, distinguishing implemented, partial, remaining and optional work.
