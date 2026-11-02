# Health&Human UI/UX Quality & Anti-Slop Audit

> **Target Project:** Clinic Appointment Booking System (*Health&Human*)  
> **Platforms Audited:** `apps/clinic-management-web` (Next.js) & `apps/patient-app` (Flutter Android)  
> **Standards & Skills Applied:**  
> - `antislop` & `antislop-master` (P0–P6 Indicators & Delivery Gate)
> - `anti-slop-audit` (11-Point Executable Guardrail)
> - `frontend-design-review` (Design System Compliance, Frictionless, Craft, Trustworthy)
> - `designing-states-not-screens` (State Matrix Completeness)
> - `antislop-human` (WCAG 2.1 AA Accessibility & Contrast)
> - `antislop-mobile` (Mobile Ergonomics & Touch Targets)
> - `docs/ui-design-contract.md` (Approved Health&Human Design Contract)

---

## 1. Master Quality Checklist

### Visual Quality
- [ ] **Typography Hierarchy:** Distinct visual scale from `h1` down to captions. Optical weight matches content importance; no arbitrary font swaps (Inter on Web, system/sans on Flutter).
- [ ] **Color Consistency:** Strict adherence to design tokens (`--brand: #2d5bff`, `--primary`, `--ink`, `--muted`, `--surface`, `--line`). No rogue hex codes (`#0F766E`, `#6366F1`) or artificial purple/indigo gradient default tells.
- [ ] **Spacing Consistency:** 4px/8px modular scale applied uniformly across margins, padding, and layout gutters.
- [ ] **Component Consistency:** Buttons, badges, modals, and inputs sourced from `components/ui/` or `shared/widgets/` rather than raw unstyled elements with ad-hoc CSS.
- [ ] **Information Density:** High utility and scannable layout suitable for operational healthcare workflows. No excessive whitespace that pushes actionable data below the fold.
- [ ] **Responsive Behavior:** Web sidebar cleanly converts to accessible mobile navigation under 768px; data tables support horizontal scroll or card reflow; mobile viewports avoid horizontal clipping.
- [ ] **Unnecessary Decoration:** Zero gratuitous glassmorphism (`backdrop-filter`), background glow meshes, floating orbs, or arbitrary shadows.

### UX Quality
- [ ] **Primary Task Clarity:** Every screen has exactly one prominent primary action (e.g., "Đặt lịch khám", "Lưu hồ sơ khám", "Check-in").
- [ ] **Navigation Clarity:** Active navigation states indicated via both semantic attribute (`aria-current="page"`) and distinct visual styling (`--primary-light` background + bold text).
- [ ] **Form Usability:** Explicit `<label>` elements connected via `htmlFor`/`id`, clear placeholders, visible helper text, and real-time inline validation.
- [ ] **Error Recovery:** Meaningful error alerts with actionable next steps and retry triggers; preservation of all user inputs during API failures.
- [ ] **Loading & Empty States:** Comprehensive coverage of loading skeleton/spinners, empty states with clear CTAs, and offline/degraded service notices.
- [ ] **Appointment Booking Flow:** Unambiguous step-by-step progress; available slots clearly distinguished from occupied/past slots; slot selection is retained.
- [ ] **Appointment Confirmation:** Consequential actions (cancellation, check-in, no-show, completing consultation) require explicit confirmation dialogs.
- [ ] **Appointment Cancellation:** Safe cancellation path with clear penalty/policy explanation and input reason field.

### Accessibility (a11y)
- [ ] **Keyboard Navigation:** All interactive elements focusable via `Tab`; logical focus order throughout the DOM; modals trap focus and dismiss on `Escape`.
- [ ] **Visible Focus Indicators:** Clear `:focus-visible` rings (2px solid `--brand`, outline-offset 2px) on all interactive controls; no `:focus { outline: none }` without replacements.
- [ ] **Form Labels:** Every `<input>`, `<select>`, and `<textarea>` has an associated `<label>` or explicit `aria-label`/`aria-labelledby`.
- [ ] **Semantic HTML:** Correct landmark tags (`<main>`, `<nav>`, `<aside>`, `<header>`, `<article>`); table data using `<table>`, `<th>`, `<td>`; buttons using `<button type="button|submit">`.
- [ ] **Contrast:** Normal text meets 4.5:1 against background; large text/headings meet 3:0:1; interactive borders and icons meet 3.0:1.
- [ ] **Screen Reader Support:** Meaningful `aria-live` regions for dynamic toasts/alerts, descriptive icon labels (`aria-hidden="true"` on decorative icons).
- [ ] **Touch Target Sizing:** Minimum 44×44px interactive areas on Web; minimum 48×48px on Flutter mobile.

