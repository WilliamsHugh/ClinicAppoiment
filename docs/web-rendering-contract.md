# Clinic Management Web Render and Loading Contract

> **Scope:** Next.js Clinic Management Web routes for DOCTOR, STAFF, and ADMIN.
> **Authority:** This document supplements [`ui-design-contract.md`](ui-design-contract.md)
> §§7, 9, 11, 12, 14, 15, 16, and 18. In a conflict, the UI Design Contract and
> [`api-contract.md`](api-contract.md) take precedence.
> **Purpose:** Define what renders before API data, what receives a skeleton, and how
> each page behaves during initial load, refresh, partial data, empty results, and errors.

## 1. Core rendering rule

“Static” means **independent of the current API response**, not necessarily server
rendered. Render stable page structure as soon as the route and required session/role
are known. Load live values into their own page regions.

| Render immediately | Load from API / session | Skeleton policy |
|---|---|---|
| Page title, explanatory text, section names, known table column labels, filter labels, control layout, fixed service names, and role-specific action locations | Rows, counts, profile values, names resolved from IDs, statuses, timestamps, schedules, notification content, health results, and permissions/session identity | Replace only the unresolved data region with a shape-matched skeleton. Keep its heading and surrounding controls visible. |

Do not use a generic full-page spinner for a known data layout. A page-wide skeleton is
reserved for the brief session/route boundary when the intended page cannot yet be
identified. Once the route and role are known, use that page’s skeleton composition.

### 1.1 First load and later refresh

- **First load with no usable data:** Keep the page frame, headings, filters, and
  section labels visible. Show skeletons where API content will appear.
- **Refresh with existing data:** Keep the last successful values visible and mark the
  updating region as busy. A small refresh indication may appear beside that region’s
  heading or control. Do not blank the region or replace it with first-load skeletons.
- **Filter or page change:** Keep the selected controls and current page frame visible.
  For data that no longer matches the new query, use skeletons in the result region
  until the new response arrives; do not present old results as if they match the new
  filter.
- **Independent requests:** Give each independently loaded region its own loading and
  error state. A failure resolving display names must not hide otherwise valid rows.
- **Mutation in progress:** Keep the page data visible. Show progress on the affected
  row/control and prevent duplicate submission there.
- **Successful mutation:** Update the authoritative value in place and announce the
  result. Do not revert to a page-level loading screen.

### 1.2 Skeleton shape and semantics

- Skeleton dimensions and count must follow the actual populated layout and current
  role’s columns. Use the existing `Skeleton`, `SkeletonTable`, `SkeletonCard`,
  `SkeletonList`, and `SkeletonPage` from `src/components/ui/skeleton.tsx` as applicable.
- Prefer page-specific composition over `SkeletonPage` where the page has a distinctive
  structure. `SkeletonPage` is a route fallback, not the required design for every page.
- Keep actual static table headers visible while loading table rows. Do not use fake
  rows with fabricated names, statuses, appointment times, counts, or IDs.
- Mark the changing region `aria-busy="true"`; expose a concise accessible loading
  label. Hide decorative skeleton blocks from assistive technology. Do not announce each
  skeleton cell separately.
- Respect reduced-motion preferences for skeleton shimmer. Motion must not be required
  to identify the loading state.
- Loading, empty, error, permission-denied, and stale data must remain visually distinct.

### 1.3 Data and trust boundaries

- All live data remains sourced through the shared browser API client and API Gateway.
  No browser database access or direct business-service calls.
- A skeleton is not evidence that data is available or authorized. Resolve the session
  and route permissions before rendering protected content.
- Never derive “healthy”, “empty”, “zero”, “active”, or a successful status from missing
  data. Unknown and not-yet-loaded are separate from a real negative result.
- Keep server-provided pagination, statuses, authorization, and state transitions
  authoritative. Client filtering may only be used where the page already owns the full
  relevant result set; do not imply a page-local search covers unseen API pages.

## 2. Shared shell and route boundary

### App shell: all protected routes

**Stable immediately:** brand, sidebar/navigation structure after role is known, topbar
layout, notification entry point, main content landmark. The selected route controls the
active navigation item.

