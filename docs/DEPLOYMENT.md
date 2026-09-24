# Operating Surplus to Shelter

The current deployment target is **one Node process and one local SQLite database on persistent storage**. SQLite transactions, database triggers, and partial unique indexes protect integrity. This is not a validated multi-instance or high-throughput deployment. Socket rooms, HTTP rate limits, and maintenance scheduling are process-local. Load testing and production account onboarding remain release gates.

## Local development

1. Run `npm ci` in `backend` and `frontend`.
2. Copy `backend/.env.example` to `backend/.env` if it does not exist.
3. For a **private demo only**, set `DEMO_MODE=true`. Production refuses this setting. The local takeover database was preserved and migrated; do not seed it unless intentionally resetting its data.
4. New database: `cd backend && npm run db:deploy`. Use migrations; `prisma db push` does not install custom integrity triggers/indexes.
5. Optional disposable demo database only: `ALLOW_DEMO_RESET=true npm run prisma:seed`. This deletes existing data, including user credentials. It is prohibited in production.
6. Start `npm run dev` in each folder. Frontend defaults to port **3000**, backend 4000. `API_PROXY_TARGET` configures Vite's HTTP/socket proxy.
7. `cd backend && npm test` creates a fresh database under `/tmp` for every run. It needs local socket binding. Frontend: `npm run build`, `npm run lint`.

## Upgrading an existing database

Back up SQLite using its backup API or stop the server before copying the file; include WAL contents if applicable. Test restoration.

For a database made by the original schema and with no migration history, mark only the baseline applied:

```
cd backend
npx prisma migrate resolve --applied 202609240001_baseline
npm run db:deploy
```

Do not baseline a different schema. Preflight duplicate active assignments and invalid capacity before deployment. Migration 002 adds indexes and capacity/allocation guards, migration 003 closes legacy completed driver assignments and removes historical plaintext OTP attempts and completed delivery codes. Completed donations, allocations, impact, and user rows are preserved.

**Legacy active four-digit OTPs are deliberately rejected by the new verifier.** Do not roll out mid-delivery without a planned reissue procedure. The development database at takeover had only completed deliveries, so this did not block its upgrade. A dedicated audited administrative reissue/recovery workflow is still required before production deployment.

Rollback means restoring the backed-up database together with the prior application version, not blindly reversing integrity migrations while live requests write. The takeover backup is `/tmp/annsafe-before-hardening.db` (temporary storage; retain your own durable backup).

## Authentication and account provisioning

Production uses 12-hour opaque, database-backed sessions with hashed random tokens. Browser cookies are HttpOnly, SameSite=Strict, and Secure in production. Password hashes use salted asynchronous scrypt. Login is rate-limited per IP. Password resets through the provisioning script revoke previous sessions. There is no public registration or password recovery flow yet.

The password tool sets credentials on an **existing user**. Supply the password via stdin, never a command-line argument:

```
cd backend
npm run auth:set-password -- person@example.com
# Supply a 12–256 character password on stdin, then EOF.
```

Use a trusted secret-input mechanism in automation; do not put credentials in repository files or shell history. Creating production users/profiles still needs a controlled provisioning workflow; do not seed production with public demo accounts. Restrict backend port exposure to your TLS reverse proxy. Set `CORS_ORIGINS` to the exact HTTPS public origin; include the port if nonstandard. No wildcard CORS.

## Container configuration

`Dockerfile` builds the React UI and API and serves them from one origin. `compose.yaml` binds the app to localhost, persists SQLite in a named volume, runs as the Node user, and performs migrations on startup. Put TLS in front of it. `/health` is liveness, `/ready` checks database connectivity.

Supply `OTP_ENCRYPTION_KEY` as a persistent, secret 32-byte hex key (`openssl rand -hex 32`) and `CORS_ORIGINS` through deployment environment/secrets. **Losing/changing the OTP key invalidates active verification codes.** Never enable demo mode in a public deployment. Do not share the local demo encryption key.

The Docker configuration has been written but has not yet been built/run in this session. HTTPS cookie behavior and reverse-proxy rate-limit IP configuration must be verified in the target environment. The app intentionally does not trust forwarded IP headers by default. Do not add unrestricted `trust proxy`.

## Operational behavior and limits

- Structured request logs include request IDs, routes, timings, and status; no request bodies, OTPs, passwords, or exact addresses. Delivery transition events remain in the database.
- Every 30 seconds, bounded maintenance expires overdue donations, releases active reservations exactly once, cancels assignments, and retries pending/partial matching in deadline order. Failures are logged and retried on the next run.
- Claim candidates persist during a two-second window. Feasible candidates are ordered by estimated total ETA, with driver ID as a stable tie-break. A new request can resolve an interrupted closed window; a standalone crash-recovery claim sweeper is still needed.
- OTPs expire at the donation's safe deadline, use authenticated encryption bound to allocation/stage, lock after five failed attempts per stage, and are cleared after successful use. Recovery after lockout is not implemented.
- Donation, receiver-allocation, and open-job lists use bounded cursor pagination (`limit=1..100`, `cursor=...`); arrays retain compatibility, and `X-Next-Cursor` indicates another page. The UI offers Load more.
- Admin map snapshots are bounded to 100 records per entity; counts and impact are database aggregates. The operational UI still needs explicit map pagination/truncation controls at larger scale.
- Route lines and ETAs are estimates, not road navigation or traffic-aware arrival promises. External map tiles require network access; tile-provider terms and capacity have not been certified.
- Initial production JS is approximately 280 kB before gzip; role pages and Leaflet are loaded separately.