### Design Contract Compliance
- [ ] **Approved Tokens Respected:** All styles consume CSS variables or `AppTheme` constants; no hardcoded styling.
- [ ] **Approved Visual Direction Preserved:** Follows Health&Human Royal Blue palette (`#2d5bff`), clean medical white surfaces, and subtle slate lines.
- [ ] **No Unauthorized Color Changes:** Status colors strictly mapped to tokens: Success (Green), Warning (Amber), Danger (Red), Info (Sky).
- [ ] **No Unauthorized Typography Changes:** No arbitrary display fonts or foreign serif headings.
- [ ] **No Component Duplication:** Shared UI primitives reused across features without ad-hoc duplicate button/modal classes.
- [ ] **No Unapproved Design System Changes:** Preserves all contract rules in `docs/ui-design-contract.md`.

---

## 2. Inspected Findings & Audit Log

The following issues were identified through direct static inspection of the frontend implementations in `apps/clinic-management-web` and `apps/patient-app`.

### Issue 1: Hardcoded Off-Brand Colors in Medical Records Form
- **Severity:** High
- **Affected Page:** `apps/clinic-management-web/app/medical-records/page.tsx` (Lines 207, 217)
- **Category:** Visual Quality / Design Contract Compliance (Tell: P1 Off-palette color)
- **Explanation:**  
  The submit button uses hardcoded teal `background: "#0F766E"` instead of `--brand: #2d5bff` or `--primary: #2d5bff`. Additionally, error text uses hardcoded red `#b42318` instead of `--danger: #b91c1c`, and input borders use hardcoded `#cbd5e1` instead of `--line: #d9e0ea`. This breaks the approved brand identity and introduces visual inconsistency.
- **Recommended Fix:**  
  Replace raw HTML elements and inline styles with the design system `Button` and `Alert` components from `components/ui/`:
  ```tsx
  <Button type="submit" variant="primary" loading={submitting}>
    {editingRecordId ? "Cập nhật hồ sơ" : "Lưu hồ sơ khám"}
  </Button>
  ```

---

### Issue 2: Leaking Raw UUIDs in Doctor and Staff Clinical Selection
- **Severity:** High
- **Affected Page:** `apps/clinic-management-web/app/medical-records/page.tsx` (Line 175)
- **Category:** UX Quality / Information Architecture (Tell: P4 Low-craft filler / technical leakage)
- **Explanation:**  
  The appointment picker dropdown presents options using raw database patient UUIDs:
  `{a.patientId} — {new Date(a.scheduledStartAt).toLocaleString("vi-VN")} ({a.status})`.  
  Clinicians and assistants cannot identify patients by 36-character hexadecimal strings.
- **Recommended Fix:**  
  Join or resolve patient profile data (`fullName`, `phone`, or medical record number) via `User Service` lookup so staff see human-readable labels:
  `Nguyễn Văn A — 09:30 15/10/2026 (Đã check-in)`.

---

### Issue 3: Missing Accessible Labels in Dynamic Prescription Rows
- **Severity:** High
- **Affected Component:** `apps/clinic-management-web/app/medical-records/page.tsx` (Lines 185–192)
- **Category:** Accessibility (WCAG 2.1 Criteria 1.3.1, 4.1.2)
- **Explanation:**  
  Prescription inputs (Tên thuốc, Liều, Tần suất, Thời gian) are laid out in a grid with `placeholder` attributes only, without corresponding `<label>` tags or `aria-label` properties. Screen reader users cannot tell which field is dosage vs frequency. Furthermore, the "Xóa" button lacks context regarding which medication is being removed.
- **Recommended Fix:**  
  Add explicit `aria-label` to each input and contextualize the delete action:
  ```tsx
  <Input
    aria-label={`Tên thuốc hàng ${idx + 1}`}
    placeholder="Tên thuốc"
    value={item.medicineName}
    onChange={...}
  />
  <Button
    type="button"
    variant="danger"
    size="sm"
    aria-label={`Xóa thuốc ${item.medicineName || idx + 1}`}
    onClick={() => ...}
  >
    Xóa
  </Button>
  ```

---

