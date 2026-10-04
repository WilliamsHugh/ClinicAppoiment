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
5. User Service's outgoing doctor patient-scope check still calls Doctor's
   `by-user` and Appointment's `verify-for-medical-record` routes without
   service authentication. The latter is a Record-specific contract and must
   not be reused with Record's credential. TV1 and TV3 need a dedicated User
   caller contract before that public doctor patient-scope flow can pass the
   integrated service-auth smoke.

## Local verification

Run `npm ci`, `npm run lint --workspace @clinic/user-service`,
`npm run build --workspace @clinic/user-service`, and
`npm run test --workspace @clinic/user-service`. The unit tests use synthetic
fixtures and do not establish PostgreSQL or cross-service acceptance. TV1's
P0-07 smoke must run the merged tree with separate disposable service
databases and the agreed credentials.
