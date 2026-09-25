# EveryPlate

### Turning Surplus Food Into Meaningful Impact

**EveryPlate** is a real-time food rescue and redistribution platform designed to connect **food donors, receivers, and delivery partners** so that surplus food can be safely matched, transported, and delivered before it expires.

The platform manages the complete journey of a donation, from **food intake → intelligent matching → allocation → logistics → OTP-verified delivery → impact tracking**.

---

## The Problem

Every day, large amounts of edible food are wasted while organizations and communities face food shortages.

The challenge isn't only finding surplus food. It is also:

* Finding suitable receivers
* Checking receiver capacity
* Matching food before its safety deadline
* Coordinating transportation
* Preventing duplicate allocations
* Handling partial donations
* Verifying pickup and delivery
* Tracking the actual impact

**EveryPlate brings these pieces together into one operational platform.**

---

## What EveryPlate Does

EveryPlate creates a real-time bridge between:

**Donors → Matching Engine → Receivers → Logistics → Verified Delivery**

### Donors

Donors can:

* Create surplus food donations
* Provide quantity and food details
* Set availability and safety deadlines
* Use food recognition assistance
* Track donation status
* Verify pickup using OTP
* Monitor the rescue process

### Receivers

Receivers can:

* Maintain their food requirements
* Define maximum capacity
* Specify food preferences
* Accept or reject matched donations
* Choose their fulfillment method
* Use their own logistics when available
* Verify delivery using OTP

### Drivers

Platform drivers can:

* View available delivery opportunities
* Accept delivery jobs
* Share current location
* Navigate pickup and delivery
* Verify pickup/delivery workflow
* Handle delivery assignments

### Administrators

Administrators can:

* Monitor the platform
* View operational entities
* Track deliveries
* Monitor impact
* Manage platform-level operations
* Inspect system activity

---

# Core Features

## Intelligent Food Intake

EveryPlate includes an AI-assisted food recognition pipeline.

The system can process food information and extract structured attributes such as:

* Food category
* Food name
* Detected items
* Vegetarian/non-vegetarian status
* Packaging information
* Estimated portions
* Quantity
* Confidence
* Visual notes

The platform supports a local vision workflow using **Ollama**, with deterministic fallback logic when inference is unavailable.

---

## Intelligent Donation Matching

Donations are not simply assigned randomly.

EveryPlate uses a two-stage matching system.

### Stage 1: Hard Eligibility

Receivers are first filtered using constraints such as:

* Food category compatibility
* Receiver acceptance status
* Available capacity
* Delivery feasibility
* Food safety deadline

### Stage 2: Multi-Factor Scoring

Eligible receivers are scored using:

| Factor                 | Weight |
| ---------------------- | -----: |
| Urgency                |    35% |
| Need Level             |    30% |
| Capacity Fit           |    20% |
| Distance / Travel Time |    15% |

This allows the system to consider both **need and operational feasibility**.

---

# Partial Donation Allocation

A donation does not have to go to a single receiver.

For example:

```text
Donation
100 meals
   │
   ├── Receiver A → 50 meals
   ├── Receiver B → 30 meals
   └── Receiver C → 20 meals
```

EveryPlate maintains the original donation while creating independent allocations.

This prevents duplicated donations and allows surplus food to be distributed across multiple receivers.

---

# Dual Logistics System

Receivers can fulfill donations through two different transportation modes.

### Platform Driver

```text
Donor
  ↓
Platform Driver
  ↓
Receiver
```

### Receiver-Owned Logistics

```text
Donor
  ↓
Receiver's Logistics
  ↓
Receiver
```

The platform can also switch between fulfillment modes before pickup when operational conditions require it.

---

# Real-Time Delivery

EveryPlate uses **Socket.IO** for real-time operational updates.

The system supports:

* Driver availability
* Delivery updates
* Location updates
* Operational notifications
* Session-aware sockets
* Role-based socket rooms

---

# Secure OTP Verification

Food custody is verified using separate OTP stages.

### Pickup

**Donor → Pickup OTP → Transporter**

### Delivery

**Receiver → Delivery OTP → Transporter**

OTP security includes:

* Six-digit random codes
* Encrypted storage
* Expiration
* Failed-attempt limits
* Replay protection
* Owner-only replacement
* Stage validation
* Assignment validation

This creates a verifiable custody chain instead of simply marking a delivery as completed.

---

