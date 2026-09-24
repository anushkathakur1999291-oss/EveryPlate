# Production audit — 2026-09-24

Baseline: existing Express/Prisma/SQLite modular monolith and React/Vite/Leaflet client. Both builds pass. No AGENTS.md found. All project files were untracked at takeover; preserve them. No migrations, Docker deployment, real session authentication, expiry worker, or production test isolation existed.

## Critical problems
- Caller-selected identity headers/query, unrestricted user directory/admin routes and unauthenticated custody/mode changes.
- Arbitrary socket room subscription/location spoofing; raw delivery broadcasts disclose both OTPs.
- Privacy masking trusts role rather than ownership; drivers receive OTPs and public jobs disclose exact addresses.
- Allocation quantity calculated outside reservation transactions; rejection reads stale reservation and has no state guard; cancellation can reopen completed/unowned deliveries.
- OTP plaintext at rest and in attempt records, no expiry/attempt limit; failed attempts roll back. Custody lacks assignment/state checks.

## High priority
- No accepted-state guard for fulfillment; mode switches leave active assignments; driver availability not reserved/released.
- Fulfilled parent calculation fails with rejected allocations and can incorrectly fulfill partially allocated donations.
- No expiration/release maintenance or durable rematching retry; creation and matching are separate commits.
- Lowest-ETA helper is not wired to HTTP claims; claims currently first-writer wins. Clarification requested about claim window.
- Tests reseed configured database; some negative assertions catch their own assertion failures.
- Map popup HTML interpolates user content (stored XSS).
- Generic exceptions leak internal database details. Validation is incomplete, no request IDs/rate limits.

## Medium priority
- Multiple Prisma clients; unbounded listings and JS analytics aggregation; no query-pattern indexes.
- Matching scans all receivers, ignores availableAt, ties depend on query order. Urgency is constant across receivers for one donation (does not order donation backlog).
- Frontend role switch retains prior socket rooms; no reconnect reconciliation; capacity profile stale; async responses can cross identities.
- Receiver coordinator has no pickup verification UI; dispatch advisor uses fabricated driver count/distance.
- Dark, card-heavy visual language; tiny typography, alert/prompt interactions, incomplete error/loading states and inaccessible dialogs.
- Map recreates on default array identity; initial JS bundle 503.83 kB before gzip.

## Low priority
- Terminology and operational UI expose implementation details; guessed map/driver coordinates and duration defaults.
- Environmental equivalence claims and model performance claims unsubstantiated; actual default AI engine is heuristic fallback.

## Already good
- Domain services separated from controllers; existing stack is suitable for a single-node deployment.
- Parent donation and independent allocation model, unique allocation delivery/reservation and verified delivery impact record.
- Hard preference/capacity filters and configurable urgency/need/capacity/distance weights; preserve finalized rules.
- Dual fulfillment modes share delivery model, role-specific portals and backend OTP verification exist.
- Baseline TypeScript backend and frontend production builds pass.

This audit is an initial assessment, not certification. Follow PROJECT_HANDOFF.md for implementation and validation status.
