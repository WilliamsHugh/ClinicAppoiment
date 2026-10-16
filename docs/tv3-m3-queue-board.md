# TV3 — M3 Clinic Queue Board

- Owner: TV3 / MinhPhatVilla.
- Task: `M3-UI-BOOK-004` (P1).
- Branch: `feat/tv3-m3-booking-confirmation`, continuing the user's six-task branch.
- Base: `e4e3c21`; remote `main` checked at `189651e` before implementation.
- Status: core implementation and automated checks complete; TV2 integration and
  live Gateway acceptance remain pending. No PR until all six tasks are finished.

## Behavior

`app/appointments/page.tsx` now renders the domain-owned `QueueBoard`. The selected
Vietnam calendar day becomes a half-open UTC range. The API adapter follows every
100-item page before displaying counts, sorts appointments by time, and resolves
names with bounded concurrent lookups and per-session caches. It does not call the
ADMIN-only `/api/v1/users/:id` endpoint. Doctor patient lookups include the actual
`appointmentId`; cancelled/no-show appointments do not authorize these lookups.

STAFF and ADMIN can confirm PENDING appointments; check in or mark CONFIRMED
appointments as no-show; and reschedule/cancel PENDING or CONFIRMED appointments.
DOCTOR sees the assigned data returned by the service and cannot run reception
mutations. No role receives a Complete button. FINAL medical-record completion
remains TV4's workflow.

Cancellation and rescheduling require a nonblank reason of at most 500 characters.
No-show has a confirmation dialog and optional reason. Rescheduling uses available
slots for the existing doctor, not arbitrary datetime text fields. Slot conflicts
keep the reason, clear the stale choice and reload availability. Network/timeout,
server failures and changed-status responses do not trigger automatic write retries.
An ambiguous modal operation is disabled until the operator closes it and reviews
the refreshed board.

Mutations have a synchronous duplicate-submit guard and visible pending state. The
server response updates the row, then the day is re-fetched. If that refresh fails,
the success notice remains distinct from the refresh error, and further actions
are disabled. Old date responses are cancelled/ignored; identity lookup failures
keep the appointment visible but disable reception actions until names resolve.
An initial fetch error is not displayed as a zero-appointment day.

The screen includes skeleton, empty/retry, error, success and disabled states.
Modal dialogs use the native top layer, Escape handling, Tab/Shift+Tab wrapping,
focus restoration and pending-write dismissal protection. The board contains its
own horizontal scrolling on narrow screens and respects reduced-motion settings.

## Explicit dependencies and contract mismatch

1. **TV2 PatientLookupDrawer is absent** in both the local tree and fetched `main`.
   This task does not implement TV2's profile/history component or edit
   `src/features/users/`. `QueueBoard` exports a consumer slot:

   ```tsx
   interface PatientLookupContext {
     patientId: string;
     appointmentId: string;
     onClose(): void;
   }
   // After TV2 delivers its component, adapt its actual props at this boundary:
   <QueueBoard PatientLookup={PatientLookupAdapter} />
   ```

   The current detail dialog shows only appointment context: names, date/time,
   status and reason. The injected-provider contract is tested with a synthetic
   component; that is not evidence of real TV2 integration. Once the provider is
   delivered, align this adapter with TV2, test profile/history, masking and role
   scope, then connect it in the route. No BHYT fields are rendered by this feature.

2. **There is no `IN_PROGRESS` appointment state** and STAFF/ADMIN cannot read
   medical records to infer one. Pending coordination with TV4, the board combines
   `Check-in / Đang khám` using actual `CHECKED_IN` data. It does not invent a state,
   count a patient twice, or misrepresent all checked-in patients as actively seen.
   The original five-column requirement needs an agreed progress signal before
   those two phases can be separated. This assumption was disclosed to the user.

3. **TV1 review is needed for the one-line shared API client fix** and its
   regression test. Edge exposed `TypeError: Failed to execute 'fetch' on 'Window':
   Illegal invocation` because the default native fetch was called with the client
   object as receiver. Bind the default fetch to `globalThis`; injected fetchers
   retain their existing behavior. Without this fix, real browser requests fail
   even when mock-based tests pass. No Gateway or backend contracts changed.

## Reproducible validation

From repository root:

```powershell
npm run test -w @clinic/clinic-management-web
npm run typecheck -w @clinic/clinic-management-web
npm run build -w @clinic/clinic-management-web
```

The full web suite passes **74 tests**. Coverage includes all role/action mappings,
Gateway paths and JSON bodies, UTC+7 boundaries, complete pagination, cached/scoped
name resolution, foreign-service/session failures, stale-response rejection,
duplicate submissions, destructive confirmation, slot conflicts, retry/empty slot
states, privacy, unavailable identity, failed post-write refresh, session changes,
the TV2 injection boundary, and the native-fetch receiver regression.

For the standalone browser suite, install Playwright outside the project dependency
tree (for example under ignored `.tools/queue-browser`) and run the local production
server on port 5174. Then:

```powershell
$env:QUEUE_PLAYWRIGHT_MODULE = (New-Object System.Uri((Join-Path (Get-Location) '.tools/queue-browser/node_modules/playwright/index.mjs'))).AbsoluteUri
node apps/clinic-management-web/test/queue-board.browser.mjs
```

The script launches installed Microsoft Edge, intercepts every Gateway request with
synthetic fixtures, tests real keyboard/modal behavior and mutations, and writes
screenshots plus `results.json` under `.tools/queue-browser/artifacts`. Its browser
timezone is deliberately America/New_York to verify Vietnam-time display. Tested
viewports are 1280×900, 1920×900 and 390×844. Playwright is not added to the shared
package/lockfile. These checks are browser integration tests with simulated HTTP,
not live end-to-end acceptance.

Browser result: **7/7 scenarios passed** on Microsoft Edge `155.0.4283.45`, with
no uncaught page errors. The intentional reschedule-conflict fixture returns HTTP
409 once; that expected response is followed by successful slot recovery. Desktop,
rescheduling-modal and narrow-screen screenshots were visually inspected.

## Remaining live acceptance

- Connect the delivered TV2 drawer and resolve the progress signal with TV4.
- Use the real Gateway and disposable STAFF/ADMIN/DOCTOR test accounts to verify
  server-side role and resource checks, persistence and patient-name scopes.
- Race two clients to reschedule the same slot; verify one conflict and preserved
  reason. Verify a second operator changing status produces safe recovery.
- Verify session expiry and a real disconnected/timeout mutation; review the server
  result before retrying. Ensure FINAL completion moves the appointment into the
  Completed column on refresh.
- Obtain TV1 review for the shared API client fix before merging.

No live patient or database data was written during automated verification.
