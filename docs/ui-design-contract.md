# Health&Human UI Design Contract

> **Status:** Mandatory architecture/platform boundaries; visual design pending approval
> **Audience:** Team members and AI agents designing or implementing UI
> **Applies to:** Flutter Patient App and Next.js Clinic Management Web
> **Related contracts:** `docs/system-design.md` and `docs/api-contract.md`

> **Current milestone clarification:** Flutter serves `PATIENT` only; Next.js serves
> `DOCTOR`, `STAFF`, and `ADMIN`. Visual styling, navigation composition and component
> designs below are provisional guidance, not approved designs or current backend
> acceptance criteria. Do not infer visual approval from existing screens. Follow
> [agent rules](../.agents/rules.md) when implementing or coordinating changes.

## 1. Purpose and authority

This document is the shared source of truth for user experience, information architecture,
visual behavior, and frontend boundaries in Health&Human. Read it before producing mockups,
changing navigation, creating pages, or implementing frontend code.

When requirements conflict, use this priority order:

1. Security, privacy, and service ownership rules in `docs/system-design.md`.
2. Roles, state transitions, request/response shapes, and errors in `docs/api-contract.md`.
3. Platform and UI rules in this document.
4. Existing implementation patterns and visual details.

An agent may redesign the visual system and component composition, but must not silently change
business rules, API paths, role permissions, or platform ownership. Contract changes must be
reviewed before implementation.

## 2. Product definition

The product name is **Health&Human**. Do not introduce temporary brands such as Renata Limited,
Clinic Management, or unrelated clinic names in user-facing product identity.

Health&Human has exactly two frontend products:

| Product | Technology | Audience | Primary context |
|---|---|---|---|
| Patient App | Flutter, Android-first | `PATIENT` only | Personal healthcare tasks on a phone |
| Clinic Management Web | Next.js | `DOCTOR`, `STAFF`, restricted `ADMIN` utilities | Repeated operational work on desktop/tablet |

In product language, **clinic assistant** maps to the technical role `STAFF`. Do not create an
`ASSISTANT` role. The web is primarily for doctors and clinic assistants. `ADMIN` uses restricted
management and system-health pages in the same web application; there is no third frontend.

## 3. Non-negotiable architecture rules

All frontend business-data traffic follows:

```text
Flutter / Next.js -> API Gateway -> owning service -> owning database
```

- Frontends configure only the API Gateway base URL.
- Frontends never receive `DATABASE_URL`, internal service URLs, Supabase keys, or service-role keys.
- Frontends never query business tables or internal services directly.
- Supabase Auth integration belongs to User Service. Frontends use Gateway auth endpoints.
- Use the shared frontend API clients and session interfaces. Do not create a parallel fetch,
  authentication, token-storage, or error-envelope implementation inside a feature.
- Never hardcode actor IDs, roles, access tokens, patient IDs, doctor IDs, or successful API data
  in production UI.
- UI visibility is not authorization. Services must still enforce role and resource ownership.
- Every request must preserve the API error envelope and expose a useful, non-sensitive message.

## 4. Product experience principles

### 4.1 Shared principles

- Build the usable product, not a marketing landing page.
- Make the current task, current status, and next valid action immediately clear.
- Prefer familiar healthcare and operational terminology over creative labels.
- Display dates, time zones, appointment status, doctor identity, and patient identity explicitly.
- Design complete loading, empty, error, offline/timeout, disabled, success, and permission-denied states.
- Preserve user input when a request fails. Prevent duplicate submission while a request is pending.
- Confirm destructive or consequential actions such as cancellation, no-show, role change, and locking.
- Never imply success before the Gateway confirms success.
- Do not expose stack traces, internal URLs, tokens, database details, or unnecessary patient data.

### 4.2 Patient App character

The Patient App should feel calm, clear, trustworthy, and easy to use with one hand. It may be
warmer and more visual than the management web, but must remain a healthcare tool rather than a
decorative lifestyle app.

- Prioritize one primary action per screen.
- Use readable labels rather than unexplained icon-only navigation.
- Keep booking progress and appointment status visible.
- Use bottom navigation for the five stable destinations.
- Use bottom sheets only for short, focused tasks. Use a full screen for complex forms or records.
- Avoid dense clinical terminology unless it comes from an actual medical record.

### 4.3 Clinic Management Web character

