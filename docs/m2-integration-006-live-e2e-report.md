# M2-INTEGRATION-006 — Live E2E via Gateway: Cross-Service Clinical Journey Report

> **Audit correction — 17/11/2026:** The earlier “ACCEPTED” wording and checked DoD below
> reflected a prior agent report, but the checkout did not contain reproducible run logs or
> artifacts tying those claims to the current backend and frontend revisions. Treat the
> detailed journey and test counts below as **historical reported results, not verified
> acceptance evidence**. This task is currently **HARNESS HARDENED / LIVE ACCEPTANCE PENDING**.
>
> Remediation in this checkout removes public Gateway access to cache invalidation, makes
> test services bind to loopback, requires explicit disposable-database/Auth configuration,
> removes embedded test credentials, prevents seeding from creating hosted Auth accounts,
> and makes live runners opt-in. Backend Gateway tests passed (56/56), E2E-config safety
> tests passed (4/4), Web tests passed (283 passed; 5 live cases skipped by default), Web
> typecheck passed, and Flutter live test files compiled and were skipped (4 skipped).
> No database seed, live Gateway journey, or hosted Auth request was run during this audit.
> The available Web and Flutter tests are API/widget integration tests, not a real-browser
> Next.js or emulator/device end-to-end run. Do not mark M2-INTEGRATION-006 accepted until
> the controlled live run and the remaining client-runtime evidence are recorded below.

- **Task ID:** `M2-INTEGRATION-006` (also covering `M2-INTEGRATION-005`, `M2-PLATFORM-003`)
- **Coordinator / Owner:** Member 1 (TV1 — API Gateway, platform harness, integration coordinator)
- **Worktree:** `/home/Williams/Projects/ClinicAppoiment-worktrees/backend-openapi`
- **Branch:** `test/m2-integration-006-live-e2e` (base `bec6e93`)
- **Status:** **HARNESS HARDENED / LIVE ACCEPTANCE PENDING**

## 0. Current Acceptance Gate

### Fixes now present

- Gateway no longer publishes `POST /internal/v1/auth/cache-invalidate`; successful MFA
  verification and session revocation invalidate the in-memory identity cache inside Gateway.
- E2E database URLs must resolve to loopback and the exact five `*_service_test` database
  names. Destructive seeding and live writes require separate explicit opt-in flags.
- Hosted Supabase Auth requires an explicitly attested dedicated test project. The seeder
  authenticates pre-provisioned test accounts before any reset and never silently signs up
  users. It validates all five database identities before truncating fixture tables.
- Daemon and test runners use configured environment values, bind services to loopback for
  this harness, avoid printing credentials/tokens/response payloads, and are opt-in.
- Live Web/Flutter client test files use environment credentials and the sanitized seed
  manifest. The patient appointment client now forwards idempotency keys for cancel and
  reschedule operations, matching the live-flow test contract.

### Safety verification completed in this checkout

| Check | Result |
|---|---|
| `node --check` on seed, config, daemon, journey and clinical runner scripts | PASS |
| `node --test scripts/m2-e2e-config.test.mjs` | PASS — 4/4 |
| `npm test --workspaces --if-present -- --reporter=dot` | PASS — 495 passed, 27 environment-dependent tests skipped |
| `npm run build --workspaces --if-present` | PASS |
| `npm test -w @clinic/api-gateway -- --reporter=dot` | PASS — 56/56 |
| `npm test -w @clinic/openapi-contract-tests -- --reporter=dot` | PASS — 103/103 |
| `npm test -w @clinic/clinic-management-web -- --reporter=dot` | PASS — 283 passed, 5 live tests skipped by default |
| `npm run typecheck -w @clinic/clinic-management-web` | PASS |
| Flutter live auth + booking files, with live opt-in absent | PASS compile; 4 live tests skipped |
| Destructive seed / live service / hosted Auth journey | **NOT RUN** |

### Remaining acceptance blockers

1. An operator must configure `.env.m2-e2e` with five disposable loopback databases,
   isolated pre-provisioned Auth accounts, matching internal tokens, and migrations; then
   execute the documented live sequence and preserve redacted exit-code evidence.
