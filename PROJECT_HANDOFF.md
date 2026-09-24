# Surplus to Shelter — current engineering handoff

Updated 2026-09-25 after the latest hardening, regression, and browser checks. This is an interruption checkpoint; the production smoke test remains unresolved. **Work is ongoing; do not call the whole project production-ready.** The earlier “100% complete, no known issues” handoff is archived at `docs/PROJECT_HANDOFF_PRE_HARDENING.md` and is historical, not current truth.

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

No AGENTS.md found. The project was untracked at initial takeover; the working tree now has tracked modifications and new files. This agent performed no commits or destructive git operations. `.gitignore` now excludes environment files, databases, dependencies, builds. Local `.env` is not published and contains an explicit private `DEMO_MODE=true` plus a generated persistent encryption key; production refuses demo mode. Never print/commit that key.

## IMPLEMENTED

### Backend/access/security
- Shared application Prisma client; domain services keep dependency injection.
- Password hashing with versioned salted async scrypt (N=32768, r=8, p=3, max four concurrent derivations), automatic upgrade of earlier hashes on login; opaque random session tokens stored hashed in new `Session` model, 12-hour expiry, HttpOnly/SameSite=Strict cookies (Secure in production), login/logout, credential setter script. Production ignores caller-selected identity headers. Demo directory returns only id/name/role and is absent outside demo mode.
- Authenticated API boundary, admin RBAC, delivery ownership/assigned-transporter authorization, strict mutation validation, bounded JSON body, explicit CORS origins, write-origin checks and in-process IP rate limits.
- Response sanitation removes OTPs, contact fields, audit payloads, password/token hashes from general resource graphs. Exact job addresses withheld until assignment; donor cannot see receiver coordinates; receiver donor location only for its own-logistics flow. Dedicated owner code endpoints remain.
- Six-digit random OTPs, AES-256-GCM encrypted at rest and bound to allocation/stage, expire at safe deadline, five persistent failed attempts per code generation, redacted attempt audit, consumed codes cleared. Verification checks assigned identity, state, availability, deadline, replay. Invalid attempts commit their audit before a controlled error is returned.
- Owner-only OTP replacement: donor for pickup, receiver for receipt; state/deadline checks, 60-second cooldown, at most two replacements per stage, versioned attempts and redacted audit. Old codes become invalid while failed-attempt history is preserved. Owner UI supports replacement, including unavailable legacy codes.
- Controlled account/profile provisioning via `backend/src/scripts/create-account.ts` accepts validated JSON on stdin and creates role/profile atomically. Password provisioning requires 15–256 characters; resets revoke existing sessions. No public registration/recovery or provisioning UI yet.
- Controlled domain errors, generic safe unexpected/database errors, request IDs and JSON request/error logs without body/secrets. `/health`, database `/ready`, shutdown handling.
- Server-side dispatch advisor uses actual allocation, receiver and driver counts instead of frontend fabricated numbers.

### Integrity/concurrency/domain
- Matching and allocation balances are read inside a transaction after obtaining SQLite writer lock. Atomic conditional capacity increments, rejection/release/rematch in one transaction, conditional accept prevents concurrent accept/reject overwrites.
- Accepted-only fulfillment, owns-logistics/personnel checks, deadline checks, driver availability reservation, no double active assignment, pre-pickup-only cancellation, correct assignment cleanup on mode switch and completion.
- Parent donation fulfilled only when completed quantities reach original donation quantity; rejected historical rows no longer block completion and partial rescue no longer falsely fulfills parent.
- Durable two-second `DriverClaim` window, deterministic ETA ordering/tie-break, feasible claimant wins. Winning assignment validates the pending closed-window claim in the assignment transaction. A bounded maintenance sweep resolves closed windows after interruptions; duplicate resolvers cannot create two assignments. Mode switching and expiry invalidate pending claims; resolved claims older than seven days are removed.
- Idempotent expiry maintenance releases capacity, cancels active assignments, clears OTPs and never invents impact. Bounded pending/partial rematching runs every 30 seconds in deadline order; interrupted donation matching is retried instead of returning a misleading failed creation.
- Stable matching tie-breaks, weights validation, malformed preference JSON handling, availableAt included in matching feasibility. Platform-only receivers require an available courier with recent coordinates (30-minute cutoff, legacy updatedAt fallback) and a feasible pickup-to-receiver journey; receivers with own logistics remain eligible without platform drivers.
- Maintenance isolates expiry/matching failures per donation; matching retries use `nextMatchAttemptAt` and a 60-second delay so repeatedly unmatched entries do not monopolize the first batch. Scheduling behavior still needs a dedicated backlog-fairness test.