The management web is a quiet, efficient operational workspace. It should optimize scanning,
comparison, queue management, and repeated actions.

- Use a stable application shell with persistent navigation on desktop.
- Prefer tables, lists, filters, status columns, and detail panels over promotional cards.
- Keep page headers compact. Do not use oversized hero sections or decorative dashboards.
- Keep high-frequency actions close to the relevant row or record.
- Make role-specific work queues the first useful screen after login.
- Preserve filters and selected date/page where practical when navigating to details and back.

## 5. Information architecture

### 5.1 Patient App navigation

The authenticated Patient App has five primary destinations:

| Destination | Purpose | Required capabilities |
|---|---|---|
| Doctors | Discover specialties and doctors | Search/filter, doctor details, schedule and available slots |
| Appointments | Manage personal appointments | All/pending/confirmed/completed views, details, permitted reschedule/cancel |
| Medical Records | Review personal visit history | Visit summary, diagnosis, treatment, basic prescription |
| Notifications | Review clinic updates | Confirmation, change, cancellation, reminder, result-ready messages |
| Profile | Manage personal information | Contact and patient profile, session logout |

Authentication and optional onboarding sit outside the authenticated shell. A booking journey starts
from specialty/doctor discovery, continues through date and slot selection, shows a final summary,
then submits once with an idempotency key.

### 5.2 Clinic Management Web navigation

The web navigation is role-filtered from one centralized route definition:

| Area | `DOCTOR` | `STAFF` | `ADMIN` | Purpose |
|---|:---:|:---:|:---:|---|
| Work overview | Yes | Yes | Limited | Today's workload and actionable exceptions |
| Appointments | Assigned schedule | Clinic queue | Oversight | Confirm, cancel, check in, no-show, complete where authorized |
| Patients | Appointment-scoped | Search | Search | Minimum patient information needed for the task |
| Doctors and schedules | Own schedule | Operational access | Manage | Doctors, specialties, shifts, breaks, available slots |
| Medical records | Assigned appointments | No clinical editing | No default clinical editing | Diagnosis, notes, treatment and prescription |
| Notifications | Relevant events | Relevant events | Operational visibility | Delivery and workflow feedback |
| Accounts and roles | No | No | Yes | User role/status management |
| System health | No | No | Yes | Basic service health, not infrastructure secrets |

Do not show unauthorized destinations and do not rely on hidden navigation as the security control.
Direct navigation must produce a clear unauthorized state or redirect according to the established
route-guard pattern.

## 6. Core workflows

### 6.1 Patient booking

1. Search or browse specialties and doctors.
2. Open a doctor profile with specialty, relevant introduction, and active status.
3. Select a date and an available slot returned by the API.
4. Review doctor, clinic date/time, and patient identity.
5. Submit once with a visible pending state and idempotency key.
6. Show the server-confirmed appointment status and the appropriate next action.

The UI must communicate that a displayed slot is not guaranteed until appointment creation succeeds.
For `APPOINTMENT_SLOT_UNAVAILABLE`, keep context and offer refreshed slots instead of a generic error.

### 6.2 Assistant daily operations

1. Open the current-day appointment queue.
2. Filter or search by patient, doctor, time, and status.
3. Confirm or cancel valid pending appointments.
4. Check in confirmed patients.
5. Mark eligible missed appointments as no-show.

Actions must follow server-provided state and permissions. Do not present arbitrary status dropdowns.

### 6.3 Doctor consultation

1. Open the doctor's assigned schedule.
2. Identify checked-in patients.
3. View only the patient information necessary for the assigned appointment.
4. Create or update the medical record and basic prescription.
5. Save successfully before completing the appointment.
6. Surface notification/outbox failures as recoverable system feedback, not lost clinical work.

### 6.4 Administration

Administration is a restricted utility, not the primary web experience. It covers user role/status,
doctor/specialty/schedule management, and basic system health. Clinical content must not become
editable by `ADMIN` merely because the account is administrative.

## 7. Appointment and system status presentation

Use backend status names as the semantic source of truth:

| Status | Vietnamese label | Visual intent |
|---|---|---|
| `PENDING` | Chờ xác nhận | Attention, neutral amber |
| `CONFIRMED` | Đã xác nhận | Positive blue/green |
| `CHECKED_IN` | Đã check-in | Active/in progress |
| `COMPLETED` | Hoàn thành | Stable success |
| `CANCELLED` | Đã hủy | Muted or destructive red where relevant |
| `NO_SHOW` | Không đến | Warning/destructive |