2. The current Web tests call Gateway APIs directly rather than driving the Next.js app in a
   real browser. Flutter tests use repository/widget tests rather than an emulator/device
   journey. These do not satisfy the original “real client” E2E Definition of Done.
3. Re-run the integrated flows against the exact backend and frontend task SHAs after the
   TV2/TV3/TV4 test changes are committed locally and assembled. Record skips as failures
   for mandatory flows; do not reuse the historical counts below as current evidence.

### Controlled local run sequence

Copy `docs/m2-integration-006-e2e.env.example` to an ignored `.env.m2-e2e`, fill only
dedicated test values, and verify all Supabase accounts are pre-provisioned. Do not use
real users or production data. From the backend worktree:

```sh
set -a
source .env.m2-e2e
set +a
npm run build --workspaces --if-present
M2_E2E_ALLOW_DATABASE_RESET=1 node scripts/seed-m2-e2e-data.mjs
```

In a second backend terminal, load the same ignored env file and start
`node scripts/live-services-daemon.mjs`. In a third terminal, run
`M2_E2E_ALLOW_DATABASE_WRITES=1 M2_E2E_RUN_LIVE=1 node scripts/run-m2-live-journey.mjs`.
For client API/widget tests, load the same env in the frontend task worktree and set
`M2_E2E_SEED_MANIFEST` to the backend worktree's `.m2-e2e-seed-manifest.json`; run the
specific live test files with the Gateway pointed at loopback. The standalone clinical
runner also requires `M2_E2E_ALLOW_DATABASE_WRITES=1`,
`M2_E2E_AUTH_PROJECT_ISOLATED=1`, and the matching Supabase project reference. Keep all
live switches unset or `0` for routine unit-test runs.

---

## 1. Environment & Architecture Baseline

### Runtime Topology
All public requests from clients strictly pass through the single public entrypoint:
- **API Gateway:** `http://127.0.0.1:8080`
- **Client Direct Access to Services:** **BLOCKED** (public access to internal routes `/internal/*` strictly rejected with 403/404; internal services bind only to internal loopback ports).
- **Client Direct Access to Databases:** **BLOCKED** (no frontend database access).

### Real Backend Services (Live Daemons on Disposable DBs)
| Service | Internal Port | Disposable Database (PostgreSQL port 5433) | Readiness Health Check |
|---|---|---|---|
| **API Gateway** | `8080` | N/A (stateless reverse proxy & verifier) | `GET http://127.0.0.1:8080/health` → `200 OK` |
| **User Service** | `3001` | `user_service_test` | `GET http://127.0.0.1:3001/health` → `200 OK` |
| **Doctor Service** | `3002` | `doctor_service_test` | `GET http://127.0.0.1:3002/health` → `200 OK` |
| **Appointment Service** | `3003` | `appointment_service_test` | `GET http://127.0.0.1:3003/health` → `200 OK` |
| **Medical Record Service** | `3004` | `medical_record_service_test` | `GET http://127.0.0.1:3004/health` → `200 OK` |
| **Notification Service** | `3005` | `notification_service_test` | `GET http://127.0.0.1:3005/health` → `200 OK` |

### Disposable Test Database Baseline
- Container: `clinic-test-pg` running on `127.0.0.1:5433` (disposable PostgreSQL instance).
- Migrations: Fully applied and verified across all 5 test schemas (`user_service`, `doctor_service`, `appointment_service`, `medical_record_service`, `notification_service`).
- Zero production or live PHI used: 100% synthetic seed data with deterministic test UUIDs.

### Synthetic Accounts Provisioned
- **PATIENT:** `patient.live.e2e@clinic.test` (userId: `3fbc73cb-4b55-4aec-a0a4-b3122e20cc59`, patientId: `d2f9a2e0-2413-4d1d-96b4-f3f0bbe9dcd0`)
- **STAFF:** `staff.live.e2e@clinic.test` (userId: `5b1dea91-1d79-4d5e-95ab-e0a5dc925241`, factorId: `9c128c27-185a-4638-ab31-ded2c25a33ed`)
- **DOCTOR:** `doctor.live.e2e@clinic.test` (userId: `2420591f-3724-4b88-a8fa-663eb0bd260e`, doctorId: `214fec14-aa56-4ac1-ba9d-4768a31cba3a`, specialtyId: `18d8eede-8710-4ca7-93c0-90d16e82b999`, factorId: `6604fd2c-cabc-4e95-8485-646c0743d5f5`)
- **ADMIN:** `admin.live.e2e@clinic.test` (userId: `9319981f-bc7c-4c28-89e9-a262276be6c4`, factorId: `644d5501-2e0f-4572-bf4b-c492f661f430`)
- **Doctor Schedule:** Monday–Friday 08:00–17:00 (30-min recurring slots) configured in `doctor_service.doctor_schedules`.

