# TV3 — M3 Doctor Management Calendar and Activity Switch

- Owner: TV3 / MinhPhatVilla.
- Task: `M3-UI-DOC-001` (P3), task 6 of the user's six-task sequence.
- Branch: `feat/tv3-m3-booking-confirmation`; base `1dca355`.
- Fetched `main`: `189651e` at prerequisite inspection; no new provider branches.
- Scope: `apps/clinic-management-web/src/features/doctors/`, doctor web tests and
  this handoff. No shared dependency/configuration or backend changes.
- Status: implemented and automated checks passed; review/merge and live Gateway
  acceptance are separate pending stages.

## Source reuse and result

Extended the existing `doctor-panel.tsx`, `doctor-api.ts` and domain CSS. The original
specialty, doctor profile, recurring-schedule and time-off forms remain in place.
`ScheduleCalendar` presents those existing schedule rules; it does not generate
bookable slots, maintain a parallel schedule store or introduce a calendar library.

The selected doctor now has Calendar/List views, with a local refresh action.
The Calendar has seven columns, Monday through Sunday (API weekday 0 = Sunday),
sorted sessions within each day, split shifts, duration and explicit active/inactive
labels. Inactive rules use a dashed treatment as well as text. The display states
that recurring hours do not establish availability for a particular date: holidays,
time off and occupied appointments still come from the existing slot API.

Schedule reads now traverse all pages through the existing Gateway API instead of
silently stopping after the default first 20 sessions. Responses are validated for
pagination, doctor identity, weekday, clock interval, duration and active flag.
Malformed/incomplete responses are errors, not an empty calendar; oversized reads
are bounded at 100 pages. Obsolete detail/date reads are aborted and also guarded
against late results. Re-selecting the current doctor preserves the loaded detail.

Editing a Calendar session fills and focuses the original schedule form; saving
uses the existing schedule update endpoint. Empty editable calendars offer an action
to the same creation form. Switching Calendar/List does not fetch again or discard
form input. Failed refresh hides incomplete calendar data, preserves the form,
disables saving and offers retry. Loading uses skeletons and respects reduced motion.

## Activity switch and permissions

ADMIN sees a keyboard-operable switch in each doctor row, without entering profile
edit mode. It sends only `{ isActive: boolean }` to the existing doctor PATCH route.
The checked state remains at the last confirmed value while saving. A matching,
valid server response updates the list and selected profile locally and refreshes
selected detail/availability, without document navigation or a directory reload.
The previous activity button inside the profile-edit form is replaced by this path.

A shared in-flight guard blocks duplicate/concurrent mutations; search/filter/page
changes are disabled during writes. Backend `SCHEDULE_CONFLICT_WITH_APPOINTMENTS`
explains why deactivation is rejected when future appointments exist, preserving
the previous checked state. Unknown outcomes, transport/server errors and invalid
success responses disable further switching until successful read recovery. Writes
are never automatically retried. New activity/detail error text avoids exposing
raw server messages.

STAFF can manage recurring schedules, but cannot change doctor activity. DOCTOR can
edit only their linked doctor's schedules/time off. Another doctor's recurring
Calendar is read-only, and its private time-off endpoint is never requested. The
workspace resets when authenticated user/role changes; old pending results cannot
repopulate a replacement workspace. These UI checks supplement backend enforcement.

All business requests still use `createBrowserApiClient` through Gateway. No role
header impersonation, direct Supabase/database access or new backend permission was
introduced. Disabling a doctor does not delete their recurring rules or cancel any
appointments in the frontend.

## Validation

From repository root:

```powershell
npm run test -w @clinic/clinic-management-web -- --reporter=dot
npm run typecheck -w @clinic/clinic-management-web
npm run build -w @clinic/clinic-management-web
```

- Full web suite: **102 tests passed**, 28 added by this task.
- TypeScript and Next.js production build: passed.
- `git diff --check`: passed.
- Unit/DOM coverage includes later-page/Sunday/inactive schedules, clock and owner
  validation, aborted/obsolete responses, read failure/retry, empty creation action,
  re-selecting the same doctor, original edit form and focus, Calendar/List reuse,
  role boundaries, exact activity payload, malformed success, duplicate writes,
  failed mutations, unknown-outcome reconciliation and role replacement.

The standalone Edge browser suite uses the isolated Playwright installation already
used by the Queue Board checks. With a production server on `127.0.0.1:5174`:

```powershell
$env:CLINIC_PLAYWRIGHT_MODULE = (New-Object System.Uri((Join-Path (Get-Location) '.tools/queue-browser/node_modules/playwright/index.mjs'))).AbsoluteUri
node apps/clinic-management-web/test/doctor-calendar.browser.mjs
```

All Gateway traffic is intercepted using synthetic fixtures. Browser timezone is
America/New_York to catch accidental clock conversion. Nine browser scenarios cover
weekly mapping/pagination, responsive layout, editing through the original form,
failed refresh recovery, booked-appointment conflict, keyboard/duplicate protection,
unconfirmed response recovery, DOCTOR read-only access and empty STAFF calendar.
Screenshots/results are written under ignored `.tools/doctor-web-review`. Calendar
images at 1280x900, 1920x900 and 390x900 and the activity-switch state were inspected;
horizontal overflow stays within the Calendar region rather than the page.
Browser result: **9/9 scenarios passed** on Edge `155.0.4283.45`, with no uncaught
page errors. The explicit 409 and 503 fixtures recover through their tested paths.

These are browser integration tests with simulated HTTP, not live backend or
PostgreSQL acceptance. Remaining checks: use disposable ADMIN/STAFF/DOCTOR accounts
through the real Gateway, verify backend role/ownership protection and persistence,
race concurrent operators, and verify actual future appointments block deactivation
with the unchanged `409` contract. No live patient or database data was written.