# Concurrent Driver Assignment

EveryPlate handles situations where multiple drivers attempt to accept the same delivery.

A short claim window is used to evaluate competing drivers.

The system considers:

```text
Driver → Donor ETA
        +
Donor → Receiver ETA
        =
Total Delivery ETA
```

The delivery assignment is resolved transactionally to prevent duplicate assignments.

---

# Impact Tracking

Impact is recorded only after a delivery has been successfully verified.

The platform can track:

* Total rescued food
* Completed deliveries
* Food categories
* Delivery modes
* Impact statistics
* Historical records

This keeps impact calculations connected to actual completed deliveries.

---

# Maps & Routing

EveryPlate integrates map functionality for operational workflows.

Features include:

* Location selection
* Receiver locations
* Driver locations
* Rescue maps
* Route visualization
* Estimated travel information
* Google Maps integration support

Leaflet is used for map rendering.

---

# Architecture

```text
                         ┌─────────────────────────┐
                         │       EVERYPLATE        │
                         │    Food Rescue Platform  │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │        FRONTEND         │
                         │                         │
                         │ React + TypeScript      │
                         │ Vite + Tailwind CSS     │
                         │                         │
                         │ Donor | Receiver        │
                         │ Driver | Admin          │
                         └────────────┬────────────┘
                                      │
                              REST API + WebSocket
                                      │
                         ┌────────────▼────────────┐
                         │         BACKEND         │
                         │                         │
                         │ Express + TypeScript    │
                         │                         │
                         │ ┌─────────────────────┐ │
                         │ │   Core Services     │ │
                         │ │                     │ │
                         │ │ Authentication      │ │
                         │ │ Donations           │ │
                         │ │ Matching Engine     │ │
                         │ │ Allocation          │ │
                         │ │ Fulfillment         │ │
                         │ │ OTP Verification    │ │
                         │ │ Impact Tracking     │ │
                         │ └──────────┬──────────┘ │
                         └────────────┼────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
           ┌────────▼────────┐ ┌──────▼───────┐ ┌──────▼───────┐
           │   Prisma ORM    │ │   Socket.IO  │ │  AI Vision   │
           │                 │ │              │ │              │
           │ Database Access │ │ Real-time    │ │ Food Analysis│
           └────────┬────────┘ │ Updates      │ └──────┬───────┘
                    │          └──────────────┘        │
           ┌────────▼────────┐                 ┌───────▼───────┐
           │     SQLite      │                 │    Ollama     │
           │    Database     │                 │ Vision Model  │
           └─────────────────┘                 └───────────────┘
---

# Tech Stack

## Frontend

* **React 19**
* **TypeScript**
* **Vite**
* **Tailwind CSS**
* **Leaflet**
* **Socket.IO Client**
* **Lucide React**

## Backend

* **Node.js**
* **Express**
* **TypeScript**
* **Prisma ORM**
* **SQLite**
* **Socket.IO**
* **Zod**

## AI

* **Ollama**
* Vision model support
* Deterministic fallback food parser
* Laya-compatible decision/inference integration

## Development & Testing

* TypeScript
* Prisma migrations
* Playwright
* Custom regression tests
* Browser validation scripts
* Docker

---

# Project Structure

```text
EveryPlate/
│
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   │
│   ├── scripts/
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── ai/
│   │   │   ├── allocation/
│   │   │   ├── auth/
│   │   │   ├── fulfillment/
│   │   │   ├── matching/
│   │   │   ├── otp/
│   │   │   ├── routing/
│   │   │   └── socket/
│   │   ├── tests/
│   │   └── app.ts
│   │
│   └── package.json
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── features/
│   │   │   ├── admin/
│   │   │   ├── donor/
│   │   │   ├── driver/
│   │   │   └── receiver/
│   │   ├── services/
│   │   └── App.tsx
│   │
│   └── package.json
│
├── docs/
│   ├── DEPLOYMENT.md
│   ├── PHASE_1_ARCHITECTURE.md
│   ├── PRODUCTION_AUDIT.md
│   └── validation/
│
├── Dockerfile
├── compose.yaml
└── PROJECT_HANDOFF.md
```

---

# Getting Started

## Prerequisites

Make sure you have installed:

* Node.js
* npm
* Git
* Docker *(optional)*
* Ollama *(optional, for local AI vision)*

---

## 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/EveryPlate.git

cd EveryPlate
```

---

# Backend Setup

