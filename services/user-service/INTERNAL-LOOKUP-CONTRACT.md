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
5. The User-to-Doctor and User-to-Appointment patient-scope caller contract
   below needs TV3 provider review and implementation. User does not reuse
   Medical Record's verification route or credential.

## User -> Doctor / Appointment patient scope (TV2 proposal; TV3 provider PLANNED)

This lookup is used only when a public `DOCTOR` asks User Service for a patient
list or patient detail with `appointmentId`. Gateway supplies the authenticated
doctor's application User ID and a request ID. User validates the appointment
belongs to the doctor's active professional profile before returning patient
data. Neither internal route is exposed through Gateway.

| Caller -> provider | Method/path | Shared backend secret | `200 data` |
| --- | --- | --- | --- |
| User -> Doctor | `GET /internal/v1/doctors/by-user/{doctorUserId}` (existing route; User credential support PLANNED) | `DOCTOR_USER_INTERNAL_API_TOKEN` | `{ id: doctorId, userId: doctorUserId, isActive: boolean }` |
| User -> Appointment | `GET /internal/v1/appointments/{appointmentId}/patient-scope` (new route PLANNED) | `APPOINTMENT_USER_INTERNAL_API_TOKEN` | `{ id: appointmentId, patientId, doctorId, status }` |

The two secrets must differ from each other and from `USER_DOCTOR_INTERNAL_API_TOKEN`
(Doctor -> User), `DOCTOR_INTERNAL_API_TOKEN` (other Doctor callers), and
`APPOINTMENT_RECORD_INTERNAL_API_TOKEN` (Record -> Appointment). Each is a
distinct random secret of at least 32 UTF-8 bytes. User sends it in
`X-Internal-Token`; Doctor and Appointment compare it before reading data.
User forwards a valid `X-Request-Id` (`[A-Za-z0-9-]{1,80}`), sends
`Accept: application/json`, rejects redirects and uses a four-second timeout
per call. Both providers use the standard success/error envelope. They return
`400 VALIDATION_ERROR` for malformed UUID, `401 INTERNAL_AUTH_REQUIRED` for
missing/wrong token, `404` for unknown ID and `503` for dependency/database
failure. The Appointment route returns no patient demographics, booking reason,
symptoms or clinical data.

TV3 local commit `093d061` already sends `USER_DOCTOR_INTERNAL_API_TOKEN`
(Doctor -> User) and `USER_APPOINTMENT_INTERNAL_API_TOKEN` (Appointment ->
User). Those are the reverse direction and do not authenticate User to either
provider. The two new secrets above must be configured independently.

User first resolves Doctor. If the doctor is absent or inactive, access is
denied without querying Appointment. User then checks that the appointment ID
matches the requested ID, its doctor ID matches the resolved doctor, and its
status is one of `PENDING`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`. `CANCELLED`
and `NO_SHOW` do not grant access. A missing Doctor or Appointment, inactive
doctor, different assigned doctor, or excluded status produces the existing
public `403 PATIENT_SCOPE_DENIED`. A missing/weak credential, upstream `401`
or `5xx`, timeout, network error, or malformed/mismatched DTO produces public
`503 PATIENT_SCOPE_UNAVAILABLE`. Patient detail also checks that the resolved
`patientId` equals the requested patient ID.

TV3 must add `DOCTOR_USER_INTERNAL_API_TOKEN` only to Doctor's `by-user`
route and add the dedicated Appointment `patient-scope` route guarded by
`APPOINTMENT_USER_INTERNAL_API_TOKEN`, with OpenAPI/env/test for missing and
wrong token and minimal DTO. Do not grant User the Record credential. TV1 must
review the caller matrix and inject both secrets into the appropriate backend
containers. Until TV3 implements these provider changes, User's public doctor
patient-scope path returns `503` when the protected provider rejects the call;
this contract is not yet accepted.

## Local verification

Run `npm ci`, `npm run lint --workspace @clinic/user-service`,
`npm run build --workspace @clinic/user-service`, and
`npm run test --workspace @clinic/user-service`. The unit tests use synthetic
fixtures and do not establish PostgreSQL or cross-service acceptance. TV1's
P0-07 smoke must run the merged tree with separate disposable service
databases and the agreed credentials.