- Never use color alone; always show a text label.
- A status control must expose only valid transitions from `docs/api-contract.md`.
- Loading, degraded service, delivery failure, and validation error are system states, not appointment statuses.
- Use the same label and color semantics across Flutter and Next.js.

## 8. Visual system

Agents may evolve the visual design, but both products must share recognizable Health&Human identity.

### 8.1 Brand direction

- Product name: `Health&Human`.
- Primary identity may retain the existing healthcare blue (`#2D5BFF`) but must include neutral,
  success, warning, and danger families. Do not create a one-color blue/purple interface.
- Avoid decorative gradients, floating color blobs, bokeh, or purely atmospheric healthcare imagery.
- Use actual doctor/clinic/product content when imagery is required. Do not obscure inspectable content.
- Text and icons must meet accessible contrast against their backgrounds.

### 8.2 Tokens

Define tokens centrally rather than scattering literals:

- Color: canvas, surface, surface-subtle, border, text, text-muted, primary, success, warning, danger.
- Spacing: a consistent 4 px base scale.
- Typography: body, label, title, page title; no viewport-based font scaling and no negative letter spacing.
- Shape: web controls/cards should generally be 4-8 px radius; mobile controls may use 8-16 px where
  touch ergonomics benefit. Avoid pill shapes except chips, segmented filters, and statuses.
- Elevation: restrained; use borders and hierarchy before shadows.
- Motion: short and functional, with reduced-motion support on web where applicable.

Flutter tokens belong under `lib/core/theme/`. Web tokens belong in the shared stylesheet/design
system layer, not inside individual route files. A redesign should migrate repeated inline styles into
shared tokens/components without mixing business logic into shared packages.

### 8.3 Typography and language

- User-facing UI is Vietnamese unless a localization task explicitly changes this decision.
- Documentation, code identifiers, API fields, and tests remain English where practical.
- Vietnamese copy must include proper diacritics.
- Use plain clinic language. Errors should state what happened and what the user can do next.
- Keep compact panel/card headings proportional to their container; reserve large type for true page titles.

### 8.4 Icons and controls

- Use Material icons in Flutter and the project's selected icon library on web. Do not hand-draw SVGs
  when a standard icon exists.
- Use icon buttons for familiar commands and provide tooltips/semantic labels.
- Use segmented controls or tabs for exclusive views, checkboxes/toggles for binary settings,
  date/time controls for scheduling, and menus/selects for finite option sets.
- Buttons are for commands. Links are for navigation. Do not make a generic clickable `div`.
- Do not place cards inside cards or turn every page section into a floating card.

## 9. Responsive behavior

### Patient App

- Android phone is the primary target; support narrow screens without horizontal scrolling.
- Respect safe areas, keyboard insets, and a minimum touch target of 48 logical pixels.
- Fixed-format controls such as tabs, date selectors, and bottom navigation must use stable constraints.
- Long Vietnamese labels must wrap or adapt without overlap or layout shift.

### Clinic Management Web

- Desktop is primary, tablet is supported, and narrow screens must remain operable.
- Tables may switch to compact rows/details on narrow screens; never silently drop important fields/actions.
- Dense tables should use clear alignment, pagination, and complete empty/error states.
- Navigation may collapse responsively but role visibility and route behavior must remain unchanged.
- No element may overlap, clip critical text, or depend on hover as its only interaction.

## 10. Data, privacy, and safety

- Show the minimum patient information required for the current role and task.
- Do not show full insurance numbers in generic selectors or lists; mask or omit them unless necessary.
- Never place diagnosis, prescription, contact details, tokens, or IDs in analytics-style logs.
- Do not use real patient data in fixtures, screenshots, demos, or generated mockups.
- Medical records are not physically deleted from ordinary UI flows.
- Preserve audit-relevant author and timestamp information when the API provides it.
- Clearly distinguish clinical data from operational metadata.

## 11. State and error contract

Every data-backed page or component must cover:

1. Initial loading or skeleton state without layout collapse.
2. Empty state that describes the absence of data, not an error.
3. Structured validation errors near the relevant field.
4. Permission denied (`401`/`403`) with an appropriate login or navigation action.
5. Conflict (`409`), especially slot conflicts and invalid state transitions.
6. Rate limiting (`429`) without automatic rapid retry.
7. Upstream unavailable/timeout (`502`/`503`/`504`) with a manual retry action.
8. Success feedback that does not hide the resulting server state.