```bash
cd backend
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

Generate the Prisma client:

```bash
npm run prisma:generate
```

Apply the database migrations:

```bash
npm run db:deploy
```

Start the backend:

```bash
npm run dev
```

The backend runs on:

```text
http://localhost:4000
```

---

# Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
```

Start the development server:

```bash
npm run dev
```

The frontend runs on:

```text
http://localhost:3000
```

---

# Optional AI Setup

EveryPlate can use a local Ollama vision model.

Install and run Ollama, then configure the required environment variables.

Example:

```env
VISION_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
VISION_MODEL=moondream
VISION_STRUCTURER_MODEL=gemma2:2b
```

If the local vision service is unavailable, EveryPlate can use its deterministic fallback processing.

---

#  Testing

Run the complete backend test suite:

```bash
cd backend
npm test
```

Individual test suites are also available:

```bash
npm run test:domain
npm run test:matching
npm run test:fulfillment
npm run test:api
npm run test:socket
npm run test:impact
npm run test:ai
```

Hardening tests:

```bash
npm run test:hardening
```

---

# Docker

EveryPlate includes Docker support.

Build the application:

```bash
docker build -t everyplate .
```

Run with Compose:

```bash
docker compose up --build
```

---

# Security

EveryPlate includes multiple security layers:

* Session-based authentication
* HttpOnly cookies
* SameSite protection
* Password hashing
* Role-based access control
* Request validation
* Rate limiting
* CORS restrictions
* Write-origin validation
* OTP encryption
* OTP replay protection
* Authorization checks
* Response sanitization
* Request IDs
* Safe error handling
* Database integrity constraints

Sensitive environment variables should **never be committed to GitHub**.

Use:

```text
.env.example
```

as the template for local configuration.

---

# Donation Lifecycle

```text
DRAFT
  │
  ▼
MATCHING
  │
  ▼
PARTIALLY_MATCHED / FULLY_MATCHED
  │
  ▼
FULFILLMENT
  │
  ▼
PICKUP VERIFIED
  │
  ▼
IN TRANSIT
  │
  ▼
DELIVERY VERIFIED
  │
  ▼
FULFILLED
  │
  ▼
IMPACT RECORDED
```

---

# Design Principles

EveryPlate follows several important engineering principles:

### 1. Real Data Over Mock Data

Core workflows operate using actual application data rather than fabricated frontend values.

### 2. Server-Authoritative State

Capacity, allocations, delivery state and assignments are validated on the backend.

### 3. Transactional Integrity

Critical operations use database transactions and conditional updates to reduce race conditions.

### 4. Privacy by Default

Sensitive information such as OTPs, private contact details and restricted locations is not exposed unnecessarily.

### 5. Operational Resilience

Maintenance routines handle:

* Expired donations
* Pending matching
* Driver claim resolution
* Interrupted matching
* Assignment cleanup

---

# Supported Roles

| Role        | Main Responsibilities   |
| ----------- | ----------------------- |
|  Donor    | Donate surplus food     |
|  Receiver | Receive and manage food |
|  Driver   | Transport donations     |
|  Admin   | Monitor operations      |

---

#  Future Improvements

Potential future development areas include:

* Continuous driver location sharing
* Expanded routing optimization
* More advanced vision models
* Improved matching fairness evaluation
* Production database migration to PostgreSQL
* Advanced analytics dashboards
* Notification infrastructure
* Larger-scale deployment
* More extensive automated browser regression testing

---

#  Project Status

EveryPlate is an **actively developed project**.

The repository contains implemented security, matching, fulfillment, real-time communication, AI-assisted intake, and frontend workflows.

Some production-readiness and operational verification work remains ongoing.

---

#  Contributing

Contributions are welcome.

```bash
# Fork the repository

# Create a feature branch
git checkout -b feature/your-feature

# Make your changes

# Commit
git commit -m "feat: add your feature"

# Push
git push origin feature/your-feature

# Open a Pull Request
```

---

#  License

Add your preferred open-source license here.

For example:

```text
MIT License
```

---

##  Vision

**EveryPlate is built around a simple idea:**

> Food that can still help someone should not become waste.

By combining intelligent matching, real-time logistics, secure verification and impact tracking, EveryPlate aims to turn surplus food into a coordinated rescue operation.

---

###  EveryPlate

**Donate surplus. Match intelligently. Deliver safely. Measure the impact.**
