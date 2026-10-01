# Health&Human Agent Rules

## 1. Architecture Comes First

Read this file before changing code, configuration, contracts, or migrations.

```text
Flutter Patient App ----\
                        API Gateway -> owning business service -> its own database
Next.js Management Web-/

Business service -> authenticated internal HTTP -> another business service
```

Responses return through the Gateway. There are exactly six backend services:
API Gateway, User, Doctor, Appointment, Medical Record, and Notification.
Backend uses the existing Express/TypeScript stack. Do not introduce extra services,
Kubernetes, RabbitMQ, multiple gateways, or a load balancer in the current milestone.

- Each of the five business services owns an independent PostgreSQL database in its
  own Supabase project, its schema, migrations, and repository. Gateway owns no database.
- No cross-service database access, JOINs, foreign keys, or shared ORM models.
  External IDs are logical references. Use internal APIs for foreign data.
- Supabase Auth belongs only to User Service. Gateway verifies access tokens through
  User Service and uses authoritative application roles/account status.
- Both frontends configure only the Gateway URL, including for authentication.
  Never put Supabase URLs/keys, database URLs, service URLs, or backend credentials there.
- Gateway owns prefix routing, authentication, CORS, rate limiting, request IDs and
  boundary error handling. Services own endpoints, validation, business authorization,
  persistence and OpenAPI. Adding a child endpoint does not require a new proxy route.
- Preserve full `/api/v1/...` paths and segment boundaries. `/doctors-other` must
  not match `/doctors`. Preserve method, query, body, required headers and status.
- Internal APIs use configured backend URLs and `/internal/v1/...`; never expose
  them through Gateway. Do not impersonate a user by inventing `X-Role: ADMIN/DOCTOR`.
- Gateway must strip/overwrite client identity headers. Receivers must establish
  trusted caller identity before consuming forwarded user context. Internal callers
  need the agreed service authentication and per-caller authorization policy.
- Current code still relies on private networking in several places. This is a known
  gap, not evidence that service authentication already exists. Coordinate its rollout
  across callers and receivers; never silently disable guards to restore compatibility.
- Production Compose does not publish business-service ports. Debug ports must bind
  to localhost. Network isolation supplements authentication; it does not grant roles.
- Keep `packages/` limited to technical helpers, types and configuration. No shared
  business logic or repositories. Keep prescriptions inside Medical Record Service.

## 2. Platform Boundary, Pending Visual Design

| Platform | Audience |
| --- | --- |
| Flutter Android Patient App | `PATIENT` only |
| Next.js Clinic Management Web | `DOCTOR`, `STAFF`, `ADMIN` |

Clinic assistant means `STAFF`; do not add an `ASSISTANT` role. There is no Patient Web,
staff mode in the patient app, or third frontend. ADMIN has administrative permissions,
not automatic permission to edit diagnoses. Services enforce access independently of UI.

The brand is **Health&Human**. Visual design is awaiting approval. Existing screens,
navigation, colors, component layouts and design proposals are not an approved visual
baseline. Do not undertake UI redesign during a backend task. Read
`docs/ui-design-contract.md` for context; its visual/navigation proposals remain provisional.
Preserve existing consumer compatibility or document and coordinate API changes.

## 3. Start Every Task With Evidence

### Team ownership

| Member | Backend ownership | Frontend ownership after visual design approval |
| --- | --- | --- |
| Member 1 | API Gateway, platform configuration, env/scripts, Compose, shared contracts and integration harness | Shared Flutter/Next.js shell, routing, API client and technical components only |
| Member 2 | User Service, Supabase Auth, accounts, profiles, roles and patient identity | Authentication, session, profile, account administration and patient lookup |
| Member 3 | Doctor Service and Appointment Service | Doctor, specialty, schedule, slot and booking flows on the applicable platform |
| Member 4 | Medical Record Service and Notification Service | Medical records, prescriptions and notifications on the applicable platform |

Ownership includes the domain database, repository, API, authorization, OpenAPI,
tests and, after design approval, the domain UI. Cross-domain work keeps one primary
owner and requires review from every provider or consumer owner it changes.

- Member 1 must not move domain business logic or domain screens into the platform layer.
- Member 2 owns user and patient identity; other services consume User internal APIs.
- Member 3 owns professional doctor data and the appointment state machine.
- Member 4 owns clinical record content, prescriptions, events and reminders.
- ADMIN permissions do not transfer Medical Record ownership to Member 2 or platform code.
- The current task registry is `~/Downloads/health-human-m2-backend-plan.md` on each
  member's machine. Locate and read that file before starting an assigned M2 task.
  Because it is outside the repository, every assignment prompt must still include the
  member, task ID, branch, base SHA, owned paths, dependencies and checklist excerpt.