Do not automatically retry non-idempotent writes. Disable repeated submissions while pending. Preserve
the Gateway request ID in support/debug details without making it the primary user message.

## 12. Component and code ownership

- Shared components contain presentation and technical behavior, not domain business rules.
- Domain components stay under their feature module.
- Flutter domain modules live under `apps/patient-app/lib/features/<domain>`.
- Next.js domain modules live under `apps/clinic-management-web/src/features/<domain>` and route files
  under `apps/clinic-management-web/app/` should remain thin integration points.
- Shared shells, route registries, API clients, session interfaces, themes, and global tokens require
  review from the platform owner.
- Do not duplicate shells, session providers, API clients, status mappings, or pagination behavior.

Current integration points:

| Concern | Flutter | Next.js |
|---|---|---|
| Theme/tokens | `lib/core/theme/app_theme.dart` | `app/globals.css` |
| Navigation | `lib/app/app_routes.dart` | `src/lib/navigation/routes.ts` |
| Application shell | `lib/app/patient_shell.dart` | `src/components/app-shell.tsx` |
| API client | `lib/core/api/clinic_api_client.dart` | `src/lib/api/client.ts` |
| Session | `lib/core/session/` | `src/lib/session/` |
| Async states | `lib/shared/widgets/async_states.dart` | `src/components/states.tsx` |

## 13. Rules for AI design and implementation agents

Before changing UI, an agent must:

1. Read this document, `docs/api-contract.md`, and the relevant existing feature code.
2. State the target platform, role, workflow, affected routes, and API dependencies.
3. Reuse the existing API/session boundary and identify any contract gap before inventing data.
4. Inspect adjacent screens and shared tokens so the result is coherent across the product.

An agent must not:

- Create a new frontend, service, role, API path, status, or business workflow without approval.
- Turn the management web into a marketing site or the patient app into a static mockup.
- Put Supabase/database configuration in frontend code.
- Replace live API integration with permanent mock data.
- Grant access by hiding/showing buttons without backend authorization.
- Change shared navigation, theme, API client, or session behavior silently from a domain task.

For a visual redesign, the expected deliverables are:

1. Screen/route inventory and role matrix.
2. Primary user-flow diagrams or concise flow descriptions.
3. Shared design tokens and component inventory.
4. Responsive layouts for relevant phone, tablet, and desktop sizes.
5. Loading, empty, error, denied, and success states.
6. Implementation in the existing Flutter/Next.js structure.
7. Updated tests and screenshots for the affected viewports.

## 14. UI Definition of Done

A UI change is complete only when:

- [ ] It serves the correct platform and role from this contract.
- [ ] It calls only the API Gateway through the shared API client.
- [ ] It follows the API contract and valid state transitions.
- [ ] Loading, empty, error, denied, pending, and success behavior is implemented.
- [ ] Vietnamese copy is clear, correctly accented, and does not leak technical details.
- [ ] Keyboard, screen-reader semantics, focus, contrast, and touch targets are reasonable.
- [ ] Phone and desktop/tablet layouts relevant to the platform have been checked.
- [ ] Long labels and dynamic data do not overflow or overlap.
- [ ] Existing tests are updated and new behavior has focused tests.
- [ ] Flutter analyze/test or Next.js lint/test/build passes for the affected platform.
- [ ] Screenshots contain synthetic data only and show the actual implemented UI.
- [ ] Shared-shell or contract changes have the required owner review.

## 15. Prompt preamble for other agents

Use the following text at the start of any UI task assigned to another agent:

```text
You are working on Health&Human. Before designing or implementing UI, read:
1. docs/ui-design-contract.md
2. docs/api-contract.md
3. the relevant existing feature and shared shell/theme/API client code.

The Flutter Patient App is for PATIENT users. The Next.js Clinic Management Web is primarily for
DOCTOR and STAFF users, with restricted ADMIN utilities. All frontend business requests must go
through the API Gateway using the existing shared API client. Do not access Supabase, databases,
or internal services from frontend code. Do not invent roles, statuses, endpoints, or permissions.
Implement complete responsive, accessible loading/empty/error/denied/success states and preserve
Vietnamese user-facing copy with proper diacritics. Report contract gaps before changing behavior.
```