**Session-dependent:** role-visible routes, identity name, role badge, and authenticated
notification controls. While session storage is being restored, do not flash an
unauthenticated landing page or a protected page with an invented identity. Use a compact
shell/session placeholder until authentication resolves; then render the correct route
content or redirect.

**Refresh behavior:** API refreshes inside a page must not reload the shell. Session
expiration/unauthorized responses follow the shared session handling and route guard.

### Route guard

- Session loading: use a neutral access-resolution state. If pathname already identifies
  a page, preserve its known page heading/frame where safe and skeleton its data region;
  never expose protected values before authentication/authorization is resolved.
- Unauthenticated: redirect to `/auth`; do not flash a permission-denied page first.
- Authenticated but disallowed role: show the existing clear access-denied state and
  route away/back actions. Do not show page skeletons that imply access is granted.
- Authorized: render the route’s page-specific loading composition.

### `app/loading.tsx`, `app/error.tsx`, and `app/not-found.tsx`

- `loading.tsx` is a route-segment fallback for navigation/framework waiting. Keep it
  neutral and compact because it cannot reliably know every page’s content shape. It
  must not replace the richer data-loading state owned by a mounted feature panel.
- `error.tsx` presents a recoverable route-level error with retry. Feature API errors
  belong inside the affected page region and should preserve other rendered regions.
- `not-found.tsx` is a genuine unknown-route empty state, not a substitute for empty API
  results.

## 3. Route specifications

### 3.1 `/` — role-based work dashboard

The route composition is selected by authenticated role: DOCTOR, STAFF, or ADMIN. The
landing page is public content; it must not be shown as a temporary stand-in while an
existing session is still being restored if that causes a jump to the dashboard.

#### Shared dashboard frame

- **Immediate:** greeting region, local date/time area, role label once known, quick
  action navigation, each dashboard section heading and its descriptive labels.
- **Skeleton/data:** only API-backed values and items. Keep section titles and action
  links visible. If a section’s API fails, show that section’s error while allowing
  other dashboard sections to remain usable.
- **Refresh:** retain current values while revalidating; identify the refreshing region.
- **Empty:** explain that there is no work for the selected/current period and retain
  the link to the relevant full page.

#### DOCTOR dashboard

- **Schedule section:** keep “today’s schedule” heading and its navigation/action
  controls. Skeleton the appointment rows with the same time, patient, status, and action
  geometry as the real list. If patient-name lookup is pending, skeleton only that name.
- **Progress summary:** keep each status label; skeleton each count independently until
  the appointment response is available. Do not show zero as a loaded count before then.
- **Empty/error:** distinguish no appointments from a failed appointment request. A
  retry applies to the schedule data region.

#### STAFF dashboard

- **Queue summary:** keep its heading and links. Skeleton the real count values, not
  decorative statistic cards. Counts must be derived from the loaded, permitted data.
- **Action queue:** skeleton each queue row in the actual row layout. Empty queue state
  keeps a direct path to `/appointments`.
- **Seven-day volume:** keep chart title, period, and legend if those are static. Skeleton
  the plot area and values until real series data arrives. Do not invent bars or trends.
- **Doctor/shift summary:** keep column/row labels and skeleton the API-backed schedule
  values. Failure here must not hide the appointment queue.

#### ADMIN dashboard

- **System health:** fixed list of gateway/services and table headers can render
  immediately. Skeleton each live status and last-checked value. Missing status is
  “unknown/loading”, never “down”. A health error is scoped to this section.
- **User totals by role:** keep role labels and skeleton counts. A failed role query must
  be identifiable; do not silently count a failed request as zero.
- No fabricated metrics, cached values presented as current, or empty chart decoration.
  Cached values may remain during refresh only when clearly identified as the last
  successful result and their timestamp is available.

### 3.2 `/appointments` — appointment operations

**Primary regions:** page heading; date/status/search controls; result count and active
filters; appointment table; pagination; row action feedback and confirmation dialog.

