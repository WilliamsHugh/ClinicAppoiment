# TV3 — M3 Appointment List, Changes and QR

- Owner: TV3 / MinhPhatVilla.
- Task: `M3-UI-BOOK-003` (P2), task 5 of the user's six-task sequence.
- Branch: `feat/tv3-m3-booking-confirmation`, continuing the authorized task branch.
- Base: `2b9a377`; fetched `main` was `189651e` at prerequisite inspection.
- Owned paths: Flutter `lib/features/appointments/`, its tests and this document.
- Shared-file changes declared: Flutter `pubspec.yaml` and `pubspec.lock` add
  `qr_flutter` 4.1.0 and transitive `qr` 3.0.2; TV1 review remains required.
- Status: feature implemented and automated checks passed. Actual TV1 `QrTicketCard`
  integration, shared-file review and live Android/Gateway acceptance remain pending.
  This is not merged/accepted work. No PR yet, per the user's six-task workflow.

## Result

Appointments now uses three equally sized tabs. All actor-scoped API pages are
loaded before grouping, rather than filtering an incomplete first page:

| Tab | Membership | Order |
| --- | --- | --- |
| Sắp tới | Future PENDING/CONFIRMED; CHECKED_IN stays here until its state changes | Earliest first |
| Lịch sử | COMPLETED, NO_SHOW; elapsed PENDING/CONFIRMED with their actual status retained | Latest first |
| Đã hủy | CANCELLED, regardless of scheduled time | Latest first |

Elapsed time never changes a booking into COMPLETED. Overdue unresolved bookings
show an explanation and retain actions permitted by their actual state. There is
no patient completion action. Dates and times render in UTC+7; request instants
are UTC. Doctor names are resolved and cached with bounded concurrency, with
readable fallbacks during doctor-service outages; UUIDs cannot become names.

Loading uses skeletons. Empty and error states offer retry/refresh. A failed read
is not an empty list. Failed refresh retains existing rows but disables actions
until a successful reload. Booking success and refresh failure are separate
messages, preserving the existing P0 booking-confirmation route.

## Reschedule and cancellation

Only PENDING/CONFIRMED appointments expose these actions. Cancellation opens a
confirmation sheet showing the doctor, current date/time, explicit confirmation
and optional reason. Closing/back before submission performs no write.

Rescheduling uses the existing doctor date control and validated available-slots
repository. It offers actual API slots only, excluding the existing interval;
there are no hard-coded appointment times. A new date cancels the previous read,
clears selection and ignores late responses. Slot failures offer retry; empty
availability asks the patient to choose another date. Reason input is limited to
500 characters. Both modal lists own controllers with offset persistence disabled,
so reopening another sheet starts with the current booking information visible.

While a write is pending, duplicate submit, close, drag, barrier dismissal and
system back are blocked. Success requires a valid response for the same appointment
and the requested status/interval. The response updates the local card and tab,
then reloads the list. A result from a replaced API client cannot repopulate that
client's replacement list.

`APPOINTMENT_SLOT_UNAVAILABLE`/`APPOINTMENT_SLOT_INVALID` retain the reason, reload
slots and require selection again. The rejected slot stays excluded. Other errors,
including changed state or an uncertain network outcome, require closing and
reviewing the refreshed list before another mutation. Writes are never retried
automatically. Technical server details are not shown to patients.

## QR and TV1 dependency

`QrTicketCard` is not present in the local tree or fetched `main`. The user was
offered the choice to wait or continue with a library-backed feature-local card;
the recommended continuation was announced while no alternative was supplied.
No TV1 shared widget was implemented or modified.

`AppointmentsPage.ticketBuilder` provides a typed replacement boundary receiving
fresh authoritative appointment data. A synthetic-provider test covers this
boundary; actual TV1 integration remains pending delivery of the real widget.

The default local card uses [qr_flutter](https://pub.dev/packages/qr_flutter)
instead of a custom QR encoder. Opening the ticket first fetches the appointment
detail through the Gateway. Loading/error responses show no QR. Only a fresh
CONFIRMED appointment whose end time has not passed renders a ticket.

The QR payload is the appointment UUID only, without names, reasons, tokens or
clinical data. Readable content shows doctor, date/time and status without raw
identifiers. The QR is a lookup identifier, not a signed authorization credential;
the staff check-in API must still enforce authentication, resource access and
current state. Its actual camera/scanner integration has not been exercised.

## API boundary

All requests use the existing authenticated `ClinicApiClient` through Gateway:

- `GET /api/v1/appointments?page=...&limit=100` (rejects lists exceeding 100 pages).
- `GET /api/v1/appointments/{id}`.
- `GET /api/v1/doctors/{doctorId}` for display names.
- `GET /api/v1/doctors/{doctorId}/available-slots?date=YYYY-MM-DD`.
- `PATCH /api/v1/appointments/{id}/cancel` with optional `reason`.
- `PATCH /api/v1/appointments/{id}/reschedule` with UTC interval and optional reason.

Patient ownership comes from the authenticated backend actor, with no invented
`patientId` filter or role headers. Backend implementations and API contracts are
unchanged. No direct database, internal endpoint or cross-owner screen was touched.

## Validation

From `apps/patient-app`:

```powershell
flutter test --no-pub --reporter expanded
dart analyze lib test
```

- Full Flutter suite: **90 tests passed** (31 added for this task).
- Full `lib` and `test` analyzer: **No issues found**.
- `git diff --check`: passed.
- Tests include all six statuses, pagination past 100 rows, invalid pagination and
  responses, readable foreign-service fallback, session expiry, exact UTC payloads,
  stale date responses, cancellation confirmation, pending-write back/close/duplicate
  guards, slot conflicts, uncertain write outcome, state-change conflict, successful
  write plus failed reload, API-client replacement and QR refresh/access/disposal.
- Layout tests cover 360x740 and 414x896 with text scale 1.4 and fatal pointer
  hit-test warnings. The confirmation sheet's initial scroll offset is checked.
- Eight list/reschedule/cancel/ticket images were exported under ignored
  `.tools/appointment-review` and visually inspected. Export helpers accept
  `CLINIC_REVIEW_OUTPUT`, `CLINIC_REVIEW_FONT` and `CLINIC_REVIEW_ICONS`.
  This run substituted installed Segoe UI for text and loaded the SDK's Material
  icon font. Exports explicitly set the review font on fontless filled-button
  styles to avoid the headless engine's Ahem default; production theme is unchanged.
- OpenCV `QRCodeDetector.detectAndDecode` independently read both ticket PNGs,
  returning exactly the synthetic appointment UUID and no additional payload.

These are mocked HTTP unit/widget tests and rendered widget images. They do not
establish live backend ownership enforcement, PostgreSQL behavior, physical camera
scanning or device keyboard/accessibility acceptance. Live Android/Gateway checks,
TV1 widget/dependency review and final six-task PR review are outstanding.

Next task: `M3-UI-DOC-001` (P3), weekly Calendar and active switch on doctor web.
