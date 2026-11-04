# Health&Human UI Design Contract v2.0

> **Status:** APPROVED — supersedes v1.x  
> **Authority:** This document is the single source of truth for all visual, layout, interaction, and UX decisions across the Health&Human platform. AI agents and developers must read this document before writing any UI code.  
> **Last revised:** 2026-11-02  
> **Platforms:** Flutter Android Patient App · Next.js Clinic Management Web

---

## Table of Contents

1. [Purpose and Authority](#1-purpose-and-authority)
2. [Product Definition](#2-product-definition)
3. [Non-Negotiable Architecture Rules](#3-non-negotiable-architecture-rules)
4. [Platform Character and Experience Principles](#4-platform-character-and-experience-principles)
5. [Anti-Slop Enforcement Rules](#5-anti-slop-enforcement-rules)
6. [Design Token System](#6-design-token-system)
7. [Component Library Specification](#7-component-library-specification)
8. [Typography Specification](#8-typography-specification)
9. [Spacing and Layout Specification](#9-spacing-and-layout-specification)
10. [Status and Color Semantics](#10-status-and-color-semantics)
11. [State Design Requirements](#11-state-design-requirements)
12. [Information Architecture and Navigation](#12-information-architecture-and-navigation)
13. [Core Workflow Specifications](#13-core-workflow-specifications)
14. [Page Specifications](#14-page-specifications)
   - [Web render and loading strategy](web-rendering-contract.md)
15. [Accessibility Requirements](#15-accessibility-requirements)
16. [Responsive Behavior](#16-responsive-behavior)
17. [Data, Privacy, and Safety](#17-data-and-privacy-rules)
18. [Component and Code Ownership](#18-component-and-code-ownership)
19. [UI Definition of Done](#19-ui-definition-of-done)
20. [Agent Workflow Rules](#20-agent-workflow-rules)
21. [Agent Prompt Preamble](#21-agent-prompt-preamble)

---

## 1. Purpose and Authority

This contract governs the visual design, interaction patterns, UX flows, and code structure for the Health&Human clinic appointment booking system. It is derived from the approved Anima/Figma design board and verified against the actual `globals.css` token system and `app_theme.dart` color constants.

**Conflict resolution hierarchy (highest to lowest):**

1. This document (`docs/ui-design-contract.md`)
2. Verified code constants in `app/globals.css` and `apps/patient-app/lib/core/theme/app_theme.dart`
3. `docs/api-contract.md` for data shapes and state transitions
4. `.agents/rules.md` for team ownership and branching

When any other document, skill, or agent instruction conflicts with this contract, this contract wins. Agents must report the conflict and not resolve it silently.

---

## 2. Product Definition

Health&Human is a two-platform clinical appointment system:

| Platform | Framework | Primary users | Purpose |
|---|---|---|---|
| Clinic Management Web | Next.js (TypeScript) | DOCTOR, STAFF, ADMIN | Daily clinical operations: scheduling, confirmation, check-in, medical records |
| Patient App | Flutter (Dart, Android) | PATIENT | Appointment booking, record review, notification |

**Roles are strictly assigned to platforms.** PATIENT uses only the Flutter app. DOCTOR, STAFF, and ADMIN use only the Next.js web. No role-crossing is permitted.

---

## 3. Non-Negotiable Architecture Rules

These rules apply to all UI code and cannot be waived:

1. **All API traffic flows:** Frontend → API Gateway → owning microservice → its own database. No direct service-to-service calls from frontend.
2. **Supabase Auth belongs to User Service only.** No frontend code configures, imports, or calls Supabase Auth directly.
3. **No frontend database access.** No Supabase client, Prisma, or direct SQL from any frontend module.
4. **Role enforcement is server-side.** Hiding or showing buttons in the UI is never a security control. Server must reject unauthorized actions.
5. **No cross-service database access** from frontend (each service owns its own data).
6. **Idempotency keys** are required for appointment creation submissions to prevent double-booking on retry.

---

## 4. Platform Character and Experience Principles

### 4.1 Health&Human brand identity

The brand is **clinical, trustworthy, efficient, and warm** — not cold, technical, or corporate SaaS. The palette is Royal Blue (`#2D5BFF`) over clean white surfaces with slate/grey neutrals. This is the medical context of an actual clinic, not a tech startup landing page.

**What this is not:** A purple-gradient SaaS dashboard. A lifestyle wellness app. A glassmorphism showcase. A generic admin panel template.

### 4.2 Patient App character

The Patient App must feel calm, clear, and easy to use one-handed. It may be slightly warmer and more visual than the web, but must remain a healthcare tool.

- One primary action per screen.
- Readable Vietnamese labels on all navigation items — no icon-only navigation.
- Booking progress and appointment status always visible.
- Bottom navigation for five stable primary destinations.
- Bottom sheets only for short, focused tasks. Full screens for complex forms.
- Avoid dense clinical terminology unless it comes from an actual medical record.

### 4.3 Clinic Management Web character

The management web is a quiet, efficient operational workspace optimised for scanning, comparison, queue management, and repeated actions.

- Stable application shell with persistent left sidebar on desktop.
- Tables, lists, filters, status columns, and detail panels over promotional cards.
- Compact page headers. No oversized hero sections. No decorative dashboards.
- High-frequency actions close to the relevant row or record.
- Role-specific work queues as the first useful screen after login.
- Preserve filters and selected date/page when navigating to detail views and back.

---

## 5. Anti-Slop Enforcement Rules

This section explicitly rejects generic AI-generated UI patterns. Every rule below is **unconditionally enforced** unless the contract explicitly permits an exception.

### 5.1 Forbidden color patterns

| Pattern | Reason | What to do instead |
|---|---|---|
| Blue-to-purple, blue-to-cyan, or purple-to-pink gradient as primary color treatment | Training-data default; no brand identity | Use `--brand: #2D5BFF` solid or `--primary-light` tints |
| Hardcoded hex values in JSX, TSX, or Dart (`#0F766E`, `#6366F1`, `#cbd5e1`, `#b42318`) | Bypasses token system, creates visual inconsistency | Always use CSS variables or `ClinicColors.*` constants |
| Indigo-500 (`#6366F1`) as avatar or icon accent color | AI-default tell; not the brand | Use `ClinicColors.primary` (`#2D5BFF`) + `ClinicColors.primarySoft` (`#E9EEFF`) |
| Off-brand teal (`#0F766E`) for submit buttons | Not in design token system | Use `Button` component `variant="primary"` |
| Glassmorphism (`backdrop-filter: blur()`) applied to nav, cards, modals, or sidebar simultaneously | Flattens visual hierarchy | Use solid surface tokens; glass only as an accent on ≤1 element |
| Glow effects applied to multiple elements | Dilutes focal point | Reserve for ≤1 element where attention is intentional |

### 5.2 Forbidden layout patterns

| Pattern | Reason | What to do instead |
|---|---|---|
| Default dashboard shell (left sidebar + 4 stat cards + chart + table chosen before understanding the task) | Generic template, not task-derived | Name the user's decision on this screen; build hierarchy from that |
| Fake statistics or vanity metric cards (invented numbers, fabricated `+12% this week` deltas) | Decoration masquerading as data | Wire to real API data or show honest empty state |
| Four uniform metric cards as the entire dashboard | Flattens hierarchy; unrelated metrics look equal | Show the one metric that matters most; secondary metrics as text list |
| Repeated card-based layouts for operationally unrelated content | Template rhythm, not content rhythm | Use tables, lists, and panels for operational data |
| Bento grid mosaic (differently-sized cards filling space like a tiled dashboard) | AI default landing layout | Use if and only if content genuinely varies in size and importance |
| 4-column footer template | Template sections without content | Use what the product actually links to |

### 5.3 Forbidden typography patterns

| Pattern | Reason | What to do instead |
|---|---|---|
| Importing display fonts or swapping Inter for decorative alternatives | Invents a new visual direction | Web uses `Inter` (weights 400, 500, 600, 700); Flutter uses `Roboto` (system Material) |
| Uppercase section labels with extreme letter-spacing ("HOW IT WORKS") | AI typographic default | Use sentence case with Inter weight 600 |
| Large monospace headings as aesthetic rather than code display | Developer-tool tell | Inter only for headings in clinical UI |

### 5.4 Forbidden decoration patterns

| Pattern | Reason | What to do instead |
|---|---|---|
| Sparkle/star/orb icons as section decorations | Generic AI icon vocabulary | Use icons relevant to the specific function |
| `→` arrow on every button as decoration | Pattern becomes noise when universal | Add directional arrows only when direction is semantically meaningful |
| Decorative colored left-edge stripe on cards with no state meaning | Color without information | Left-edge accents only when encoding real state (warning, active, new) |
| Undraw/Storyset-style blob illustrations with no product connection | Decorative space-fill | Real UI screenshots or purposeful medical context illustrations |
| Excessive shadows on every component | Elevation becomes meaningless | Shadows as elevation markers only; most elements sit flat |

### 5.5 Forbidden UX patterns

| Pattern | Reason | What to do instead |
|---|---|---|
| Relying on color alone to communicate appointment status | WCAG 1.4.1; color-blind users cannot distinguish | Always pair color with text badge/label |
| Toast-only validation errors that disappear | User cannot correct errors they missed | Inline validation near the relevant field; toast as supplemental only |
| Automatic rapid retry of non-idempotent writes | Creates duplicate records | Manual retry after explicit user action |
| Wiping form state on API failure | Forces user to re-enter all data | Preserve all input across failed calls |
| Non-functional navigation items or buttons with no behavior | Breaks trust | Every interactive element has real behavior or a visible "Sắp ra mắt" label |
| Generic "No data" empty states | Provides no actionable information | Name the cause and provide one next action |
| Animations, pulses, or loops without a UX purpose | Noise, not communication | Motion only when guiding attention to a meaningful moment |

---

## 6. Design Token System

All styling must consume these tokens. Creating new CSS custom properties or Dart constants without updating this contract is forbidden.

### 6.1 Color tokens

| Token Name | CSS Variable | Flutter Constant | Value | Usage |
|---|---|---|---|---|
| **Primary / Brand** | `--brand` / `--primary` | `ClinicColors.primary` | `#2D5BFF` | Primary buttons, active nav, focus rings, brand badges |
| **Primary Dark** | `--brand-dark` | `ClinicColors.primaryDark` | `#1E4FE0` | Primary button hover/pressed state |
| **Primary Soft** | `--brand-light` / `--primary-light` | `ClinicColors.primarySoft` | `#E9EEFF` | Active nav background, avatar background, soft chip pill |
| **Canvas** | `--canvas` | `ClinicColors.scaffold` | `#F5F7FA` | Page/scaffold background |
| **Surface** | `--surface` | `ClinicColors.card` | `#FFFFFF` | Card, sidebar, modal background |
| **Surface Subtle** | `--surface-subtle` | `ClinicColors.surfaceSubtle` | `#EEF2F7` | Read-only inputs, table header rows, switch track |
| **Border / Line** | `--line` | `ClinicColors.border` | `#D9E0EA` | Card borders, dividers, input borders |
| **Ink (Text)** | `--ink` | `ClinicColors.ink` | `#0F172A` | Headlines, body copy, active labels |
| **Muted** | `--muted` | `ClinicColors.muted` | `#5A6577` | Secondary captions, subtext, timestamps |
| **Muted Light** | `--muted-light` | `ClinicColors.mutedLight` | `#94A3B8` | Placeholder text, disabled labels |
| **Success** | `--success` | `ClinicColors.success` | `#15803D` | Completed status, positive badges |
| **Success Soft** | `--success-light` | `ClinicColors.successLight` | `#E3F6E9` | Success chip background |
| **Warning** | `--warning` | `ClinicColors.warning` | `#B45309` | Pending status, warning text |
| **Warning Soft** | `--warning-light` | `ClinicColors.warningLight` | `#FEF3C7` | Warning chip background |
| **Danger** | `--danger` | `ClinicColors.danger` | `#B91C1C` | Cancelled status, destructive actions, error text |
| **Danger Soft** | `--danger-light` | `ClinicColors.dangerLight` | `#FEE2E2` | Danger/error chip background |
| **Info** | `--info` | `ClinicColors.info` | `#0284C7` | CHECKED_IN status, informational badges |
| **Info Soft** | (web: `#F0F9FF`) | `ClinicColors.infoLight` | `#F0F9FF` | Info chip background |

**Rule:** Never use a hex value literal in JSX/TSX inline styles or Dart widget constructors. Always reference the CSS variable or the `ClinicColors` constant.

### 6.2 Border radius tokens

| Token | Web value | Flutter value | Applied to |
|---|---|---|---|
| `--radius-sm` | `4px` | `4.0` | Badges, tags, tight labels |
| `--radius-md` | `6px` | `6.0` | Web inputs, buttons, section cards |
| `--radius-lg` | `8px` | `8.0` | Web modal dialogs, panels |
| `--radius-full` | `999px` | `999.0` | Status chips, pill badges only |
| Mobile card radius | — | `12.0` | Flutter cards, bottom sheets, mobile inputs |
| Mobile input radius | — | `12.0` | Flutter `TextField`, `TextFormField` |
| Mobile button radius | — | `12.0` | Flutter `FilledButton`, `OutlinedButton` |

**Correction from v1.x:** The Flutter theme currently applies `BorderRadius.circular(20)` to cards and `BorderRadius.circular(24)` to inputs and buttons. These are **incorrect** values that produce excessively pill-shaped controls inconsistent with the clinical identity. The approved mobile radius for cards, inputs, and primary buttons is **12px**, not 20px or 24px. Future implementations must use `12.0`.

### 6.3 Shadow tokens

| Token | Web value | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.08)` | Subtle card lift; default elevated surface |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.10)` | Dropdown menus, popovers |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.12)` | Modals, side drawers |

**Rule:** Shadow is an elevation marker only. Most surface elements sit flat (`elevation: 0`). Apply `--shadow-sm` only to surfaces that must visually lift above the page. Do not apply shadow to every card by default.

---

## 7. Component Library Specification

### 7.1 Next.js Web (clinic-management-web)

All shared UI primitives live in `apps/clinic-management-web/src/components/ui/`. Domain-specific components live under `src/features/<domain>/`. Route-level files in `app/` are thin integration points only.

| Component | File | Variants / Props |
|---|---|---|
| `Button` | `ui/button.tsx` | `variant`: primary, secondary, outline, danger, ghost; `size`: sm, md, lg; `loading`: boolean; `disabled`: boolean |
| `Input` | `ui/input.tsx` | Standard text input with label, error state, helper text |
| `Modal` | `ui/modal.tsx` | Accessible dialog with focus trap and Escape-key close |
| `ConfirmModal` | `ui/confirm-modal.tsx` | Destructive action confirmation with explicit cancel/confirm |
| `Alert` | `ui/alert.tsx` | `variant`: success, warning, danger, info |
| `Badge` | `ui/badge.tsx` | Status chip display; maps status strings to color pairs (see §10) |
| `Skeleton` | `ui/skeleton.tsx` | Loading skeleton blocks matching the target layout |
| `Pagination` | `ui/pagination.tsx` | Standard paginated list navigation |

**Rules for web components:**
- Never create a raw `<button>` or `<input>` in feature pages. Always use the design system component.
- Never apply inline `style={}` for color, border, or spacing overrides. Use the component variants.
- Never create duplicate button/modal/alert components in a feature directory.
- `ConfirmModal` is mandatory for: appointment cancellation, check-in action, no-show marking, completing consultation, patient deletion, user role change.

### 7.2 Flutter Patient App

Shared presentation primitives live in `apps/patient-app/lib/shared/widgets/`. Domain-specific widgets live under `lib/features/<domain>/widgets/`.

| Widget | File | Notes |
|---|---|---|
| `AppErrorState` | `shared/widgets/async_states.dart` | Full-screen error with retry action |
| `AppLoadingState` | `shared/widgets/async_states.dart` | Full-screen loading / skeleton |
| `AppEmptyState` | `shared/widgets/async_states.dart` | Empty state with CTA |
| Status chip | `features/appointments/widgets/status_chip.dart` | Must cover all 6 statuses (see §10) |
| Appointment card | `features/appointments/widgets/appointment_card.dart` | Must use `ClinicColors` only |

**Rules for Flutter widgets:**
- All color references must use `ClinicColors.*` constants. Never use `Color(0xFF______)` literals inline in widget files.
- Card `borderRadius` must be `BorderRadius.circular(12)` — not 16, 20, or 24.
- Input `borderRadius` must be `BorderRadius.circular(12)` — not 24.
- Button `borderRadius` must be `BorderRadius.circular(12)` for primary actions — not 24.
- Touch targets must be at minimum `48×48 logical pixels`. Use `SizedBox`, `ConstrainedBox`, or `InkWell` with explicit minimum height.
- Avatar icon containers must use `ClinicColors.primarySoft` background with `ClinicColors.primary` icon — not indigo-500 (`0xFF6366F1`).

---

## 8. Typography Specification

Font stack: **Inter** (web) · **Roboto** (Flutter, Material3 default)

| Context | Size | Weight | Line-height | Color |
|---|---|---|---|---|
| Web page title | 24px | 600 | 32px | `--ink` |
| Web section title | 18px | 600 | 28px | `--ink` |
| Web body | 14px | 400 | 20px | `--ink` |
| Web label / meta | 12–13px | 500 | 16–18px | `--muted` |
| Web caption | 11px | 400 | 16px | `--muted-light` |
| Mobile page title | 22px | 700 | 30px | `ClinicColors.ink` |
| Mobile section title | 17px | 600 | 24px | `ClinicColors.ink` |
| Mobile body | 15px | 400 | 22px | `ClinicColors.ink` |
| Mobile label | 13px | 500 | 18px | `ClinicColors.muted` |

**Rules:**
- Never import display fonts, serif fonts, or substitute typefaces.
- Never use uppercase letter-spacing as a heading style (e.g., `letter-spacing: 0.1em; text-transform: uppercase`).
- Use sentence case for section headings in Vietnamese.
- `fontWeight: w800` and `letterSpacing: -0.5` is permitted only for the top-level screen headline (`headlineSmall` in Flutter's `textTheme`).
- Web navigation labels: 13px, weight 500, `--ink` for inactive, `--brand` for active.

---

## 9. Spacing and Layout Specification

### 9.1 Spacing scale

All margins, paddings, and gaps must be multiples of 4px:

| Name | Value |
|---|---|
| space-1 | 4px |
| space-2 | 8px |
| space-3 | 12px |
| space-4 | 16px |
| space-5 | 20px |
| space-6 | 24px |
| space-8 | 32px |
| space-10 | 40px |
| space-12 | 48px |

No arbitrary pixel values outside this scale (e.g., 7px, 15px, 22px).

### 9.2 Web application shell

| Element | Specification |
|---|---|
| Sidebar width | 232px fixed |
| Sidebar background | `--surface` (`#FFFFFF`) with right border `1px solid --line` |
| Sidebar logo area | Health&Human logo (32×32px) + brand name (16px, weight 600, `--ink`) |
| Nav item height | 40px (`h-10`), radius `--radius-md` (6px), padding `0 12px` |
| Nav active state | Background `--primary-light` (`#E9EEFF`), text + icon `--brand` (`#2D5BFF`) |
| Sidebar profile box | Bottom of sidebar; background `--primary-light`; avatar 36×36px circle, initials bold `--brand`; name 13px bold `--ink`; role 12px `--muted`; logout button |
| Top bar height | 56px (`h-14`); background `--surface`; bottom border `1px solid --line`; padding `0 24px` |
| Top bar content | Real-time date/time in Vietnamese locale (see §13.4); notification popover slot |
| Page content padding | 24px horizontal, 24px vertical |

### 9.3 Patient App layout

| Element | Specification |
|---|---|
| Scaffold background | `ClinicColors.scaffold` (`#F5F7FA`) |
| Card background | `ClinicColors.card` (`#FFFFFF`) with border `ClinicColors.border` |
| Card radius | `BorderRadius.circular(12)` |
| Card shadow | `BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 8, offset: Offset(0, 2))` |
| Bottom navigation height | 64px (NavigationBar) |
| Bottom navigation background | `Colors.white` |
| Bottom nav indicator color | `ClinicColors.primary.withOpacity(0.12)` |
| AppBar | Transparent, elevation 0, centerTitle false |
| Primary button height | minimum 48px; width full (horizontal) or auto |
| Primary button radius | `BorderRadius.circular(12)` |
| Input height | minimum 48px; radius `BorderRadius.circular(12)` |

---

## 10. Status and Color Semantics

Use backend status values as the semantic source of truth. The same labels and color pairs must be used consistently across both platforms.

| Status | Vietnamese label | Background color | Text/icon color | Token pair |
|---|---|---|---|---|
| `PENDING` | Chờ xác nhận | `--warning-light` / `ClinicColors.warningLight` | `--warning` / `ClinicColors.warning` | Amber neutral |
| `CONFIRMED` | Đã xác nhận | `--primary-light` / `ClinicColors.primarySoft` | `--brand` / `ClinicColors.primary` | Brand blue positive |
| `CHECKED_IN` | Đã check-in | `#F0F9FF` / `ClinicColors.infoLight` | `--info` / `ClinicColors.info` (`#0284C7`) | Sky blue active |
| `COMPLETED` | Hoàn thành | `--success-light` / `ClinicColors.successLight` | `--success` / `ClinicColors.success` | Green stable |
| `CANCELLED` | Đã hủy | `--danger-light` / `ClinicColors.dangerLight` | `--danger` / `ClinicColors.danger` | Red destructive |
| `NO_SHOW` | Không đến | `--danger-light` / `ClinicColors.dangerLight` | `--danger` / `ClinicColors.danger` | Red warning |

**Critical correction from v1.x:** The Flutter `StatusChip` widget was missing explicit background and foreground color mappings for `CHECKED_IN` and `NO_SHOW`, causing them to fall back to grey. This is a bug. All 6 statuses must have explicit color pairs in `status_chip.dart`.

**Rules:**
- Never use color alone to communicate status — always pair with a text badge label.
- A status control must expose only valid transitions per `docs/api-contract.md`.
- Loading, degraded service, delivery failure, and validation error are system states, not appointment statuses.
- Slot display on the booking calendar must clearly distinguish: `available` (primary tint, bookable), `occupied` (muted/strikethrough, not bookable), `past` (surface-subtle, not bookable), `locked/unavailable` (disabled, not bookable).

---

## 11. State Design Requirements

Every data-backed page or component must implement all applicable states from this inventory. A surface is incomplete until every applicable state is designed. The happy-path populated state is never sufficient on its own.

### 11.1 Required state inventory

| State | What it must communicate | Do not mistake for |
|---|---|---|
| **Loading / Skeleton** | Something is loading; layout matches the target content shape | Empty state (Nielsen H1: user must know which state they are in) |
| **Empty (first-run)** | Why it is empty; the single next action to fill it; what this screen is for | A hidden section, a blank, or "No data" text only |
| **Empty (filtered)** | The active filter produced no results; how to clear or change the filter | A system error |
| **Partial / Streaming** | Data is arriving; more is coming; do not show a success state yet | Loading (something is present) or empty (nothing is there) |
| **Error** | What failed (API call, permission, network); what the user can do next (retry, navigate, contact support) | A stuck spinner or a generic "Something went wrong" |
| **Permission Denied** | User lacks authorization; appropriate redirect or login action | A generic error |
| **Conflict (409)** | Slot unavailable / invalid state transition; offer alternative (refreshed slots, next step) | A generic error |
| **Rate Limited (429)** | Request was throttled; manual retry after a delay | An application error |
| **Service Unavailable (502/503/504)** | Upstream unavailable; manual retry action; no automatic rapid retry | A permanent error |
| **Success** | The resulting server state (not just a toast); next action is clear | An empty page after a write |
| **Offline / Stale** | Network is unavailable or data is from cache; clearly labelled as stale | Normal populated state silently lying with old data |

### 11.2 State implementation rules

- **Skeleton states** must match the layout of the populated state (column count, element sizes) — do not use a generic spinner for a complex table page.
- **Empty states** must include: an icon or illustration relevant to the content type, a heading explaining the absence, one primary CTA action.
- **Error states** must include: a clear description of what failed, a retry button where appropriate, and a navigation escape if retry is not useful.
- **Do not automatically retry non-idempotent writes** after a failure.
- **Disable the submit button** while a request is in-flight (prevent double-submission).
- **Preserve all user inputs** during API failures — never wipe a form on error.
- **Preserve the API Gateway request ID** in support/debug details, not in the primary error message shown to users.

---

## 12. Information Architecture and Navigation

### 12.1 Patient App navigation (bottom bar, 5 destinations)

| Destination | Route | Purpose |
|---|---|---|
| Bác sĩ (Doctors) | `/doctors` | Browse specialties and doctors; begin booking |
| Lịch hẹn (Appointments) | `/appointments` | View and manage personal appointments |
| Hồ sơ (Records) | `/records` | Personal visit history and medical records |
| Thông báo (Notifications) | `/notifications` | Confirmation, change, cancellation, reminder messages |
| Hồ sơ cá nhân (Profile) | `/profile` | Contact info, patient profile, sign out |

Authentication and onboarding sit outside the authenticated shell. Booking starts from Doctors/specialties discovery.

### 12.2 Clinic Management Web navigation (role-filtered sidebar)

| Route | DOCTOR | STAFF | ADMIN | Purpose |
|---|:---:|:---:|:---:|---|
| Work overview / Dashboard | ✓ | ✓ | Limited | Today's actionable workload and exceptions |
| Appointments | Assigned schedule | Clinic queue | Oversight | Confirm, cancel, check-in, no-show, complete per authorization |
| Patients | Appointment-scoped | Search | Search | Minimum patient info for the current task |
| Doctors & Schedules | Own schedule | Operational | Manage | Doctors, specialties, shifts, breaks, available slots |
| Medical Records | Assigned appointments | — | — | Diagnosis, notes, treatment, prescription |
| Notifications | Relevant events | Relevant events | Operational | Delivery and workflow feedback |
| Users & Roles | — | — | ✓ | Role/status management |
| System Health | — | — | ✓ | Basic service health (no infrastructure secrets) |

- Do not show unauthorized destinations.
- Never rely on hidden navigation as the security control.
- Direct navigation to unauthorized routes must produce a clear unauthorized state or redirect per the established route-guard pattern.

---

## 13. Core Workflow Specifications

### 13.1 Patient booking flow (≤5 steps)

1. Browse or search specialties → select doctor → view doctor profile (specialty, introduction, active status).
2. Select date → select available time slot returned by API.
3. Review summary (doctor, date/time in full Vietnamese format, patient identity).
4. Submit once with visible pending state and idempotency key.
5. Display the server-confirmed appointment status and the appropriate next action.

**Rules:**
- A displayed slot is not guaranteed until appointment creation succeeds. State this clearly on the summary screen.
- For `APPOINTMENT_SLOT_UNAVAILABLE`, keep the user's context and offer refreshed slots — never show a generic error and clear all selections.
- Slot picker must visually distinguish: available, occupied, past, and locked slots.
- The booking flow is a minimum 3-step flow: doctor selection → slot selection → confirmation. Never collapse into a single form.

### 13.2 Staff daily operations flow

1. Open the current-day appointment queue (default: today, all statuses).
2. Filter or search by patient name, doctor, time, and status.
3. Confirm or cancel valid `PENDING` appointments with `ConfirmModal`.
4. Check in `CONFIRMED` patients with `ConfirmModal`.
5. Mark eligible missed appointments as `NO_SHOW` with `ConfirmModal`.

Actions must follow server-provided state and permissions. Do not present arbitrary status dropdowns. Do not allow invalid status transitions.

### 13.3 Doctor consultation flow

1. Open assigned schedule for the day.
2. Identify `CHECKED_IN` patients.
3. View only the patient information for the assigned appointment.
4. Create or update medical record and basic prescription (inline validation required).
5. Save successfully before completing the appointment (save and complete are separate actions).
6. Surface notification/outbox failures as recoverable system feedback — never as lost clinical work.

### 13.4 Date and time formatting rules

| Context | Format | Example |
|---|---|---|
| Vietnamese date | `dd/MM/yyyy` | `01/10/2026` |
| Vietnamese date-time | `HH:mm dd/MM/yyyy` | `09:30 01/10/2026` |
| Sidebar top-bar date | `EEEE, dd/MM/yyyy · Múi giờ GMT+7` | `Thứ Năm, 01/10/2026 · Múi giờ GMT+7` |
| Appointment list relative | Use relative time for < 24h ago, absolute for older | `2 giờ trước` / `09:30 01/10/2026` |
| Appointment slot display | `HH:mm` | `09:30` |

Always display timezone explicitly when the date/time relates to a scheduled appointment. Never show a timestamp without context.

### 13.5 Patient identification rules

Clinical views must always show human-readable patient identification. Raw UUIDs must never be shown in UI elements intended for clinicians or staff.

| Field | What to show | Never show |
|---|---|---|
| Patient selector in medical records | `Nguyễn Văn A — 09:30 01/10/2026 (Đã check-in)` | Raw `patientId` UUID |
| Appointment row in staff queue | Full name, appointment time, status badge | UUID or internal database ID |
| Doctor profile | Doctor name, specialty, short bio | Internal UUID or Supabase user ID |

---

## 14. Page Specifications

### 14.1 Web: Appointments (Staff/Doctor) — `/appointments`

> **Critical gap from audit:** This page is currently a placeholder (`PagePlaceholder`). This is the primary operational page for all clinical roles.

**Purpose:** Central queue for managing the day's appointments.

**Primary user task (Staff):** See today's pending appointments → check in confirmed patients → mark no-shows.
**Primary user task (Doctor):** See today's assigned schedule → identify checked-in patients → enter medical records.

**Required features:**
- Date selector (default: today)
- Tab/filter bar: All · PENDING · CONFIRMED · CHECKED_IN · COMPLETED · CANCELLED · NO_SHOW
- Search by patient name, doctor name
- Appointment table/list: time slot, patient name, doctor name, specialty, status badge, action buttons
- Per-row actions (role-filtered): Confirm, Cancel, Check-in, No-show, View Record
- `ConfirmModal` for: confirm, cancel, check-in, no-show
- Empty state: "Không có lịch hẹn nào hôm nay" with the date and a refresh action
- Error state: API error with retry
- Loading skeleton: table row skeletons matching column layout

**State matrix:**

| State | What to show |
|---|---|
| Loading | Table row skeletons (same columns as populated) |
| Empty (today, all filters) | Date, "Không có lịch hẹn nào hôm nay", retry/refresh |
| Empty (filtered) | Active filter pill, "Không có lịch hẹn nào với bộ lọc này", clear filter CTA |
| Populated | Table with all columns, role-filtered action buttons |
| Error | Error message, retry button, keep current filter state |
| Permission denied | "Bạn không có quyền xem trang này" + back navigation |
| Action in-flight | Button loading state; row action button disabled |
| Action success | Status badge updates in-row; toast "Đã xác nhận thành công" |
| Conflict (409) | Inline alert on the row: "Trạng thái này không thể cập nhật" |

### 14.2 Web: Medical Records — `/medical-records`

**Purpose:** Clinical staff and doctors view and create medical records for completed appointments.

**Known issues from audit (must be fixed in implementation):**
- Hardcoded `#0F766E` submit button → use `Button variant="primary"`
- Hardcoded `#b42318` error text → use `Alert variant="danger"` or `--danger` token
- Patient selector shows raw UUIDs → join/resolve patient name via User Service
- Prescription inputs missing `aria-label` → add explicit labels per §15

**State matrix:**

| State | What to show |
|---|---|
| Loading | Skeleton: appointment picker, record form skeleton |
| Empty (no appointments) | "Không có lịch hẹn nào cần lập hồ sơ" with date context |
| Form active | Inline validation; preserve input on API error |
| Submitting | Button loading state; form fields disabled |
| Success | Success `Alert`; reset to empty or show the new record |
| Error (validation) | Inline error per field; `Alert` summary at top |
| Error (server) | `Alert variant="danger"` with retry; preserve form data |

### 14.3 Web: Dashboard / Work Overview

**Purpose:** First screen after login. Shows only the work relevant to the logged-in role.

**Rules:**
- Do not design a generic 4-stat-card dashboard. Design from the role's primary task.
- STAFF: Today's appointment queue summary → direct link to `/appointments`.
- DOCTOR: Today's assigned schedule → checked-in patients first.
- ADMIN: System health indicators (real service status, not fake metrics).
- No fabricated statistics, delta badges with fake trends, or vanity counters.
- One primary CTA per role: the one action that starts their workday.

### 14.4 Flutter: Appointment Booking Flow

**Screens:** Doctor search → Doctor profile → Date/slot selector → Booking summary → Confirmation

**Rules:**
- Each step is a separate screen with a back button and visible step indicator.
- Slot picker: available slots in `ClinicColors.primary` tint; occupied in `ClinicColors.surfaceSubtle` with strikethrough text; past in muted disabled style.
- Summary screen: doctor name, specialty, date in `dd/MM/yyyy`, time in `HH:mm`, clinic address.
- Submit button: disabled while in-flight; enabled after failure (manual retry); shows loading indicator.
- `APPOINTMENT_SLOT_UNAVAILABLE` (409): show an inline alert with "Khung giờ này vừa được đặt. Vui lòng chọn khung giờ khác." and return to the slot selector with a refreshed list.

### 14.5 Web: Auth Page — `/auth`

**Layout rule (CRITICAL — không có trong bất kỳ phiên bản hợp đồng trước):**

Trang `/auth` là **unauthenticated route** — `AppShell` (sidebar + topbar) **không được render** trên trang này. Đây là lỗi thiết kế nghiêm trọng hiện tại: sidebar 232px rỗng xuất hiện bên trái, form login không được căn giữa thực sự do nằm trong flex container không đúng.

**Layout yêu cầu cho `/auth`:**
- Toàn trang: `min-height: 100vh`, background `--canvas` (`#F5F7FA`), không có sidebar, không có topbar
- Form card: `width: 440px`, căn giữa tuyệt đối (`margin: auto` trong flex/grid center), `padding: 40px 48px`
- Brand mark ở trên form (logo + "Health&Human"), không dùng sidebar brand
- Không có navigation, không có breadcrumb

**Cách sửa trong Next.js:**
- `app/layout.tsx` phải kiểm tra pathname và KHÔNG wrap `AppShell` cho route `/auth`
- Hoặc tạo `app/auth/layout.tsx` riêng (không dùng AppShell) để override root layout

**Known bugs phải sửa trong `auth/page.tsx`:**

| # | Bug | Fix |
|---|---|---|
| 1 | Submit button `background: "#0284c7"` (info token) | Dùng `Button variant="primary"` — màu `--brand` (`#2D5BFF`) |
| 2 | Error div inline style `background: "#fef2f2"` | Dùng `Alert variant="danger"` |
| 3 | Input inline style `border: "1px solid #cbd5e1"` | Dùng `Input` component |
| 4 | "Đã đăng nhập" state dùng button inline style màu `#0284c7` | Dùng `Button variant="primary"` + `Button variant="outline"` |
| 5 | Form không căn giữa do layout shell sai | Sửa layout trước, sau đó form tự center |

**State matrix cho `/auth`:**

| State | Hiển thị |
|---|---|
| Unauthenticated (default) | Form login centered, không sidebar |
| Submitting | Button loading state, fields `disabled` |
| Error (sai credentials) | `Alert variant="danger"` với message cụ thể, `role="alert"` |
| Error (network) | `Alert variant="danger"` "Không thể kết nối. Vui lòng thử lại." |
| Already authenticated | Card "Đã đăng nhập" với 2 actions: Vào bảng điều khiển + Đăng xuất — KHÔNG sidebar |

**Accessibility:**
- `<form>` có `aria-label="Đăng nhập"`
- Email input: `<label htmlFor="auth-email">` ✓ (đã có)
- Password input: `<label htmlFor="auth-password">` ✓ (đã có)
- Error message: `role="alert"` (hiện thiếu)
- Submit button disabled state có tooltip/aria-label giải thích

---

### 14.6 Flutter: Appointments List

**Known issues from audit (must be fixed in implementation):**
- `appointment_card.dart`: avatar uses `Color(0xFFE0E7FF)` + `Color(0xFF6366F1)` (indigo) → replace with `ClinicColors.primarySoft` + `ClinicColors.primary`
- `appointment_card.dart`: `BorderRadius.circular(20)` → replace with `BorderRadius.circular(12)`
- `status_chip.dart`: `CHECKED_IN` and `NO_SHOW` fall to grey → add explicit info-light/danger-light color pairs

**State matrix:**

| State | What to show |
|---|---|
| Loading | `AppLoadingState` skeleton cards (card shape, 3 items) |
| Empty (no appointments) | `AppEmptyState`: icon, "Bạn chưa có lịch hẹn nào", "Đặt lịch khám" primary CTA |
| Populated | Appointment cards with status chips |
| Error | `AppErrorState`: error message, "Thử lại" retry button |
| Offline | Stale data badge + "Đang ngoại tuyến — hiển thị dữ liệu lưu trữ" notice |

### 14.7 Web: Render and Loading Strategy

The detailed render contract for every Clinic Management Web route, page region,
skeleton, refresh, partial-data, empty, and error state is maintained in
[`docs/web-rendering-contract.md`](web-rendering-contract.md). It supplements this
section and §11; it does not change role permissions, API ownership, or the visual
tokens defined here.

---

## 15. Accessibility Requirements

Minimum standard: **WCAG 2.1 AA**

### 15.1 Contrast ratios

| Element type | Minimum ratio |
|---|---|
| Normal text (< 18px or < 14px bold) | 4.5:1 |
| Large text (≥ 18px or ≥ 14px bold) | 3.0:1 |
| Interactive borders, icons, controls | 3.0:1 |
| Status badge text on soft backgrounds | 4.5:1 (verify each pair) |

**Verified token pairs (all ≥ 4.5:1 on their soft backgrounds):**
- `#B45309` (warning) on `#FEF3C7` (warning-light): passes
- `#15803D` (success) on `#E3F6E9` (success-light): passes
- `#B91C1C` (danger) on `#FEE2E2` (danger-light): passes
- `#0284C7` (info) on `#F0F9FF` (info-light): passes
- `#2D5BFF` (primary) on `#E9EEFF` (primary-soft): passes

### 15.2 Keyboard navigation (web)

- All interactive elements focusable via `Tab` in logical DOM order.
- Visible `:focus-visible` ring: `2px solid var(--brand)`, `outline-offset: 2px`.
- Never `focus { outline: none }` without a replacement visual indicator.
- Modal dialogs must trap focus within the open dialog.
- Modal dialogs must close on `Escape` key.
- Table row actions accessible without mouse.

### 15.3 Semantic HTML (web)

- Use `<main>`, `<nav>`, `<header>`, `<aside>`, `<section>`, `<article>` for landmark regions.
- Use `<table>`, `<thead>`, `<tbody>`, `<th scope="col">`, `<td>` for tabular data — never `<div>` grids for tables.
- Use `<button type="button">` or `<button type="submit">` for actions — never `<div onClick>`.
- Every `<input>`, `<select>`, `<textarea>` must have a connected `<label>` or explicit `aria-label`.
- Decorative icons: `aria-hidden="true"`. Functional icons without visible text: `aria-label` on the button.
- Dynamic regions (toasts, alerts): `role="alert"` or `aria-live="polite"`.

### 15.4 Form accessibility rules

- Every prescription input must carry an indexed `aria-label`: `aria-label="Tên thuốc hàng 1"`, `aria-label="Liều dùng hàng 1"`, etc.
- Every "Xóa" (delete) button in a dynamic list must identify what it deletes: `aria-label="Xóa thuốc Paracetamol"`.
- Validation errors must be announced to screen readers via `aria-describedby` linking the input to its error message element.

### 15.5 Touch targets (Flutter)

- Minimum touch target size: **48×48 logical pixels** for all interactive elements.
- Bottom navigation items must have comfortable hit areas (NavigationBar provides this by default with height 64px).
- If using `IconButton` or custom `GestureDetector`, wrap with `SizedBox(width: 48, height: 48)` minimum.
- Prescription row delete button in Flutter must be ≥ 48×48px.

---

## 16. Responsive Behavior

### 16.1 Patient App (Flutter Android)

- Primary target: Android phone, narrow screens (360–414dp wide).
- No horizontal scrolling or clipping at any screen width.
- Respect `MediaQuery.padding` (safe areas), keyboard insets.
- Fixed bars (AppBar, NavigationBar) must not cover content — use `Scaffold` padding correctly.
- Long Vietnamese labels wrap within their container — test with `Không thể hoàn thành lịch hẹn` in a chip.
- Booking forms must scroll the active input into view when keyboard appears.

### 16.2 Clinic Management Web (Next.js)

- Desktop primary (≥ 1024px), tablet supported (768–1023px), narrow operable (< 768px).
- At < 768px: sidebar collapses to a hamburger or bottom nav — role visibility and route guard behavior unchanged.
- Tables at < 768px: horizontal scroll or card reflow (never silently drop columns or action buttons).
- No element may overlap, clip critical text, or depend on hover as its only interaction mechanism.
- No horizontal overflow at any breakpoint.
- Dropdown menus, popovers, and date pickers must stay within the viewport.

---

## 17. Data and Privacy Rules

- Show the minimum patient information required for the current role and task.
- Do not show full insurance numbers in generic lists or selectors.
- Never place diagnosis, prescription text, contact details, tokens, or UUIDs in analytics logs or URL parameters visible to patients.
- Medical records are not physically deleted from ordinary UI flows.
- Preserve audit-relevant author and timestamp information when the API provides it.
- Do not use real patient data in fixtures, screenshots, demos, or generated mockups.
- Clearly distinguish clinical data (diagnosis, prescription) from operational metadata (status, timestamps).

---

## 18. Component and Code Ownership

- Shared components contain presentation and technical behavior only — no domain business rules.
- Domain components stay under their feature module.
- Flutter domain modules: `apps/patient-app/lib/features/<domain>/`
- Next.js domain modules: `apps/clinic-management-web/src/features/<domain>/`
- Route files in `apps/clinic-management-web/app/` are thin integration points only — no business logic.

| Concern | Flutter | Next.js |
|---|---|---|
| Theme / tokens | `lib/core/theme/app_theme.dart` | `app/globals.css` |
| Navigation | `lib/app/app_routes.dart` | `src/lib/navigation/routes.ts` |
| Application shell | `lib/app/patient_shell.dart` | `src/components/app-shell.tsx` |
| API client | `lib/core/api/clinic_api_client.dart` | `src/lib/api/client.ts` |
| Session | `lib/core/session/` | `src/lib/session/` |
| Async states | `lib/shared/widgets/async_states.dart` | `src/components/states.tsx` |

Changes to shared shells, route registries, API clients, session interfaces, themes, and global tokens require review from the platform owner before merge.

---

## 19. UI Definition of Done

A UI change is complete only when **all** of the following are true:

- [ ] Serves the correct platform and role defined in this contract.
- [ ] Calls only the API Gateway through the shared API client — no direct service or database calls.
- [ ] Follows the API contract and valid state transitions from `docs/api-contract.md`.
- [ ] Loading, empty (first-run), empty (filtered), error, permission-denied, and success states are implemented.
- [ ] No hardcoded color hex values — all colors use CSS variables or `ClinicColors.*` constants.
- [ ] No inline `style={}` for color, border, or spacing overrides — use component variants.
- [ ] No raw UUIDs in clinician-facing labels or selectors — resolved to human-readable names.
- [ ] All form inputs have associated `<label>` or `aria-label`.
- [ ] All destructive or consequential actions use `ConfirmModal`.
- [ ] Status chips/badges cover all 6 appointment statuses with correct color pairs.
- [ ] Vietnamese copy is clear, correctly accented, uses sentence case, and does not leak technical identifiers.
- [ ] Keyboard navigation, focus rings, and screen-reader semantics are implemented.
- [ ] Touch targets ≥ 48×48px on Flutter; ≥ 44×44px on Web.
- [ ] Phone and desktop/tablet layouts checked on the relevant platform.
- [ ] Long labels and dynamic data do not overflow or clip.
- [ ] Flutter: all radii use 12px for cards/inputs/buttons (not 20/24px).
- [ ] Flutter analyze / Next.js lint + build passes.
- [ ] Screenshots contain synthetic data only.

---

## 20. Agent Workflow Rules

Before changing any UI, an agent must:

1. Read this document (`docs/ui-design-contract.md`).
2. Read `docs/api-contract.md` and the relevant existing feature code.
3. Run the **grounding check** (`.agents/skills/grounding-before-designing/SKILL.md`): verify every token name, component name, and data shape used actually exists in the codebase.
4. State the target platform, role, affected routes, and API dependencies.
5. Enumerate the full state matrix for each surface being designed or changed.
6. Reuse existing API/session boundary — identify any contract gap before inventing data.
7. Inspect adjacent screens and shared tokens for cross-screen coherence.

An agent must not:

- Create a new frontend, service, role, API path, status, or business workflow without explicit approval.
- Turn the management web into a marketing site or the patient app into a static mockup.
- Put Supabase/database configuration in frontend code.
- Replace live API integration with permanent mock data.
- Grant access by hiding/showing buttons without backend authorization.
- Change shared navigation, theme, API client, or session behavior silently from a domain task.
- Use hardcoded hex color values or arbitrary inline styles.
- Apply `BorderRadius.circular(20)` or higher for cards/inputs in Flutter.
- Claim a state is "implemented" without verifying it renders correctly.

### 20.1 Installed design skills reference

The following skills are available at `.agents/skills/` for activation during UI tasks:

| Category | Skill | When to activate |
|---|---|---|
| Core filter | `antislop` | Every UI task |
| Full taxonomy | `antislop-master` | Pre-PR comprehensive audit |
| Fast checklist | `anti-slop-audit` | Pre-commit verification |
| Visual & color | `antislop-ui` | Color, layout, decoration work |
| Design review | `frontend-design-review` | Code review, new views, component implementation |
| Deep audit | `grilling-ui` | Auditing existing UI or flow docs |
| Token grounding | `grounding-before-designing` | Before any UI markup or styling |
| State design | `designing-states-not-screens` | Lists, tables, forms, data surfaces |
| Typography | `visual-hierarchy-and-type` | Page layouts, heading structures |
| Interactions | `interaction-craft` | Button, modal, input styling, focus states |
| Copy & formats | `precision-copy-and-formatting` | Error messages, dialog text, date labels |
| Forms | `antislop-forms` | Booking flow, prescription forms, patient intake |
| Mobile & Flutter | `antislop-mobile` | Flutter Patient App implementation |
| Accessibility | `antislop-human` | Accessibility verification, WCAG checks |
| Layout | `antislop-layout` | Page structure, section composition |
| Dashboard | `antislop-dashboard` | Admin/analytics interface work |

### 20.2 Conflict resolution

When guidance between skills appears to conflict:

1. **This contract takes absolute precedence.** Token values, component names, and platform rules in this document override any skill recommendation.
2. **Clinical utility over decorative experimentation.** Where any skill suggests expressive aesthetics, alternative fonts, or decorative patterns, Health&Human prioritizes clinical clarity and established tokens.
3. **No ungrounded tokens.** If a skill recommends a pattern requiring new CSS classes or token values, ground them in existing tokens from §6 rather than inventing new styles.

---

## 21. Agent Prompt Preamble

Use the following text at the start of any UI task assigned to another agent:

```
You are working on Health&Human, a clinic appointment booking system.

Before designing or implementing any UI:
1. Read docs/ui-design-contract.md (this document — the authoritative design contract).
2. Read docs/api-contract.md for API shapes, state transitions, and error codes.
3. Read the relevant existing feature code and shared shell/theme/API client files.

Platform rules:
- Flutter Patient App (Android) → PATIENT users only.
- Next.js Clinic Management Web → DOCTOR, STAFF, ADMIN users only.
- All API calls go through the API Gateway using the shared API client.
- No Supabase, database, or internal service calls from any frontend code.
- No new roles, statuses, endpoints, or permissions without approval.

Code rules:
- All colors use CSS variables (--brand, --ink, --muted, etc.) or ClinicColors.* constants. No hardcoded hex values.
- Flutter cards, inputs, and buttons use BorderRadius.circular(12) — not 20 or 24.
- All 6 appointment statuses (PENDING, CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, NO_SHOW) must have explicit color pairs in status chips.
- No raw UUIDs in clinician-facing UI labels.
- ConfirmModal is required for: cancel, confirm, check-in, no-show, complete consultation.

Implement complete states: loading skeleton, empty (with CTA), error (with retry), permission-denied, and success.
All Vietnamese copy must have correct diacritics and use sentence case.
Report contract gaps before changing behavior.
```