- **Immediate:** heading, date selector, status options, search control, refresh/reset
  controls, table headers appropriate to role, pagination frame. DOCTOR sees the
  doctor-specific columns; STAFF/ADMIN see the broader operational columns.
- **First load:** skeleton table body only, with matching column count and row density.
  Show a separate per-cell skeleton while patient/doctor/specialty names are unresolved.
- **Filter/page load:** do not clear controls or move the table frame. Skeleton rows for
  the new query; announce that results are updating. Do not leave old results under new
  filter labels.
- **Empty first-run/day:** retain selected date and controls; explain that no records
  exist for the current scope and provide refresh or the relevant next action.
- **Empty filtered:** identify the active filter(s), offer clearing/changing them, and
  distinguish this state from no appointments for the day.
- **Error:** retain filter input and pagination context. Show retry in the result area.
  If a name-lookup request alone fails, keep the appointment row and show a safe
  unresolved-name fallback; do not replace the whole table with an error.
- **Refresh with data:** retain existing rows until response succeeds; scope a busy
  indicator to the list. On failure, keep last results and clearly mark them stale if
  they are still shown.
- **Row action:** keep the row and status visible; show progress only on the affected
  action. On success update status from the server response. A 409 appears inline on the
  affected row and offers a way to refresh/reconcile.
- **Dialogs:** confirmation dialog overlays the current page and preserves underlying
  table state. Submission loading belongs to the confirm action.
- **Pagination:** show only when the response/contract supports it. Keep page counts
  derived from server metadata, not guessed from currently rendered rows.

### 3.3 `/doctors` — doctors, specialties, schedules, and availability

**Primary regions:** heading and role context; search/specialty filters; doctor list and
pagination; selected-doctor detail; schedules/time off/slots; specialty and doctor
management controls where authorized; dialogs/forms for mutations.

- **Immediate:** page heading, filter labels, known action locations, list/detail panel
  frames, section names, and management labels permitted for the role.
- **Doctor list first load:** skeleton doctor cards matching the actual card structure;
  keep search and specialty filters interactive only if changing them is safe before the
  options/data are loaded. Skeleton specialty option values separately when needed.
- **Doctor detail:** before selection show the designed selection prompt. After a
  selection, retain the selected doctor identity while separately loading the detail,
  schedule, time-off, and date-specific slot regions. Do not blank the list when detail
  requests run.
- **Schedule/calendar:** render stable date/week headings and weekday labels. Skeleton
  schedule entries or slot cells in place. Do not portray unloaded or failed slots as
  available. A slot is bookable/available only when the current API response explicitly
  says so.
- **Specialties:** fixed section heading and table/list headers remain; skeleton rows on
  first load. Empty state distinguishes no configured specialties from a filtered
  result.
- **Mutations:** keep existing list/detail visible. Loading state belongs to the
  affected save/toggle action. On success update the affected row/calendar from server
  data. On conflict/error preserve form values and explain recovery.
- **Empty/error:** list, detail, schedule, and slots have independent empty/error
  states. A slot endpoint failure must not imply that a doctor has no slots.

### 3.4 `/medical-records` — clinical records workspace

**Primary regions:** page heading; appointment selector/list; selected appointment
context; record form; prescription editor; recent records; save/finalize feedback.

- **Immediate:** heading, workspace panes, labels, field labels, prescription column
  headings, and action locations. Do not render clinical values from placeholders.
- **Appointment selector:** skeleton options/list rows on first load. An empty result
  must explain that no eligible appointment exists in the current role/scope; do not
  remove the form shell without explanation.
- **Selected record/form:** keep the selected appointment context stable. Skeleton
  existing record values while fetching; distinguish “no existing record” from “record
  failed to load”.
- **Recent records:** keep section heading and list/table frame; skeleton records
  independently from the editor. Failure in recent records does not disable the editor
  if the selected appointment is valid.
- **Saving/finalizing:** retain all entered fields and prescription rows. Show progress
  on the relevant action; prevent duplicate submit. Do not skeleton or remount the form.
