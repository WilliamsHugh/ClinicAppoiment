# TV3 — M3 booking confirmation

- Owner: TV3 / MinhPhatVilla.
- Tasks: `M3-BUG-BOOK-001`, `M3-UI-BOOK-001` (P0).
- Branch: `feat/tv3-m3-booking-confirmation`.
- Base: `189651e` from updated `main`.
- Status: implemented, automated tests passed; live acceptance pending.
- Delivery: push incremental commits on this branch; create the PR after all six
  TV3 M3 tasks are finished, as requested by the user.

## Result

Selecting a slot in `DoctorDirectoryPage` opens `BookingConfirmationSheet`.
The patient sees the doctor, date and Vietnam time, enters an optional reason,
then explicitly submits. `AppointmentRepository` posts through the existing Gateway
client. The backend infers patient identity from the authenticated actor.

The submit and close controls are disabled while creating an appointment. The same
payload retains its `Idempotency-Key` on retry; an edited payload gets a new key.
There is no automatic retry of appointment creation.

On slot conflict, the reason remains in the form, available slots reload, and the
patient chooses a replacement before submitting again. An empty day offers another
date; a failed slot lookup offers retry. Network and permission errors leave the
form open without implying success.

Only successful creation triggers navigation to Appointments and refresh of its
retained page. The legacy `AppointmentsPage(bookingSelection: ...)` entry point
opens the same sheet instead of displaying a static placeholder. Appointment rows
resolve doctor names through Doctor Service via the Gateway, with a readable
fallback if that lookup is unavailable.

## Scope and dependencies

- Feature changes: `lib/features/appointments/`, `lib/features/doctors/`.
- Shared integration: `lib/app/app_routes.dart`, `lib/app/patient_shell.dart`.
  These minimal navigation/refresh changes need TV1 review.
- Existing contracts: `POST /api/v1/appointments`,
  `GET /api/v1/doctors/{id}/available-slots?date=YYYY-MM-DD`,
  `GET /api/v1/doctors/{id}`. No backend contract changes.
- TV1 date/slot/QR widgets are not present at this base. This P0 change reuses
  existing Material controls; adopting the shared widget kit remains BOOK-002/003.
- Queue Board, three appointment tabs, QR tickets and doctor Calendar remain
  separate M3 tasks.
- Previous uncommitted Doctor Service work is retained in stash
  `Backup local doctor changes before TV3 M3`; it has not been applied to this branch.

## Validation

Run from `apps/patient-app`:

```powershell
flutter pub get
flutter test --no-pub
dart analyze lib/features/appointments lib/features/doctors lib/app test/features/booking_confirmation_sheet_test.dart test/features/doctors/doctor_route_test.dart
```

Full Flutter suite: **36 tests passed**. New and updated cases cover Gateway POST
payload/authentication, UTC conversion, no submission before confirmation, duplicate
taps/back during submission, slot conflict recovery, failed/empty slot lookups,
choosing another date, stable retry keys, changed payload keys, dismissal, legacy
entry, successful shell navigation/list refresh, and a 360×640 screen with keyboard
insets and larger text.

On this machine, the Flutter batch launcher initially stalled. The tests were run
with the installed SDK's Dart executable and `flutter_tools.snapshot` directly.
`flutter analyze` also failed in its LSP transport at the Unicode workspace path;
the standalone Dart analyzer is used for the scoped static check instead.

## Remaining acceptance

- Run the app with the Gateway and disposable test accounts/database.
- Create a real appointment and verify persistence after restarting the app.
- Book the same slot from two sessions: one succeeds, one retains its reason and
  offers fresh slots.
- Verify actual timeout/retry and authenticated session expiry against the Gateway.
- Review the screen on Android devices/emulator and obtain TV1 review of shared
  routing changes before merge.

Automated widget tests use synthetic API responses. No live patient or database
data was written, and passing these tests does not establish end-to-end acceptance.