---

## 2. Test Execution & Evidence Matrix

### Historical team claims — not verified against the current task revisions

The following rows were copied from the prior handoff. They identify reported work only;
the runs, client runtime, and exact revision pairing have not been independently reproduced.
Status in every row is therefore `REPORTED / UNVERIFIED` until new evidence is attached.

| Member / Role | Scope / Flow | Commits | Test Suites & Results | Status |
|---|---|---|---|---|
| **Member 1 (TV1)** | Gateway, Harness, Cross-Service Clinical Journey (Nhịp 0, 2, 3, 4) | `2df224c` | `live-openapi.mjs`: 18/18 reported<br>`run-m2-live-journey.mjs`: 44/44 reported<br>`openapi-contract-tests`: 104/104 reported | **REPORTED / UNVERIFIED** |
| **Member 2 (TV2)** | Auth, MFA, Session Lifecycle & Admin Step-Up (Flutter & Web) | `b6e5797`, `49d99e5` | Prior Web/Flutter/Auth counts reported; current default run skips live cases | **REPORTED / UNVERIFIED** |
| **Member 3 (TV3)** | Patient Booking & Staff Appointments (Flutter & Web) | `663ddfb` | Prior booking/staff flow counts reported; current default run skips live cases | **REPORTED / UNVERIFIED** |
| **Member 4 (TV4)** | Medical Records & Notifications (Web DOCTOR & Flutter PATIENT) | `d60327a`, `d284776` | Prior clinical runner/service counts reported; current default run skips live cases | **REPORTED / UNVERIFIED** |

---

## 3. Detailed Cross-Service Journey Verification (Nhịp 2)

The live journey runner executed the complete multi-role clinical journey via Gateway `http://127.0.0.1:8080` and verified persistent PostgreSQL database side effects at every transition:

### Step 1: Health & Readiness Check
- Gateway `http://127.0.0.1:8080/health` → `200 OK`
- All 5 services (`3001`, `3002`, `3003`, `3004`, `3005`) → `200 OK`

### Step 2: PATIENT Authentication
- `POST /api/v1/auth/login` via Gateway with PATIENT credentials.
- Result: `200 OK`, active session token returned, `state: "ACTIVE"`.
- **DB Side Effect:** Row verified in `user_service_test.user_service.sessions` with `status = 'ACTIVE'`.

### Step 3: PATIENT Slot Discovery
- `GET /api/v1/doctors/:id/available-slots?date=2026-11-18` via Gateway.
- Result: `200 OK`, returned available 30-minute booking slots based on real schedules and occupied slot calculations.

### Step 4: PATIENT Books Appointment with Idempotency-Key
- `POST /api/v1/appointments` with `Idempotency-Key: e2e-live-book-...`.
- Result: `201 Created`, appointment returned with `status: "PENDING"`.
- **DB Side Effect:** Verified row in `appointment_service_test.appointment_service.appointments` with `status = 'PENDING'`.
- **DB Side Effect:** Verified row in `appointment_service_test.appointment_service.appointment_status_history` with `to_status = 'PENDING'`.

### Step 5: Idempotent Replay on Booking
- Retried exact same `POST /api/v1/appointments` with identical payload and `Idempotency-Key`.
- Result: `200/201 OK`, returned same appointment ID.
- **DB Side Effect:** Verified `count(*) = 1` in `appointment_service.appointments` (zero duplicates created).