- **Success/conflict/error:** update from the response; show validation beside the
  relevant field; preserve draft values after API/server errors; handle a state conflict
  as a distinct state and require an explicit user recovery action.
- **Authorization:** only roles/appointments allowed by the route and service may expose
  record contents. ADMIN does not gain clinical record access by virtue of being ADMIN.

### 3.5 `/notifications` — notification center

- **Immediate:** title/description, filter tabs, refresh control, mark-all action slot,
  list frame, and pagination frame.
- **First load:** skeleton notification items matching the real item hierarchy (status,
  title, summary, timestamp, action). Keep filter tabs visible. Do not show the empty
  state until the request succeeds with zero items.
- **Filter/page load:** keep the selected filter visible. Skeleton the list for the new
  query; do not claim the old items match it.
- **Empty:** differentiate no notifications at all from no unread/read notifications
  under the selected filter. Keep filters and any navigation context.
- **Error:** show retry in the list region and preserve filter/page selection.
- **Mark read:** update only the affected item after success; show per-item in-flight
  state. Mark-all progress belongs to that action. Partial failure must not silently
  mark every item read in the UI.
- **Header notification entry/popover:** badge count is live data and gets a compact
  loading placeholder; popover frame and static labels can render immediately. Errors
  in the popover do not replace the page or shell.

### 3.6 `/users` — account administration (ADMIN)

- **Immediate:** heading, search/filter controls, role/status labels, table headers,
  action column, and pagination frame.
- **First load:** skeleton table body matching actual columns. Search text and selected
  filters remain stable while requests run.
- **Search/filter/page:** debounce search as currently specified; do not clear the typed
  query. Show skeleton rows only for the requested result set. Indicate zero filtered
  results separately from a genuinely empty account directory.
- **Error:** retain query/filter/page and allow retry. Never transform a failed role
  query into a zero count or empty-success state.
- **Role/status action:** preserve rows and show loading on the target row/action.
  Require the existing confirmation flow for consequential status changes. Apply the
  server response after success; show conflict/error without losing the list state.
- **Privacy:** use only fields required for account administration; do not expose tokens,
  credentials, or unnecessary patient-sensitive fields in the table.

### 3.7 `/profile` — personal profile

- **Immediate:** page title, profile section headings, field labels, save/action regions,
  and security/notification/session section structure.
- **First load:** skeleton identity summary and each API-backed field value; never put
  skeletons in place of labels. If the endpoint has no value for an optional field,
  render the designed “not provided” state after success.
- **Error:** retain the profile frame and provide retry. Do not render empty editable
  values as if they were successfully loaded; avoid overwriting cached/input data after
  a failed fetch.
- **Editing/saving:** retain user input during submission and errors. Show save progress
  at the save action, not as a page-level skeleton. On success update values from the
  response.
- **Session/security:** distinguish session identity from profile API fields. A profile
  fetch failure must not imply the user is logged out.

### 3.8 `/health` — system health (ADMIN)

- **Immediate:** page heading/description, fixed service names, region/card names,
  status labels, and refresh control.
- **First load:** skeleton each live service status, version, aggregate status, and
  timestamp. Do not label missing status as healthy or down.
- **Refresh:** retain last successful health data while checking again and show the
  last-check timestamp. If refresh fails, keep the last result but label it stale and
  show the refresh error; if there is no prior result, show error with retry.
- **Partial response:** show received service statuses and mark missing services
  unknown/unavailable-to-report; do not infer an overall healthy result from a partial
  payload.
- **Authorization:** apply ADMIN route guard before displaying health details. Never
  show infrastructure secrets or internal connection strings.

### 3.9 `/auth` — management login

- **Immediate:** centered login form, brand, title, labels, and input controls. These
  are static and should not be skeletonized.
- **Submitting:** keep the form and entered values visible; loading on submit button and
  disable duplicate submission as defined by the auth flow.
- **Error:** show an accessible error region while preserving email and other safe
  inputs. Do not erase the form or use a skeleton for a failed login.
- **Session resolving/already authenticated:** use a compact session-resolution state
  only if needed to avoid flashing the wrong screen. Once known, show the authenticated
  card or route onward. `/auth` bypasses the authenticated app shell.

