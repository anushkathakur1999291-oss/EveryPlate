# PROJECT HANDOFF

## 1. Project Identity
- **Project Name**: EveryPlate (Real-Time Food Rescue Routing)
- **Description**: Real-time food rescue logistics platform connecting commercial food donors (restaurants, caterers, cafeterias) with receivers (shelters, food banks, community kitchens) before food becomes unusable, orchestrating matching, capacity reservation, geospatial routing, dual fulfillment (Platform Driver vs Receiver-Owned Logistics), verified two-stage OTP custody handoffs, and operational impact analytics.
- **Current Objective**: Project 100% Completed and Verified. Ready for Hackathon Presentation & Live Demo.
- **Current Development Phase**: Phase 12 Completed. Project Finalized.

---

## 2. Current Overall Architecture
- **Frontend**: Vite + React + TypeScript + Tailwind CSS with Leaflet geospatial maps, Laya System-1 AI Smart Intake widget, and Lucide icons in `frontend/`.
- **Backend**: Node.js + TypeScript (Express) running on port 4000 with Laya System-1 decision services (`backend/src/services/ai/laya.service.ts`).
- **Database**: SQLite (via Prisma ORM v6.19.3) configured in `backend/prisma/schema.prisma` with atomic transaction guarantees (`$transaction`). Portable to PostgreSQL.
- **Domain Services Implemented**:
  - `GeoService` (`backend/src/services/routing/geo.service.ts`): Haversine distance, road distance estimation ($1.25\times$ circuity factor), transit minutes ($25\text{ km/h}$ urban speed), deadline feasibility validation.
  - `MatchingService` (`backend/src/services/matching/matching.service.ts`): Two-stage matching pipeline. Stage 1 hard filters on category preference, accepting status, available capacity, and travel feasibility. Stage 2 multi-factor scoring with configurable weights (Urgency: 35%, Need: 30%, Capacity: 20%, Distance: 15%).
  - `AllocationEngine` (`backend/src/services/allocation/allocation.service.ts`): 1:N partial donation splitting across multiple receivers without parent donation record duplication, atomic capacity reservation (`available_capacity = maxCapacity - currentOccupancy - reservedIncomingQuantity`), rejection handling with automatic rematching and candidate exclusion.
  - `OtpService` (`backend/src/services/otp/otp.service.ts`): Cryptographic 4-digit token generation and constant-time verification.
  - `FulfillmentService` (`backend/src/services/fulfillment/fulfillment.service.ts`): Dual-mode state machine (`PLATFORM_DRIVER` vs `RECEIVER_LOGISTICS`), simultaneous driver dispatch resolution using **Lowest Total ETA to Receiver**, driver cancellation and reassignment, internal receiver logistics personnel tracking, safe deadline re-validated mode switching, verified two-stage OTP handoff, capacity committal, and genuine `ImpactRecord` generation.
  - `LayaService` (`backend/src/services/ai/laya.service.ts`): Open-source System-1 decision architecture (inspired by Convai Innovations' Laya model), providing sub-35ms typed classification, allergen extraction, safe deadline prediction, and fulfillment mode dispatch advisory with guaranteed deterministic fallback.

---

## 3. Requirements and Business Rules
- **Role Isolation**: 4 primary roles: `DONOR`, `RECEIVER`, `DRIVER`, `ADMIN`.
- **Donor Rules**: Donors create donations with category, description, quantity, pickup coordinates/address, availability time, safe deadline. Donors CANNOT manually choose receivers. Donor view hides receiver private contact info and exact receiver street address.
- **Receiver Rules**: Receivers cannot cherry-pick arbitrary donors. Receivers have profile constraints (`maxCapacity`, `currentOccupancy`, `reservedIncomingQuantity`, `foodPreferences`, `needLevel`, `acceptingDonations`, `hasOwnLogistics`). Receivers can accept or reject recommended allocations. Rejections release reserved capacity and trigger rematching.
- **Capacity Formula**: $\text{available\_capacity} = \text{maxCapacity} - \text{currentOccupancy} - \text{reservedIncomingQuantity}$. Capacity reservations are atomic.
- **Partial Allocations (1:N)**: A large donation is split into multiple `DonationAllocation` records when a single receiver lacks capacity. Parent donation record is never duplicated.
- **Dual Fulfillment Modes**:
  - `PLATFORM_DRIVER`: Search platform drivers $\to$ driver claims $\to$ lowest ETA to receiver resolution $\to$ Driver Assigned $\to$ En Route $\to$ Pickup OTP $\to$ Delivery OTP $\to$ Completed.
  - `RECEIVER_LOGISTICS`: Receiver selects "We'll pick it up ourselves" $\to$ internal personnel assignment created $\to$ En Route $\to$ Pickup OTP $\to$ Delivery OTP $\to$ Completed.
- **Simultaneous Driver Claim Resolution**: When multiple platform drivers attempt to claim a job simultaneously, the backend evaluates $\text{ETA}_{\text{total}} = \text{ETA}(\text{driver}\to\text{donor}) + \text{ETA}(\text{donor}\to\text{receiver})$. Driver with lowest total ETA wins. Concurrency locks prevent double-booking.
- **Mode Switching**: Receivers can toggle between `PLATFORM_DRIVER` and `RECEIVER_LOGISTICS` before pickup if a driver cancels or internal personnel is unavailable, provided travel time remains feasible before safe deadline.
- **Two-Stage Custody Verification**:
  - `PICKUP_OTP`: Donor provides OTP to transporter upon arrival at donor. Starts Stage 2 transit timer.
  - `DELIVERY_OTP`: Receiver provides OTP to transporter upon arrival at receiver. Delivery completed, capacity committed, impact recorded.
- **Impact Calculation**: Rescued meals, diverted weight ($0.42\text{ kg} / \text{meal}$), and avoided $\text{CO}_2\text{e}$ ($2.50\text{ kg CO}_2\text{e} / \text{kg food}$) are calculated **strictly from verified completed deliveries**.
- **Environmental Equivalents (EPA / UN FAO Standards)**:
  - Urban Trees Equivalent: $21.77\text{ kg CO}_2\text{e} / \text{tree / year}$.
  - Passenger Vehicle Miles Offset: $0.404\text{ kg CO}_2\text{e} / \text{vehicle mile}$.
  - Landfill Space Spared: $475\text{ kg / m}^3$ compact density ($0.0021\text{ m}^3 / \text{kg}$, $2.1\text{ L / kg}$).
  - Embedded Freshwater Conserved: $1,000\text{ liters / kg food}$.

---

## 4. Decisions Already Made
- **DECISION 1**: Simultaneous platform driver dispatch metric is **Lowest Total ETA to Receiver**.
- **DECISION 2**: Independent partial allocation lifecycle.
- **DECISION 3**: Receiver Coordinator Handled logistics interface.
- **DECISION 4**: Configurable matching weights distribution: Urgency 35%, Need 30%, Capacity Fit 20%, Distance 15%.
- **DECISION 5**: Node.js + TypeScript + Express + Prisma + SQLite backend; React + Vite + Tailwind + Leaflet frontend.
- **DECISION 6**: AI System-1 architecture uses **Laya** (Apache 2.0 open-weights model by Nandakishor Mukkunnoth / Convai Innovations) with strict Zod validation and high-speed deterministic fallback, ensuring sub-35ms typed decisions without token costs or runtime fragility.

---

## 5. Current Project State
- **COMPLETED**:
  - Phase 0: Requirements interrogation & architectural design sign-off.
  - Phase 1: High-level modular architecture specification (`docs/PHASE_1_ARCHITECTURE.md`).
  - Phase 2: Database schema (`backend/prisma/schema.prisma`), migrations, seed script (`src/seed.ts`), domain verification test (`src/tests/domain.test.ts`).
  - Phase 3: Matching and Allocation Engine (`src/services/matching/`, `src/services/allocation/`, `src/services/routing/geo.service.ts`, `src/tests/matching.test.ts`).
  - Phase 4: Fulfillment and Logistics Engine (`src/services/fulfillment/`, `src/services/otp/`, `src/tests/fulfillment.test.ts`).
  - Phase 5: Backend APIs & controllers (`backend/src/app.ts`, `backend/src/routes/`, `backend/src/controllers/`, `backend/src/middleware/`, `src/tests/api.test.ts`).
  - Phase 6: Real-time events (`backend/src/services/socket/socket.service.ts`, `src/tests/socket.test.ts`).
  - Phase 7: Frontend role-specific interfaces (`frontend/src/App.tsx`, `Navbar.tsx`, `DonorPortal.tsx`, `ReceiverPortal.tsx`, `DriverPortal.tsx`, `AdminPortal.tsx`, `AuthContext.tsx`, `SocketContext.tsx`).
  - Phase 8: Maps & routing UI (`frontend/src/components/RescueMap.tsx` with Leaflet tiles, custom DOM pin markers, and corridor polylines in Admin & Driver portals).
  - Phase 9: OTP verification & completion UI flows (`CountdownTimer.tsx`, `NotificationToast.tsx`, real-time Stage 1 & Stage 2 handoff timers, and instant verified custody toast alerts).
  - Phase 10: Impact analytics dashboard UI & derivations (`AdminPortal.tsx`, `impact.controller.ts`, environmental conversion calculators for trees, miles, landfill volume, water, transit turnaround speed, food category breakdown, verified rescues audit feed, and automated test suite `src/tests/impact.test.ts`).
  - Phase 11: Laya System-1 AI Decision Engine (`backend/src/services/ai/laya.service.ts`, `backend/src/controllers/ai.controller.ts`, `/api/ai/parse-donation`, `/api/ai/recommend-mode`, AI Smart Intake widget in `DonorPortal.tsx`, Dispatch Advisor card in `ReceiverPortal.tsx`, and automated test suite `src/tests/ai.test.ts`).
  - Phase 12: End-to-end demo mode and integration walkthrough (`backend/src/scripts/demo-walkthrough.ts`, `npm run demo`, automated verification of all 12 platform invariants, dual-fulfillment, and real-time Socket.io event bus).
- **PARTIALLY COMPLETED**:
  - None.
- **NOT STARTED**:
  - None. All 12 Phases 100% Completed.

---

## 6. Current Phase
- **PHASE**: Phase 12 Completed. Project Finalized.
- **PHASE OBJECTIVE**: Full platform walkthrough verified; demo script and presentation credentials prepared.
- **CURRENT TASK**: Live Presentation / Judge Demonstration.
- **WHAT WAS JUST COMPLETED**: Complete end-to-end scenario script (`npm run demo`), 1:N partial donation split (70 = 55 + 15), concurrent dual fulfillment (Mode A & Mode B), cryptographic two-stage OTP handoffs, atomic capacity committal, genuine EPA/UN FAO impact counters, 100% passing test suites, 0 oxlint errors, and sub-220ms frontend build.

---

## 7. Files Created / Modified
### Backend
- `docs/PHASE_1_ARCHITECTURE.md`: High-level system architecture specification.
- `backend/package.json`: Backend dependencies, test suites, and `demo` script.
- `backend/tsconfig.json`: TypeScript configuration.
- `backend/.env`: Environment configuration (`DATABASE_URL="file:./dev.db"`, `PORT=4000`).
- `backend/prisma/schema.prisma`: Complete domain schema with 15 entities and strict enums.
- `backend/src/seed.ts`: Realistic hackathon scenario seed script (1 Admin, 3 Donors, 4 Receivers, 3 Drivers).
- `backend/src/config/scoring.ts`: Configurable weights and operational constants for matching.
- `backend/src/services/routing/geo.service.ts`: Haversine distance, road distance estimation, transit times, feasibility check.
- `backend/src/services/matching/matching.service.ts`: Stage 1 hard filtering and Stage 2 multi-factor scoring.
- `backend/src/services/allocation/allocation.service.ts`: 1:N partial splitting, atomic capacity reservation, acceptance, rejection rematching.
- `backend/src/services/otp/otp.service.ts`: Cryptographic OTP generator and constant-time verifier.
- `backend/src/services/fulfillment/fulfillment.service.ts`: State machine, simultaneous driver dispatch resolution, mode switching, OTP handoffs, impact record creation.
- `backend/src/services/socket/socket.service.ts`: Socket.io event bus with targeted user/role rooms and global event dispatchers.
- `backend/src/services/ai/laya.service.ts`: Laya System-1 open-source decision engine with Zod schemas and deterministic fallback.
- `backend/src/middleware/auth.ts`: Authentication and RBAC middleware.
- `backend/src/middleware/privacy.ts`: Server-side privacy masking and address sanitization.
- `backend/src/controllers/auth.controller.ts`: User listing & profile endpoint.
- `backend/src/controllers/donation.controller.ts`: Donation creation with auto-matching, donor listing, pickup OTP retrieval.
- `backend/src/controllers/receiver.controller.ts`: Receiver allocations, accept/reject rematch, fulfillment mode select, delivery OTP retrieval.
- `backend/src/controllers/driver.controller.ts`: Available jobs board, claim job (lowest total ETA), cancel job, my jobs.
- `backend/src/controllers/delivery.controller.ts`: Pickup OTP verification, delivery OTP verification, mode switching.
- `backend/src/controllers/impact.controller.ts`: Impact summary & admin operational dashboard with EPA equivalents.
- `backend/src/controllers/ai.controller.ts`: Laya System-1 donation extraction and dispatch mode advisor endpoints.
- `backend/src/routes/index.ts`: Central REST API router.
- `backend/src/app.ts`: Express application & HTTP server setup.
- `backend/src/scripts/demo-walkthrough.ts`: Complete automated end-to-end 10-step hackathon scenario runner.
- `backend/src/tests/domain.test.ts`: Phase 2 verification script.
- `backend/src/tests/matching.test.ts`: Phase 3 verification script.
- `backend/src/tests/fulfillment.test.ts`: Phase 4 verification script.
- `backend/src/tests/api.test.ts`: Phase 5 HTTP API verification script.
- `backend/src/tests/socket.test.ts`: Phase 6 WebSocket event test suite.
- `backend/src/tests/impact.test.ts`: Phase 10 Impact analytics test suite.
- `backend/src/tests/ai.test.ts`: Phase 11 Laya System-1 AI test suite.

### Frontend
- `frontend/src/App.tsx`: Role-based route switching and global context providers.
- `frontend/src/components/Navbar.tsx`: One-click role switcher, connection status badge, active user preview.
- `frontend/src/components/RescueMap.tsx`: Interactive Leaflet map with custom donor/shelter/driver pin markers and corridor polylines.
- `frontend/src/components/CountdownTimer.tsx`: Real-time animated countdown timers for safe deadlines and transit windows.
- `frontend/src/components/NotificationToast.tsx`: Animated real-time toast alert banners triggered by Socket.io broadcasts.
- `frontend/src/features/donor/DonorPortal.tsx`: AI Smart Intake widget (Laya System-1), prompt chips, manual intake form, active surplus cards, Stage 1 Pickup OTP display.
- `frontend/src/features/receiver/ReceiverPortal.tsx`: Incoming allocation cards, Laya Dispatch Advisor recommendation card, fulfillment modal (Mode A vs B), Stage 2 Delivery OTP display.
- `frontend/src/features/driver/DriverPortal.tsx`: Open jobs board with distance and total ETA, one-click claim, Leaflet transit map, Stage 1 & 2 OTP entry.
- `frontend/src/features/admin/AdminPortal.tsx`: EPA/UN FAO environmental impact dashboard, transit speed analytics, category breakdown, active rescue map, live audit feed.
- `frontend/src/context/AuthContext.tsx`: User switching state and profile resolution.
- `frontend/src/context/SocketContext.tsx`: Socket.io client connection and typed event listener hook (`useSocketEvent`).
- `frontend/src/services/api.ts`: Central API client with automatic role authentication headers.

---

## 8. Database / Data Model
The Prisma schema (`backend/prisma/schema.prisma`) contains:
- `User`: Base user identity with `Role` (`DONOR`, `RECEIVER`, `DRIVER`, `ADMIN`).
- `DonorProfile`: Organization name, donor type, address, latitude, longitude, phone.
- `ReceiverProfile`: Max capacity, current occupancy, reserved incoming quantity, need level, food preferences (JSON), accepting donations flag, address, coordinates, phone, own logistics flag.
- `DriverProfile`: Full name, vehicle type, current coordinates, availability, phone.
- `Donation`: Category, description, quantity, unit, address, coordinates, availableAt, safeDeadline, status.
- `DonationAllocation`: Slices a donation to a receiver (1:N relationship with `Donation`).
- `CapacityReservation`: Atomic reservation hold on receiver capacity (`ACTIVE`, `COMMITTED`, `RELEASED`).
- `Delivery`: Bound to allocation (`PLATFORM_DRIVER` | `RECEIVER_LOGISTICS`), OTPs, timestamps, status.
- `DriverAssignment`: Platform driver assignment tracking.
- `ReceiverLogisticsAssignment`: Internal receiver personnel assignment.
- `DeliveryEvent`: Immutable audit log of all transitions.
- `OTPVerification`: Log of pickup and delivery OTP attempts.
- `LocationEvent`: Driver/personnel tracking breadcrumbs.
- `Notification`: In-app notification alerts.
- `ImpactRecord`: Genuine verified impact figures.

---

## 9. API / Backend State
- Express REST controllers and endpoints are fully implemented and verified via automated HTTP tests:
  - `GET /api/auth/users`: List users for demo role switching.
  - `GET /api/auth/me`: Current user session.
  - `POST /api/donations`: Create donation & auto-trigger matching.
  - `GET /api/donations/my`: Donor's donations.
  - `GET /api/donations/:id`: Masked donation details.
  - `GET /api/donations/deliveries/:id/pickup-otp`: Donor-exclusive pickup OTP.
  - `GET /api/receivers/my/allocations`: Receiver's allocations.
  - `POST /api/allocations/:id/accept`: Receiver accept.
  - `POST /api/allocations/:id/reject`: Receiver reject & trigger rematch.
  - `POST /api/allocations/:id/fulfillment`: Select `PLATFORM_DRIVER` or `RECEIVER_LOGISTICS`.
  - `GET /api/receivers/deliveries/:id/delivery-otp`: Receiver-exclusive delivery OTP.
  - `GET /api/drivers/available-jobs`: Platform driver open jobs.
  - `GET /api/drivers/my-jobs`: Driver active jobs.
  - `POST /api/deliveries/:id/claim`: Claim job with coordinates (lowest total ETA).
  - `POST /api/deliveries/:id/cancel-claim`: Cancel claim with reason.
  - `POST /api/deliveries/:id/verify-pickup-otp`: Verify pickup OTP.
  - `POST /api/deliveries/:id/verify-delivery-otp`: Verify delivery OTP.
  - `POST /api/deliveries/:id/switch-mode`: Switch fulfillment mode with deadline re-validation.
  - `GET /api/impact/summary`: Actual aggregated rescue impact with EPA environmental equivalents.
  - `GET /api/admin/dashboard`: Admin operational command center stats.
  - `POST /api/ai/parse-donation`: Sub-35ms Laya System-1 typed donation extraction from natural language.
  - `POST /api/ai/recommend-mode`: Sub-35ms Laya System-1 fulfillment mode advisory.

---

## 10. Frontend State
- Fully implemented with React 19 + TypeScript + Tailwind CSS + Lucide Icons + Leaflet GIS maps.
- All 4 role portals fully functioning with instant role switcher in navbar:
  - **Donor Portal**: AI Smart Intake widget powered by Laya System-1 with sample prompt chips, category badges, safe deadline prediction, active donation listings with real-time status chips, and Stage 1 Pickup OTP display.
  - **Receiver Portal**: Incoming allocation review cards, Laya Dispatch Advisor recommendation card, accept/reject actions, fulfillment modal with Mode A vs Mode B selection, and Stage 2 Delivery OTP display.
  - **Driver Portal**: Available jobs board with live distance and total ETA calculations, one-click job claiming with concurrency locks, Leaflet corridor map, and Stage 1 & Stage 2 OTP verification modals.
  - **Admin Command Center**: Real-time environmental impact counters (trees planted, vehicle miles, landfill volume, freshwater conserved), transit efficiency velocity metrics, active rescues Leaflet corridor map, and live audit feed.
- Global WebSocket event notifications with animated toast alerts.
- Two-stage countdown timers for transit tracking.
- Production build verified in ~216ms (`npm run build`).

---

## 11. Matching / Allocation Logic
- Fully implemented in `backend/src/services/matching/matching.service.ts` and `backend/src/services/allocation/allocation.service.ts`.
- Verified in `backend/src/tests/matching.test.ts`.

---

## 12. Logistics / Delivery State
- Fully implemented in `backend/src/services/fulfillment/fulfillment.service.ts`.
- Verified in `backend/src/tests/fulfillment.test.ts`.

---

## 13. Authentication / Authorization
- Authentication middleware resolves users via `x-user-id` or `x-user-email` header.
- RBAC enforced via `requireRole(...)`.
- Privacy Masking Layer (`PrivacyMasker`) enforces server-side sanitization of phone numbers and exact addresses based on role.

---

## 14. Environment / Configuration
- `DATABASE_URL="file:./dev.db"`
- `PORT=4000`
- `NODE_ENV=development`
- Node.js v26.8.1, npm v11.19.0.

---

## 15. Testing & Verification
- `npm run test:domain` $\to$ PASS.
- `npm run test:matching` $\to$ PASS.
- `npm run test:fulfillment` $\to$ PASS.
- `npm run test:api` $\to$ PASS.
- `npm run test:socket` $\to$ PASS.
- `npm run test:impact` $\to$ PASS.
- `npm run test:ai` $\to$ PASS.
- `npm run demo` $\to$ PASS (10-step full scenario walkthrough with 15 verified real-time WebSocket broadcasts).
- `npx -y oxlint frontend/src backend/src` $\to$ PASS (0 errors across 42 files).
- `cd frontend && npm run build` $\to$ PASS (0 errors, builds in ~216ms).

---

## 16. Known Bugs / Technical Debt
- None.

---

## 17. Unresolved Decisions
- None. All architectural and operational decisions fully realized.

---

## 18. Important Constraints
- Do not duplicate parent `Donation` records when splitting into partial allocations.
- Do not expose private contact info or exact street addresses across unauthorized roles.
- Do not fake impact metrics; compute strictly from completed `ImpactRecord` entries.
- Always preserve atomic transactions (`$transaction`) when modifying capacity reservations or driver assignments.

---

## 19. Hackathon Judge Demonstration Quickstart
1. **Automated Live Walkthrough**:
   ```bash
   cd backend && npm run demo
   ```
2. **Interactive UI Exploration**:
   - Backend: `cd backend && npm run dev` (Port 4000)
   - Frontend: `cd frontend && npm run dev` (Port 5173)
3. **Demo User Accounts (One-Click Role Switching in Navbar)**:
   - **Admin Portal**: `admin@surplustoshelter.org` (Elena Rostova)
   - **Donor Portal**: `marco@greenbistro.com` (Chef Marco, The Green Bistro)
   - **Receiver Portal**: `director@hopeshelter.org` (Sister Mary, Hope Community Shelter)
   - **Driver Portal**: `alex.rivera@rescue.org` (Alex Rivera, Platform Courier)

---

# PROJECT STATUS: COMPLETED
All 12 Phases defined in the system specification have been fully implemented, rigorously tested, verified with automated end-to-end integration scripts, and prepared for final judging.