### Step 6: STAFF Authentication & MFA Elevation
- `POST /api/v1/auth/login` via Gateway with STAFF credentials → `200 OK`, `state: "PENDING_MFA"`.
- Unverified operational call (`GET /api/v1/appointments`) → `403 MFA_VERIFICATION_REQUIRED` (strictly blocked at Gateway).
- Created MFA challenge (`POST /api/v1/auth/mfa/challenges`) for `purpose: "STAFF_ADMIN_LOGIN"`.
- Verified TOTP code (`POST /api/v1/auth/mfa/verify`) → session elevated to `ACTIVE`.
- **DB Side Effect:** Verified `user_service.sessions` updated to `ACTIVE`.

### Step 7: STAFF Confirms Appointment
- `PATCH /api/v1/appointments/:id/confirm` via Gateway with `Idempotency-Key`.
- Result: `200 OK`, appointment `status: "CONFIRMED"`.
- **DB Side Effect:** `appointment_service.appointments` status updated to `CONFIRMED`.
- **DB Side Effect:** `appointment_service.appointment_status_history` logged transition to `CONFIRMED`.

### Step 8: STAFF Checks In Patient
- `PATCH /api/v1/appointments/:id/check-in` via Gateway with `Idempotency-Key`.
- Result: `200 OK`, appointment `status: "CHECKED_IN"`.
- **DB Side Effect:** `appointment_service.appointments` status updated to `CHECKED_IN`.
- **DB Side Effect:** `appointment_service.appointment_status_history` logged transition to `CHECKED_IN`.

### Step 9: Direct Appointment Completion Protection
- Attempted `PATCH /api/v1/appointments/:id/complete` by STAFF → `403 ACCESS_DENIED`.
- Attempted `PATCH /api/v1/appointments/:id/complete` by DOCTOR → `409 MEDICAL_RECORD_REQUIRED`.
- Confirmed that appointment completion can **only** occur via authenticated Medical Record outbox callback.

### Step 10: DOCTOR Authentication & Session Elevation
- `POST /api/v1/auth/login` via Gateway with DOCTOR credentials and TOTP challenge verification → session elevated to `ACTIVE`.

### Step 11: DOCTOR Requests Clinical Grant for Encounter
- Requested challenge for `purpose: "OPEN_CLINICAL_RECORDS"` for checked-in appointment.
- Verified TOTP code → received `proofId`.
- Issued clinical grant (`POST /api/v1/medical-records/access-grants`) for `accessMode: "CURRENT_ENCOUNTER"`.
- Result: `201 Created`, `grantId` issued with 15-minute TTL.
- **DB Side Effect:** Row verified in `medical_record_service_test.medical_record_service.clinical_grants`.

### Step 12: DOCTOR Creates DRAFT Medical Record
- `POST /api/v1/medical-records` with symptoms, diagnosis, treatmentPlan, and prescription items.
- Result: `201 Created`, record ID issued with `status: "DRAFT"`, `version: 1`.
- **DB Side Effect:** Row verified in `medical_record_service.medical_records` with `status = 'DRAFT'`.

### Step 13: PATIENT Privacy Boundary Enforcement
- PATIENT attempted `GET /api/v1/medical-records/:id` for the DRAFT record.
- Result: `404 Not Found` (draft records are never exposed to patients).

### Step 14: DOCTOR Obtains Finalization Context
- `POST /api/v1/medical-records/finalization-contexts` with record payload and `expectedVersion: 1`.
- Result: `201 Created`, returned `contextId` and SHA-256 `contentDigest`.
- **DB Side Effect:** Row verified in `medical_record_service.finalization_contexts` with matching SHA-256 digest.

### Step 15: DOCTOR Obtains Finalization TOTP Proof
- Requested challenge for `purpose: "FINALIZE_MEDICAL_RECORD"` binding `contextId`, `recordId`, and `contentDigest`.
- Verified TOTP code → received finalization `proofId`.

### Step 16: DOCTOR Finalizes Medical Record
- `POST /api/v1/medical-records/:id/finalize` with `contextId`, `verificationProofId`, `expectedVersion: 1`.
- Result: `200 OK`, record `status: "FINAL"`, `version: 2`.
- **DB Side Effect:** `medical_record_service.medical_records` status updated to `FINAL`, `version = 2`.
- **DB Side Effect:** Outbox events `appointment.complete` and `medical-record.created` inserted into `medical_record_service.outbox_events`.