### 3.10 Other public and fallback routes

- `/` for unauthenticated visitors may render the clinic landing page after the session
  is confirmed unauthenticated. While session is unresolved, do not flicker between the
  landing page and role dashboard.
- `not-found` is a route-not-found state; API empty states belong to their page.
- Route-level `loading`/`error` boundaries are fallback states only. They must not hide
  a page’s own partial data or replace a local retry with a full navigation reset.

## 4. Cross-page component contract

| Component / region | Stable content | Dynamic content and state rule |
|---|---|---|
| Page header | Eyebrow, heading, descriptive text, known actions | Identity/personalized greeting waits for session; only skeleton a dynamic identity value if its placement is fixed. |
| Filter bar | Labels, controls, available static options, selected values | Result count is loaded data. Keep user-entered filters through fetch/error. |
| Table | Caption, column names, role-specific column structure | Skeleton body on initial/new-query load; retain rows during background refresh; responsive horizontal scroll/card reflow per contract. |
| List/card collection | Section title, list frame, stable control placement | Skeleton items match actual list item structure; empty/error replace only the collection. |
| Summary/count | Metric label and explanatory context | Skeleton each value; never default missing API data to zero. Do not use decorative metric cards. |
| Status badge | Badge geometry/semantic label slot | Render only from authoritative value; unknown/loading has a separate neutral/skeleton state. |
| Name resolved from ID | Cell label/column structure | Skeleton only the name while resolving. On lookup error, show safe unresolved state; never leak raw UUID. |
| Pagination | Region placement and accessible control frame | Page/total comes from response metadata. Disable or show busy while a query is pending; do not invent total pages. |
| Dialog | Dialog structure and action labels | Keep dialog state and entered values; local action loading. Escape/focus behavior follows UI contract. |
| Toast/alert | Live region placement | Announce completed result or actionable error; do not use toast as the only record of a consequential server-state change. |

## 5. State matrix required for each data region

For every independently loaded region, define these states in implementation/review:

| State | Required rendering behavior |
|---|---|
| Initial loading | Stable frame plus shape-matched skeleton; never empty-looking. |
| Populated | Real API data with role-correct columns/actions and safe labels. |
| Empty first-run | Explain the absent data and the next useful action; retain the page frame. |
| Empty filtered | Identify current query/filter context and offer clear/change-filter action. |
| Partial | Show successful regions, skeleton only pending regions, and clearly distinguish pending values from zero/unknown. |
| Error without prior data | Error in the affected region with retry/navigation as appropriate. |
| Error with prior data | Preserve the last result, mark it stale, and expose the refresh error/retry. |
| Refreshing | Keep current data visible and mark the affected region busy. |
| Permission denied | Do not render protected data; use the route guard/denied state. |
| Mutation in flight | Preserve context; show progress only on the affected control/row. |
| Conflict | Preserve context and provide explicit refresh/recovery; do not downgrade to generic error. |
| Offline/stale, where supported | Label data freshness; never present cached values as current without a timestamp/state. |
| Edge/over-limit | Respect API pagination/limits and retain visible filters; no silent truncation that looks complete. |

## 6. Review checklist

- [ ] Stable page frame, headings, filter labels, and table headers appear without
  waiting for unrelated API values.
- [ ] Each skeleton matches the exact region and role-specific populated structure.
- [ ] Initial load is visually different from empty, error, permission-denied, and stale.
- [ ] Refresh does not unnecessarily erase successful data or user input.
- [ ] Query changes cannot leave results falsely associated with new filters.
- [ ] Independent requests have independent loading/error handling.
- [ ] Missing values are not presented as zero, healthy, available, or successful.
- [ ] Partial lookups do not block otherwise usable data.
- [ ] Dynamic regions expose accessible busy/loading semantics without noisy announcements.
- [ ] No direct service/database access, fabricated fixtures, raw IDs, or unauthorized
  values appear in the loading or fallback UI.
- [ ] Layout remains usable at the web contract’s desktop, tablet, and narrow breakpoints.
