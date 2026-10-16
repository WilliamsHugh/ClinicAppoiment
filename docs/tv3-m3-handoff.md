# TV3 M3: booking, clinic queue and doctor management

Connects patient slot selection to confirmed appointment creation, adds appointment
self-service and gives the clinic a queue board and weekly doctor management.
The six TV3 tasks are implemented on `feat/tv3-m3-booking-confirmation`, based on
`main` at `189651e`. Shared-component integration and live acceptance below remain
open; this handoff provides the scope and evidence for a draft pull request.

## Implemented scope

| Priority | Task | Result / evidence |
| --- | --- | --- |
| P0 | `M3-BUG-BOOK-001` | POST booking with actual selection, reason, idempotency and slot-conflict recovery. [Details](tv3-m3-booking-confirmation.md) |
| P0 | `M3-UI-BOOK-001` | Full booking confirmation sheet and success return to appointment list. [Details](tv3-m3-booking-confirmation.md) |
| P1 | `M3-UI-BOOK-004` | Clinic Queue Board with date filtering, authorized actions, cancellation/rescheduling and local updates. [Details](tv3-m3-queue-board.md) |
| P2 | `M3-UI-BOOK-002` | Patient doctor detail, weekly schedule and available-slot selection into confirmation. [Details](tv3-m3-doctor-directory.md) |
| P2 | `M3-UI-BOOK-003` | Appointment tabs, confirmed cancel/reschedule flows and refreshed QR ticket. [Details](tv3-m3-appointment-list.md) |
| P3 | `M3-UI-DOC-001` | Doctor weekly Calendar/List view and ADMIN activity switch using existing forms/API. [Details](tv3-m3-doctor-calendar.md) |

All requests follow frontend -> Gateway -> owning service. No backend contract,
database migration or cross-owner business screen changed. No direct commit to main
or force push is part of this work.

## Validation evidence

- Web: **102 tests passed**, TypeScript check and production build passed.
- Doctor Calendar: **9 Edge browser scenarios**, with all Gateway traffic mocked;
  timezone America/New_York; viewports 1280, 1920 and 390 pixels wide.
- Queue Board: its earlier seven Edge scenarios and their limitations are recorded
  in the Queue Board document; those browser checks were performed during P1.
- Flutter: **90 tests passed** and `dart analyze lib test` clean at `1dca355`.
  This final P3 task changes no Flutter code. Appointment ticket images at 360/414
  widths were independently decoded with OpenCV to the synthetic appointment UUID.
- Synthetic fixtures only; no live patient/database writes. Mock tests and rendered
  screenshots do not establish live end-to-end or PostgreSQL acceptance.

## Required review and integration before acceptance

1. TV1: review the native browser `fetch` receiver fix in the shared API client and
   Flutter `qr_flutter`/lockfile additions. Shared API client, shell and router
   ownership remain with TV1.
2. TV1: supply actual `HorizontalDateStrip`, `SlotGridSelector` and `QrTicketCard`.
   TV3 currently retains domain-local controls/library rendering with typed injection
   boundaries. Synthetic-provider tests do not establish real provider integration.
3. TV2: supply `PatientLookupDrawer` and connect/test it at the Queue Board's existing
   consumer slot. No patient profile/history implementation was duplicated here.
4. TV4: agree a real consultation-progress signal before separating Check-in from
   Đang khám. The API has no IN_PROGRESS state; the current board combines those
   phases using actual CHECKED_IN appointments. It does not infer medical-record data
   for roles that cannot read it. COMPLETED stays owned by final medical records.
5. Run disposable-account live acceptance on Android and web: role/owner denial,
   persistence, concurrent slot conflicts, timeout recovery, status changes and
   future-appointment protection on doctor deactivation. Verify physical QR scanning
   and TV1/TV2 component integration before marking M3 accepted.

The code is implemented and pushed for review; it is not described as merged,
fully integrated or accepted. Keep the PR in draft until the provider dependencies
and shared-file review are resolved, then obtain domain/platform owner review.