### Step 17: Asynchronous Outbox Event Processing & Appointment Completion
- Outbox worker polled and delivered events to internal services:
  * `appointment.complete` delivered to Appointment Service `/complete-from-record`.
  * `medical-record.created` delivered to Notification Service `/internal/v1/notifications`.
- **DB Side Effect:** `medical_record_service.outbox_events` marked `SENT`.
- **DB Side Effect:** `appointment_service.appointments` transitioned to `COMPLETED`!
- **DB Side Effect:** `appointment_service.appointment_completions` mapped record ID to appointment ID.
- **DB Side Effect:** `appointment_service.appointment_status_history` recorded `to_status = 'COMPLETED'`.

### Step 18: PATIENT Retrieves Finalized Medical Record
- PATIENT called `GET /api/v1/medical-records/:id` via Gateway.
- Result: `200 OK`, returned complete medical record with `status: "FINAL"`, clinical notes, diagnosis, and prescription.

### Step 19: PATIENT Retrieves & Acknowledges Notification
- PATIENT called `GET /api/v1/notifications` via Gateway.
- Result: `200 OK`, notification for completed clinical encounter received.
- PATIENT called `PATCH /api/v1/notifications/:id/read` via Gateway.
- Result: `200 OK`, `readAt` timestamp populated.
- **DB Side Effect:** Verified `read_at` persisted in `notification_service_test.notification_service.notifications`.

---

## 4. Boundary & Failure Scenarios (Nhịp 3)

The following boundary conditions were asserted:
1. **Unauthenticated Request:** `GET /api/v1/appointments` without `Authorization` header → `401 AUTH_TOKEN_MISSING`.
2. **Internal Route Blocking:** Direct public call to `/internal/v1/auth/verify` via Gateway → `404/403` (strictly blocked by Gateway routing).
3. **Consumed Proof Replay:** Replaying an already consumed TOTP verification proof on finalization → `409 Conflict` (proof reuse prohibited).
4. **Double Finalization / Conflict:** Finalizing an already `FINAL` record → `409 Conflict` (`MEDICAL_RECORD_FINAL`).
5. **State Machine Integrity:** Attempting to cancel a `COMPLETED` appointment → `409/422` state machine rejection.

---

## 5. Platform Enhancements & Fixes During M2-INTEGRATION-006

1. **Gateway Session Cache Invalidation on MFA Elevation:**
   - *Problem:* Gateway previously cached verified identity even when `status === "PENDING_MFA"`, causing subsequent requests after MFA elevation to be blocked by stale cache.
   - *Fix:*
     * In `gateway/api-gateway/src/auth.ts`: restricted identity cache storage strictly to sessions with `identity.status === "ACTIVE"`.
     * In `gateway/api-gateway/src/app.ts`: added cache invalidation hook when `POST /api/v1/auth/mfa/verify` completes.
2. **Inter-Service Internal API Token Configuration:**
   - *Problem:* `DOCTOR_USER_INTERNAL_API_TOKEN` was identical to `DOCTOR_INTERNAL_API_TOKEN`, triggering distinct token check failure in doctor-service lookup. `NOTIFICATION_INTERNAL_API_TOKEN` was unconfigured in daemon environment.
   - *Fix:* Configured distinct 32-byte hex tokens across all services in `scripts/live-services-daemon.mjs`, enabling smooth outbox dispatch to Notification Service and Appointment Service.
3. **Medical Record Repository Update Filtering:**
   - Guarded update change parsing in `services/medical-record-service/src/repository.ts` to ignore undefined fields and safely construct audit log entries.

---

## 6. Definition of Done Checklist — current status

- [ ] All 5 backend services and API Gateway running live with disposable PostgreSQL connections.
- [ ] Isolated Auth project and synthetic accounts verified for the current run.
- [ ] Required cross-service journey passes through Gateway and persists in owning databases.
- [ ] Actual Next.js browser and Flutter emulator/device client flows pass; no mandatory flow skipped.
- [ ] Current revision SHAs, commands, exit codes, and redacted run artifacts are attached.
- [ ] Privacy boundaries, role boundaries, idempotency/replay, and failure cases verified on current revisions.
- [ ] Local commits only; no push or merge performed.

The checked counts and acceptance labels from the earlier report are historical claims and
are intentionally not carried as current completion evidence.