### Database/performance
- Five migrations in `backend/prisma/migrations`: baseline, hardening, legacy cleanup, OTP recovery (004), matching schedule/location freshness/claim reference guards (005). Migrations 004/005 are additive and preserve existing custom triggers. Claim insert guards reject missing delivery/driver references; deletion triggers clean up dependent claims. These are not Prisma foreign-key relations; update-path reference constraints still need review.
- Query-pattern indexes, partial unique indexes for one accepted assignment per delivery/driver, SQLite triggers enforce nonnegative/feasible receiver capacity and parent allocation quantity bounds.
- Existing development DB upgraded **through migration 003 only at the last confirmed checkpoint**, after proving that upgrade on a copy. Migrations 004/005 passed on isolated test databases but still need a backed-up, verified upgrade of the local development database before normal use of the latest app. Row counts for users/donations/allocations/deliveries/impact preserved; SQLite integrity/foreign-key checks passed. Backup: `/tmp/annsafe-before-hardening.db`; verification copy `/tmp/annsafe-upgrade-check.db`. Preserve a durable backup outside /tmp if needed.
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
- Map popup user text uses DOM textContent (stored-XSS fix), stable map initialization, valid zero coordinates, route lines labelled estimated. Latest build adds resize observation and a tile-error message; offline behavior has not yet been browser-verified.
- Driver current delivery appears before opportunities, pending/active-job actions are guarded, and production claims obtain browser coordinates. Authenticated `PATCH /api/drivers/my/location` and a production location-update action populate fresh coordinates for matching; continuous location sharing is not yet implemented.
- Donor status remains visible after pickup while consumed-code actions hide. Corrected admin impact heading and meal-based quick-fill example. Latest intake changes preserve the extracted absolute deadline instead of rounding/extending it; non-meal quantities require explicit meal-count entry instead of automatic kg-to-meals conversion. These latest intake changes build but still need focused browser regression.
- Lazy role pages and map reduce initial JS from503.83kB to~280kB before gzip (~88.5kB gzip). Full build no oversized initial chunk warning.
- Screenshots in `docs/validation`; all four roles passed at 1440, 768, 390 and 320px without horizontal overflow or page exceptions. Fixed 320px donation status wrapping. Active courier and receiver-owned pickup/receipt flows included; further visual/keyboard review remains.

### Deployment/tooling
- `.env.example`, `.gitignore`, `.dockerignore`, multi-stage non-root `Dockerfile`, persistent-volume `compose.yaml`, single-origin production static serving, `docs/DEPLOYMENT.md`.
- `npm test` in backend runs isolated hardening/session tests followed by all seven modernized original suites under `/tmp`; original database untouched. `test-regression.mjs` also accepts one named suite.
- `backend/scripts/demo.mjs` now creates its own database/server, seeds before socket authentication, uses authorized identities and six-digit owner codes, and exercises simultaneous claims. Removed misleading speed/source claims and corrected the displayed development port.
- Portable browser runner `frontend/scripts/check-browser.mjs` uses the frontend Playwright devDependency and `BROWSER_PATH` override; no dependency on another project. Production runner `frontend/scripts/check-production.mjs` provisions an isolated account and temporary HTTPS proxy/certificate, but has not passed.
- Production static path supports optional `FRONTEND_DIST_DIR` (default remains backend/public); `/ready` now queries the Session table to require the migrated schema. Latest production readiness failure needs investigation; do not assume these changes work end to end.
- Demo reset now requires `ALLOW_DEMO_RESET=true` and cannot run in production. Legacy domain test refuses non-/tmp databases.

## IMPLEMENTED — continuation on September 25

- OTP owner recovery: donor pickup/receiver receipt only, correct lifecycle, deadline bound, 60-second cooldown, maximum two replacements per stage. Versioned failed-attempt audit retained; old code invalidated. Legacy active codes can be replaced through UI.
- Closed dispatch windows recovered by bounded maintenance sweep; duplicate resolvers result in one assignment; mode switching invalidates old claims. Resolved claims retained seven days. Database insert/deletion guards protect claim references.
- Maintenance isolates item failures; `nextMatchAttemptAt` schedules matching retries to avoid backlog starvation. A receiver without its own logistics requires a recent, available, deadline-feasible platform courier; receiver-owned logistics remains independently eligible. New driver location endpoint and production workspace action record location freshness.
- Stronger versioned scrypt parameters (N32768/r8/p3), four concurrent derivations maximum, old-hash upgrade on login. Controlled atomic account/profile CLI, passwords 15–256 characters via stdin. No public signup/recovery yet.
- All original regression scripts and demo walkthrough modernized for authentication, encrypted six-digit OTPs, privacy-safe events and isolated databases. Negative tests no longer catch their own assertion failures. Demo no longer attaches to a real development server.
- Playwright is now a repository dev dependency. Portable `frontend/scripts/check-browser.mjs` and `check-production.mjs` replace the external temporary browser script. Browser width coverage expanded to 1440/768/390/320px; donor status wraps correctly at 320px.
- Driver active job takes priority, unavailable actions are disabled while assigned/claiming, real coordinates replace fake fallback. Donor status remains visible after pickup. Meal-only quick fill does not treat kg as meals; extracted absolute deadline is preserved instead of rounding/extending it. Review copy clarifies suggestions need confirmation.
- Map resize observation, tile-failure notice, legend outside map to preserve route and attribution. Admin labels 100-record snapshot limit. Heading/copy cleanup.
- Production static directory override for non-container hosting; readiness queries an actual session table. HTTPS browser proof verifies Secure cookie and production account/session flow.
- Existing development DB upgraded through migration005 after SQLite backup and copy proof. Core counts unchanged: 11 users, 2 donations, 2 allocations, 2 deliveries, 2 impact records; integrity/foreign-key checks pass. Latest backup `/tmp/annsafe-before-recovery-schedule.db`; temporary backups need durable retention by operator.

