# Operating EveryPlate

The current deployment target is **one Node process and one local SQLite database on persistent storage**. SQLite transactions, database triggers, and partial unique indexes protect integrity. This is not a validated multi-instance or high-throughput deployment. Socket rooms, HTTP rate limits, and maintenance scheduling are process-local. Sustained load testing remains a release gate. Controlled account provisioning is available through a CLI; public registration is not implemented.

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

**Legacy active four-digit OTPs are deliberately rejected by the new verifier.** Do not roll out mid-delivery without a planned reissue procedure. The development database at takeover had only completed deliveries, so this did not block its upgrade. The donor can reissue an unused pickup code and the receiver can reissue an unused receipt code through the authenticated UI. Recovery preserves attempt history, has a 60-second cooldown, and allows at most two replacements per stage. Coordinate with the code owner before resuming legacy active deliveries.

Rollback means restoring the backed-up database together with the prior application version, not blindly reversing integrity migrations while live requests write. The takeover backup is `/tmp/annsafe-before-hardening.db` (temporary storage; retain your own durable backup).

## Authentication and account provisioning

Production uses 12-hour opaque, database-backed sessions with hashed random tokens. Browser cookies are HttpOnly, SameSite=Strict, and Secure in production. Password hashes use salted asynchronous scrypt (N=32768, r=8, p=3), with bounded concurrent derivations and migration of older hashes on successful login. Login is rate-limited per IP. Password resets through the provisioning script revoke previous sessions. There is no public registration or password recovery flow yet.

The password tool sets credentials on an **existing user**. Supply the password via stdin, never a command-line argument:

```
cd backend
npm run auth:set-password -- person@example.com
# Supply a 15–256 character password on stdin, then EOF.
```

Use a trusted secret-input mechanism in automation; do not put credentials in repository files or shell history. Create users with `npm run account:create`, supplying a JSON object on stdin with name, email, password (15–256 characters), role, and the required role profile. The strict schema in `backend/src/scripts/create-account.ts` defines the fields. In a built container run `node dist/scripts/create-account.js`. Creation is atomic; duplicate emails and invalid profiles fail without partial users. Do not seed production with public demo accounts. Restrict backend port exposure to your TLS reverse proxy. Set `CORS_ORIGINS` to the exact HTTPS public origin; include the port if nonstandard. No wildcard CORS.

## Container configuration

`Dockerfile` builds the React UI and API and serves them from one origin. `compose.yaml` binds the app to localhost, persists SQLite in a named volume, runs as the Node user, and performs migrations on startup. Put TLS in front of it. `/health` is liveness, `/ready` checks database connectivity.

Supply `OTP_ENCRYPTION_KEY` as a persistent, secret 32-byte hex key (`openssl rand -hex 32`) and `CORS_ORIGINS` through deployment environment/secrets. **Losing/changing the OTP key invalidates active verification codes.** Never enable demo mode in a public deployment. Do not share the local demo encryption key.

Compose configuration validates. Container build/run is unverified because Docker daemon access is denied. An isolated HTTPS reverse-proxy browser smoke test passed production provisioning, static serving, Secure cookies, session refresh, and logout revocation. Verify the actual deployment proxy and rate-limit IP behavior in the target environment. `FRONTEND_DIST_DIR` optionally points the API at a prebuilt frontend outside the container. The app intentionally does not trust forwarded IP headers by default. Do not add unrestricted `trust proxy`.

## Operational behavior and limits

- Structured request logs include request IDs, routes, timings, and status; no request bodies, OTPs, passwords, or exact addresses. Delivery transition events remain in the database.
- Every 30 seconds, bounded maintenance expires overdue donations, releases active reservations exactly once, cancels assignments, and retries pending/partial matching in deadline order. Each failed item is logged independently. Matching retries are scheduled 60 seconds ahead so the first bounded batch cannot continuously starve later donations.
- Claim candidates persist during a two-second window. Feasible candidates are ordered by estimated total ETA, with driver ID as a stable tie-break. A bounded maintenance sweeper recovers interrupted closed windows even without another claim request. Cancelled/mode-switched windows cannot reassign a driver; resolved claims are retained for seven days.
- OTPs expire at the donation's safe deadline, use authenticated encryption bound to allocation/stage, lock after five failed attempts per code generation, and are cleared after successful use. Owner-only recovery creates a new generation while retaining old audit rows; the two-replacement cap bounds recovery attempts.
- Donation, receiver-allocation, and open-job lists use bounded cursor pagination (`limit=1..100`, `cursor=...`); arrays retain compatibility, and `X-Next-Cursor` indicates another page. The UI offers Load more.
- Admin map snapshots are bounded to 100 records per entity; counts and impact are database aggregates. The UI labels this limit; map pagination/filter controls remain future work.
- Route lines and ETAs are estimates, not road navigation or traffic-aware arrival promises. External map tiles require network access; tile-provider terms and capacity have not been certified.
- Initial production JS is approximately 280 kB before gzip; role pages and Leaflet are loaded separately.

## Verification commands

- Backend: `npm run build`, then `npm test` (hardening/session checks plus seven original regression suites, all isolated databases).
- Frontend: `npm run build`, `npm run lint`, `npm run check:browser`, `npm run check:production`. Browser checks require a Chromium browser and localhost listeners. Set `BROWSER_PATH` when needed; otherwise use installed Playwright Chromium or the detected local Brave binary.
- `npm run demo` in backend runs the walkthrough on a disposable database and ephemeral port; it does not attach to or reset the development server.
- Browser checks cover all four roles at 1440/768/390/320px, intake unit/deadline safeguards, and receiver-owned custody completion. Production smoke checks use temporary TLS certificates and a new provisioned account.
- Platform-only matching requires an available courier with a location updated within 30 minutes (legacy profiles fall back to their update timestamp). Drivers can refresh location from their workspace; client coordinates are not independently attested.