### Issue 4: AI-Slop Indigo/Purple Default Colors in Flutter Patient App
- **Severity:** Medium
- **Affected Component:** `apps/patient-app/lib/features/appointments/widgets/appointment_card.dart` (Lines 53–57)
- **Category:** Visual Quality / Anti-Slop (Tell: P0 AI-Default Indigo Accent)
- **Explanation:**  
  The doctor/patient avatar container in `AppointmentCard` uses hardcoded Tailwind/AI default indigo:
  `color: const Color(0xFFE0E7FF)` with icon `color: const Color(0xFF6366F1)` (Indigo-500).  
  This is the hallmark AI-slop tell. The design contract specifies Royal Blue `0xFF2D5BFF` with light tint `0xFFE9EEFF`. Furthermore, the card uses an arbitrary `BorderRadius.circular(20)` instead of `AppTheme.radiusMd = 12.0`.
- **Recommended Fix:**  
  Use design tokens from `AppTheme`:
  ```dart
  decoration: BoxDecoration(
    color: ClinicColors.primaryLight, // 0xFFE9EEFF
    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
  ),
  child: Icon(Icons.person, size: 18, color: ClinicColors.primary), // 0xFF2D5BFF
  ```

---

### Issue 5: Incomplete Status Handling in Flutter Status Chip
- **Severity:** Medium
- **Affected Component:** `apps/patient-app/lib/features/appointments/widgets/status_chip.dart` (Lines 11–38)
- **Category:** UX Quality / State Completeness (Tell: P4 Incomplete States)
- **Explanation:**  
  The `StatusChip` defines text labels for `CHECKED_IN` and `NO_SHOW`, but fails to handle them in the background (`bg`) and foreground (`fg`) switch expressions, causing them to fall back to generic grey/muted. A checked-in patient appears inactive or cancelled rather than actively waiting for consultation.
- **Recommended Fix:**  
  Add explicit status color mappings:
  ```dart
  case 'CHECKED_IN':
    return const Color(0xFFE0F2FE); // Info light
  case 'NO_SHOW':
    return const Color(0xFFFEE2E2); // Danger light
  ```
  And matching foreground colors (`0xFF0369A1` for checked-in, `0xFFB91C1C` for no-show).

---

### Issue 6: Appointments Management Operational View is a Placeholder
- **Severity:** Critical
- **Affected Page:** `apps/clinic-management-web/app/appointments/page.tsx` (Lines 1–5)
- **Category:** UX Quality / Core Booking Workflow
- **Explanation:**  
  The staff and doctor appointments operations page (`/appointments`) merely renders `PagePlaceholder`. Staff members cannot inspect the day's schedule, confirm pending appointments, or check in patients from this designated route.
- **Recommended Fix:**  
  Implement the full Appointments Operational Panel consuming the shared appointment repository and Table/Card components, providing tabbed filters (`PENDING`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`), check-in triggers with confirmation modals, and cancellation workflows.

---

### Issue 7: Massive Inline Styles Bypassing CSS Modules in AppShell
- **Severity:** Low
- **Affected Component:** `apps/clinic-management-web/src/components/app-shell.tsx` (Lines 44–140)
- **Category:** Code Quality / Design System Maintainability
- **Explanation:**  
  The layout shell contains dozens of lines of inline `style={{ ... }}` objects declaring widths, flex configurations, and colors. This degrades maintainability, prevents CSS cache optimization, and creates inconsistencies with `globals.css` and `ui.module.css`.
- **Recommended Fix:**  
  Extract inline styles into `app-shell.module.css` or leverage class rules in `globals.css`.

---

## 3. Pre-PR Delivery Gate Verification

Before submitting any frontend pull request, run the following verification pipeline:

1. **Anti-Slop Audit Checklist:** Run all 11 checks in `.agents/skills/anti-slop-audit/SKILL.md`.
2. **Design System Grounding:** Run `.agents/skills/grounding-before-designing/SKILL.md` to guarantee zero hallucinated tokens or raw unstyled elements.
3. **States Matrix Audit:** Run `.agents/skills/designing-states-not-screens/SKILL.md` to verify default, loading, empty, error, and disabled states.
4. **Human Accessibility Gate:** Run `.agents/skills/antislop-human/SKILL.md` ensuring contrast ≥ 4.5:1, keyboard tabability, and focus rings.
5. **Contract Conformance:** Verify all layout and copy aligns with `docs/ui-design-contract.md` and `AGENTS.md`.