- An agent must not infer ownership of another member's domain from files in its branch.
  Report cross-owner dependencies and coordinate contracts instead of silently implementing them.

1. Read `docs/api-contract.md`, relevant sections of `docs/system-design.md`, this file,
   and the assigned task/PR. Inspect the real implementation and tests.
2. Report the current branch, base commit, dirty files, task ID, owned paths and dependencies.
3. Inspect existing feature branches before recreating work. A remote-tracking branch
   is only the last fetched snapshot; do not claim it is current without checking.
4. Record contract conflicts instead of selecting whichever version bypasses a guard.
   Known stale sections of the API contract must be reconciled with the owners.
5. Never print populated `.env`, access tokens, passwords, connection URLs or patient data.
   Use synthetic fixtures; live writes require an agreed disposable test dataset.

## 4. Branches and Shared Files

New branch format: `<type>/m2-<domain>-<NNN>-<slug>`.
Allowed types: `docs`, `feat`, `fix`, `test`, `chore`.
Allowed domains: `platform`, `user`, `doctor`, `booking`, `record`, `notify`, `integration`.
`NNN` is a three-digit task number; slug is lowercase ASCII kebab-case.

Example: `feat/m2-booking-001-postgres-and-slot-constraints`.
Task ID: `M2-BOOKING-001`. Preserve existing PR branch names until they merge; do not
rename or replace an active branch just to match the new convention.

- One branch/PR per independently reviewable task. No direct commits to `main`.
- Start independent tasks from updated `main`. A dependent branch may start from its
  prerequisite branch, but must declare its base, PR dependency and merge order.
- One agent per worktree/branch. Never switch another agent's checkout or overwrite
  changes you did not make. Do not force-push shared branches.
- Gateway, root scripts, lockfile, Compose, shared types and contracts are shared files.
  Declare changes before editing; the platform owner reviews these changes.
- Service endpoint ownership remains local: routine child endpoints do not wait for
  someone to add Gateway routes. Contract edits travel with the service PR.
- Avoid parallel edits to the same service entrypoint/repository/schema. Use stacked
  tasks or small coordinated commits when authentication changes span services.
- Merge prerequisites first, update dependent branches, resolve conflicts by preserving
  both behaviors, and rerun relevant tests on the resulting tree.

## 5. Backend Completion Rules

- Production repositories must persist to the owning PostgreSQL database. In-memory
  implementations are test fixtures, not completed persistence.
- Protect appointment creation and rescheduling with database constraints/transactions.
  Enforce ownership, valid state transitions and time intervals at the service boundary.
- Idempotency must be scoped to actor/operation with a request fingerprint; mismatched
  reuse returns `409`. Never return another actor's appointment for a shared key.
- Store appointment changes and pending events atomically. Retry outbox delivery with
  a stable event ID. Consumers deduplicate every side effect, including reminders.
- Do not automatically retry unsafe writes. Dependency outages must produce bounded
  timeouts and standardized errors, never fake success or permanent loss of an event.
- OpenAPI must document parameters, bodies, success/error schemas and authentication,
  not only operation titles. Keep pagination and error envelopes consistent.
- Migrations need reproducible commands and version tracking. Verify them on a clean
  test database and an upgrade path without destroying existing data.
- Use readiness checks that exercise required persistence; redact logs and propagate
  request IDs. Keep public responses free of SQL, credentials and stack traces.

## 6. Evidence Before Handoff

- [ ] Assigned scope, branch base and dependent PRs documented.
- [ ] Service ownership, caller trust, role and resource checks verified.
- [ ] Contract/OpenAPI/env examples updated without secrets.
- [ ] Relevant lint, build and tests executed with commands and actual outcomes recorded.
- [ ] Required PostgreSQL integration tests use real constraints/transactions.
- [ ] Timeout, invalid input, wrong role/owner, retries and duplicate requests covered.
- [ ] Shared-file changes reviewed by owners; dependent consumers remain compatible.
- [ ] No unrelated changes, generated output, secrets or real patient fixtures committed.
- [ ] Live database checks, mock tests and untested paths reported separately.

Passing mocked tests does not establish end-to-end acceptance. A task is implemented,
reviewed, merged and accepted at distinct points. Report the exact achieved state and
commit; never tick acceptance solely because code or a migration file exists.
