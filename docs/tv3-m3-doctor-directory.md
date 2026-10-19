# TV3 — M3 Doctor Directory

- Owner: TV3 / MinhPhatVilla.
- Task: `M3-UI-BOOK-002` (P2).
- Branch: `feat/tv3-m3-booking-confirmation`, continuing the user's six-task branch.
- Base: `990e55f`. Fetched `main` remains `189651e` when checking prerequisites.
- Status: TV3 feature implemented and automated checks passed; TV1 widget integration
  and live Android/Gateway acceptance remain pending. No PR yet.

## Result and source reuse

Refactored `lib/features/doctors/doctor_directory_page.dart` from the existing
directory/search/pagination flow. Its inline doctor section is extracted into the
new domain-owned `DoctorDetailPage`, reached by tapping a doctor. Returning preserves
directory search/filter/scroll state. Empty searches offer clearing filters; loading
uses skeletons; failed or malformed responses offer retry without showing stale rows.

The detail page shows doctor name, specialty, biography and active recurring weekly
sessions, ordered Monday through Sunday. `DoctorRepository` reads all schedule pages,
validates metadata, doctor ownership and session clocks, and resolves specialty names
beyond the directory's current page when necessary. A recurring weekly schedule does
not promise availability for a specific date.

Date controls use Vietnam calendar dates. Slot instants remain UTC; presentation uses
the existing UTC+7 helpers. Available slots are fetched for the selected day, checked
for valid intervals, deduplicated, sorted and filtered against elapsed times. Morning
and afternoon/evening groups reuse the existing Wrap/ChoiceChip presentation.

Changing date or leaving the screen cancels obsolete reads; request generations also
prevent delayed responses from overwriting the latest selection. Doctor, specialty,
schedule and slot reads have separate retry states. Inactive/unknown-active profiles
cannot open the booking flow. Duplicate slot taps cannot stack confirmation sheets.

Selecting an available slot opens the existing P0 `BookingConfirmationSheet`. Only
confirmed API creation returns through the detail route to the directory callback,
which already refreshes/navigates to Appointments. Closing the sheet without creating
an appointment re-fetches availability for the selected doctor/day.

## API boundary and unavailable slots

All reads use `ClinicApiClient` through the Gateway:

- `GET /api/v1/doctors` and `GET /api/v1/specialties`.
- `GET /api/v1/doctors/{doctorId}`.
- `GET /api/v1/doctors/{doctorId}/schedules`.
- `GET /api/v1/doctors/{doctorId}/available-slots?date=YYYY-MM-DD`.

No frontend database access, internal route, patient-record endpoint or restricted
time-off endpoint was added. No backend/API contracts changed.

The available-slots API returns **available slots only**, not a complete inventory
with occupancy reasons. The UI never generates availability from weekly schedules
or labels every missing slot as booked. Within the current screen, a previously
observed available slot that disappears on refresh remains visible but disabled as
`Không còn khả dụng`. Slots never returned by the API are not invented. A failure
to read availability is an error with retry, not an empty/full day.

## TV1 dependency

`HorizontalDateStrip` and `SlotGridSelector` are not present in either this tree or
the fetched `main`. The user was offered a choice; while no alternative was supplied,
the implementation retained the existing Material controls within TV3's domain.
It does not create or modify TV1's shared widgets.

`DoctorBookingWidgets` exposes date-strip and slot-selector builders, forwarded by
`DoctorsPage` and `DoctorDirectoryPage`. Typed consumer inputs include date bounds,
callbacks, available/disabled slots and enabled state. Once TV1 delivers its widgets,
adapt the actual provider props at this boundary. The injection behavior is covered
by a synthetic-provider test; this does not establish real shared-widget integration.

## Validation

Run from `apps/patient-app`:

```powershell
flutter test --no-pub
dart analyze lib/features/doctors test/features/doctors
```

- Full Flutter suite: **59 tests passed** (23 added by this task).
- Scoped static analysis: **No issues found**.
- `git diff --check`: passed.
- Existing full booking-route test updated to exercise directory -> detail ->
  confirmation -> created appointment list.
- New checks cover schedule/specialty pagination, Monday/Sunday mapping, invalid
  clocks/metadata/foreign schedules, active-state handling, slot day/interval
  validation, doctor and partial-read failures/retry, obsolete date responses,
  disposal during an unfinished request, disappeared/disabled slots, duplicate taps,
  search preservation/clear filters, and the TV1 builder boundary.
- Layout tests exercise 360x740 and 414x896 with text scale 1.4. Pointer hit-test
  warnings are fatal in the detail test suite; expected disabled/blocked taps are
  tested at coordinates rather than pretending the target can receive events.

Optional review images are emitted by `doctor_detail_page_test.dart` when
`CLINIC_REVIEW_OUTPUT` is set. For readable screenshots, set `CLINIC_REVIEW_FONT`
to a local font supporting Vietnamese and `CLINIC_REVIEW_ICONS` to the SDK's
`materialicons-regular.otf`. This run used Segoe UI and the installed Material icon
font; header/weekly-schedule and slot-selection images at both widths were rendered
under ignored `.tools/doctor-review` and visually inspected. These are widget
renderings, not screenshots from an Android device.

The installed Flutter batch launcher previously stalled, so verification used its
Dart executable and `flutter_tools.snapshot` directly. No new dependencies or
shared package/lockfile changes were needed.

## Remaining acceptance

- Integrate and verify TV1's actual date/slot widgets once delivered.
- Verify the real Gateway with a disposable PATIENT account, schedules, time-offs,
  inactive doctors and occupied slots; test a second patient booking the same slot.
- Run on Android emulator/devices, including screen-reader navigation and keyboard
  behavior. Verify persistence and re-opened appointment lists after app restart.

Automated tests use synthetic HTTP responses. No live patient/database writes or
Android APK/device acceptance were performed for this task.