## VERIFIED

- Backend TypeScript and frontend TypeScript/Vite builds pass. Initial JS ~280.22kB / 88.59kB gzip; Leaflet/roles split.
- Hardening/session suite passes, including matching courier freshness/availability, independent own logistics, future pickup deadline, capacity races, quantity guards, claim winner/recovery races, state/ownership checks, encrypted OTP/recovery/cooldown/replay/lockout, impact idempotence, expiry, privacy, pagination, sessions and socket authorization.
- All seven original regression suites pass against disposable databases (`/tmp/annsafe-regression-btOjpg`).
- Isolated demo walkthrough passes (`/tmp/annsafe-demo-PPdeH4`).
- Browser: all four role screens at 1440/768/390/320px pass no-overflow/no-page-error checks; receiver-owned pickup and receipt complete in mobile browser. Screenshots in `docs/validation`.
- Production HTTPS test passes account creation, built static UI, Secure/HttpOnly/SameSite cookie, refresh, disabled demo directory and logout revocation (`/tmp/annsafe-production-1OKMBg`). This uses a local temporary TLS proxy, not a deployed environment.
- Frontend lint exits0 with nine React hook/fast-refresh warnings; not zero warnings.
- Docker Compose config validates, but daemon access denied even outside sandbox. Container build/run remains unverified.

## PARTIALLY IMPLEMENTED / REMAINING

1. The broad production overhaul is not fully finished. Complete sustained-load benchmarks/query-plan review, final visual/accessibility review, and target-environment deployment verification before claiming production readiness.
2. SQLite, socket delivery, rate limits and maintenance are single-node/process. No durable notification outbox; model/provider integration is incomplete. REST reconnect recovers state; visibility/periodic reconciliation and missed-event tests can improve it.
3. Location writes/rooms are authorized, but live frontend tracking is not a complete continuously updated courier experience. Browser coordinates are self-reported; freshness is checked for matching, accuracy not independently verified. Current route/ETA estimates are not road navigation.
4. Admin snapshots explicitly cap100; pagination/filter controls remain. Matching still scans receiver candidates; thousands-user scalability is not benchmarked. Some dense admin/mobile presentation and broader keyboard/screen-reader testing remain.
5. Public registration/verified recovery and administrative provisioning UI are absent; controlled CLI provisioning is implemented. Operational password reset/recovery remains manual.
6. Docker execution and real TLS/proxy/IP rate-limiting deployment remain unverified. App intentionally does not trust arbitrary forwarded headers. CSP, tile-provider policy/capacity and durable backup automation require deployment review.
7. Business audit coverage is strongest for delivery transitions/OTP; donation/allocation structured business logs and persistent notifications remain partial. API response/error envelopes remain compatibility-preserving rather than universally versioned.
8. Database claim insert guards and deletion cleanup exist; direct claim reference updates do not have full FK-equivalent enforcement. Further model constraint audit, API/domain validation consistency and broad concurrent load tests remain.
9. Existing extraction/advisory feature is deterministic fallback unless inference endpoint configured. Its suggested food deadline/category/confidence is not externally validated; UI requires review. Do not claim AI latency/model benchmarks or certified food safety.
10. Nine lint warnings remain; do not silence them broadly. Finish intentional lifecycle fixes when addressing state refresh. Browser checks prove specific paths, not exhaustive accessibility or every offline state.

## OPTIONAL FUTURE WORK

PostgreSQL migration only with a concrete multi-node need; distributed socket adapter/rate limiter then. Road routing/traffic provider if operationally required; current map is estimated corridors. Public registration/password recovery with verified email; real notification provider; load-tested queues if needed. No ML/microservices required.

## Useful commands

```
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix frontend run lint
node backend/scripts/test-hardening.mjs  # needs localhost binding
node backend/scripts/test-regression.mjs
node backend/scripts/demo.mjs
node frontend/scripts/check-browser.mjs     # build backend first; browser + local listeners
node frontend/scripts/check-production.mjs  # build both first; currently failing readiness
```

Do not recreate the application or overwrite user data. Continue from actual code and this handoff. Update this document after the remaining work, distinguishing implemented, partial, remaining and optional work.
