# M2-USER-001 / P0-06: User internal lookup contract (TV2 proposal)

Base: `main` at `8ca4ee0891746e6398d1770677441f920f5e1965` (PR #9 merged). Branch:
`fix/m2-user-001-internal-lookup-auth`. Provider owner: TV2. Caller owners: TV1
(Gateway), TV3 (Doctor and Appointment), TV4 (Medical Record). The provider and
caller owners must review the credential rollout before merging this branch.

These routes are available only on the User Service internal address. The API
Gateway must not proxy `/internal/v1/*`. Every request sends `X-Internal-Token`;
tokens are distinct random secrets of at least 32 UTF-8 bytes, configured only in
backend environments. User Service returns `401 INTERNAL_AUTH_REQUIRED` for a
missing, wrong or unauthorized caller token, and `503
INTERNAL_AUTH_NOT_CONFIGURED` for missing, weak or duplicate provider secrets.
No token or patient profile fields are logged or returned by Doctor/patient lookups.

| Caller | User route | Provider env | Response `data` |
| --- | --- | --- | --- |
| Gateway | `GET /internal/v1/auth/verify` with `Authorization: Bearer <access token>` | `USER_GATEWAY_INTERNAL_API_TOKEN` | `{ id, authUserId, role, status }` |
| Doctor | `GET /internal/v1/users/{userId}/doctor-eligibility` | `USER_DOCTOR_INTERNAL_API_TOKEN` | `{ id, role, status }` |
| Appointment | `GET /internal/v1/patients/by-user/{userId}` and `GET /internal/v1/patients/{patientId}` | `USER_APPOINTMENT_INTERNAL_API_TOKEN` | `{ id, userId }` |
| Medical Record | Same two patient routes | `USER_RECORD_INTERNAL_API_TOKEN` | `{ id, userId }` |

`id` in Doctor eligibility and `userId` in patient responses are **application
User IDs**, not Supabase Auth IDs. `id` in patient responses is a **Patient profile
ID**. Doctor decides whether `role === "DOCTOR"` and `status === "ACTIVE"` are
eligible; User reports authoritative values. Patient lookup by User ID includes
only a current `PATIENT` role. A role change retains the patient profile for
historical references; lookup by Patient ID still resolves it. Both patient
routes return only the two IDs, with no contact, insurance or clinical fields.

Invalid UUIDs return `400 VALIDATION_ERROR`; unknown IDs return `404
USER_NOT_FOUND` or `404 PATIENT_NOT_FOUND`. Responses use the existing
`{ success, data }` / `{ success, error: { code, message, details } }`
envelope. Caller timeout remains bounded to its own service policy. A caller
must treat `401`, `503`, timeout and malformed payload as dependency failure,
not as a valid user/patient or an empty schedule.

## Integration dependencies

1. TV1 sends `USER_GATEWAY_INTERNAL_API_TOKEN` from Gateway to User verify,
   prevents public proxy access to internal paths and overwrites client identity
   headers. This branch protects verify immediately, so merging without TV1's
   caller change would block all authenticated Gateway requests.
2. TV3 sends `USER_DOCTOR_INTERNAL_API_TOKEN` from Doctor eligibility calls and
   `USER_APPOINTMENT_INTERNAL_API_TOKEN` from every Appointment patient lookup,
   including outbox/worker paths. TV3 validates the minimal DTO and fails closed.
3. TV4 sends `USER_RECORD_INTERNAL_API_TOKEN` from every Medical Record patient
   lookup. Notification currently has no User lookup in the inspected branch;
   any future lookup needs a separate caller credential and provider review.
4. TV1 coordinates runtime secret injection/Compose and the shared
   `docs/api-contract.md` update. These files are outside TV2 ownership.
5. The User-to-Doctor and User-to-Appointment patient-scope contract below is
   implemented in local TV2 and TV3 branches. It is not integrated or accepted;
   TV1 still needs to wire runtime secrets and review the shared caller matrix.

## User -> Doctor / Appointment patient scope (M2-USER-001)

This lookup is used only when a public `DOCTOR` asks User Service for a patient
list or patient detail with `appointmentId`. Gateway supplies the authenticated
doctor's application User ID and a request ID. User validates the appointment
belongs to the doctor's active professional profile before returning patient
data. Neither internal route is exposed through Gateway.

| Caller -> provider | Method/path | Shared backend secret | `200 data` |
| --- | --- | --- | --- |
| User -> Doctor | `GET /internal/v1/doctors/by-user/{userId}` | `DOCTOR_USER_INTERNAL_API_TOKEN` | `{ id: doctorId, userId, isActive }` |
| User -> Appointment | `GET /internal/v1/appointments/{id}/patient-scope` | `APPOINTMENT_USER_INTERNAL_API_TOKEN` | `{ id, patientId, doctorId, status }` |

The two secrets must differ from each other and from `USER_DOCTOR_INTERNAL_API_TOKEN`
(Doctor -> User), `USER_APPOINTMENT_INTERNAL_API_TOKEN` (Appointment -> User),
`DOCTOR_INTERNAL_API_TOKEN` (other Doctor callers), and
`APPOINTMENT_RECORD_INTERNAL_API_TOKEN` (Record -> Appointment). Each is a
distinct random secret of at least 32 UTF-8 bytes. User sends it in
`X-Internal-Token`; Doctor and Appointment compare it before reading data.
User sends `Accept: application/json`, rejects redirects and forwards a
validated `X-Request-Id` (`[A-Za-z0-9-]{1,80}`) when present. Each request has
a four-second timeout. Both providers use the standard success/error
envelope. Invalid UUID returns `400 VALIDATION_ERROR`; missing/wrong token
returns `401 INTERNAL_AUTH_REQUIRED`; missing/weak/reused provider secret
returns `503 INTERNAL_AUTH_NOT_CONFIGURED`; unknown User/appointment returns
`404 DOCTOR_NOT_FOUND` or `404 APPOINTMENT_NOT_FOUND`. Appointment returns no
patient demographics, booking reason, symptoms or clinical data.

Doctor's existing `by-user` route accepts `DOCTOR_INTERNAL_API_TOKEN` for its
Appointment/Medical Record callers and `DOCTOR_USER_INTERNAL_API_TOKEN` for
User. Appointment's new `patient-scope` route accepts only
`APPOINTMENT_USER_INTERNAL_API_TOKEN`; the Record-specific
`verify-for-medical-record` route and `APPOINTMENT_RECORD_INTERNAL_API_TOKEN`
remain separate.

User resolves Doctor first and skips Appointment when the doctor is missing or
inactive. It validates the returned IDs/status and allows access only when the
appointment matches the requested ID, its doctor ID matches the resolved doctor,
and status is `PENDING`, `CONFIRMED`, `CHECKED_IN`, or `COMPLETED`. `CANCELLED`
and `NO_SHOW` are outside scope. Missing doctor or appointment, inactive doctor,
different assigned doctor or excluded status returns public
`403 PATIENT_SCOPE_DENIED`. Missing/weak credentials, upstream `401`/`503`,
timeout, network failure, redirect or invalid/mismatched DTO returns public
`503 PATIENT_SCOPE_UNAVAILABLE`. Patient detail also requires the resolved
`patientId` to match the requested patient ID.

TV2 caller implementation is commit `622dda4`; TV3 provider implementation is
commit `c15e8f9`. The provider contract is also in
`services/appointment-service/USER-PATIENT-SCOPE-CONTRACT.md` on the TV3 branch.
Both commits are local and ready for integration review, not merged or accepted.
TV1 must inject both new secrets into the correct backend containers and review
the shared `docs/api-contract.md` caller matrix. Cross-service smoke through
Gateway with distinct databases remains required for acceptance.

## Local verification

Run `npm ci`, `npm run lint --workspace @clinic/user-service`,
`npm run build --workspace @clinic/user-service`, and
`npm run test --workspace @clinic/user-service`. The unit tests use synthetic
fixtures and do not establish PostgreSQL or cross-service acceptance. TV1's
P0-07 smoke must run the merged tree with separate disposable service
databases and the agreed credentials.
