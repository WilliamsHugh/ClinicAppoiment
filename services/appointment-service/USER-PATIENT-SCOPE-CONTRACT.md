# M2-USER-001: User -> Doctor/Appointment patient-scope contract

TV3 provider implementation on PR #14; TV2 owns the User Service caller. This
contract is ready for TV2 and TV1 review, but is **not integrated or accepted**
until both caller and runtime secret configuration are deployed together.

The public entry point remains `Frontend -> Gateway -> User Service`.
User Service checks a DOCTOR's access to a patient with two backend-only HTTP
reads. It first resolves the Doctor profile and skips the Appointment request
when the profile is missing or inactive. It must not forge Gateway identity
headers, read the Doctor/Appointment databases, or call the Medical Record
verification route.

| Provider | Request from User Service | Backend-only credential | `200 data` |
| --- | --- | --- | --- |
| Doctor | `GET /internal/v1/doctors/by-user/{userId}` | `DOCTOR_USER_INTERNAL_API_TOKEN` | `{ id: doctorId, userId, isActive }` |
| Appointment | `GET /internal/v1/appointments/{appointmentId}/patient-scope` | `APPOINTMENT_USER_INTERNAL_API_TOKEN` | `{ id: appointmentId, patientId, doctorId, status }` |

Both requests send `X-Internal-Token`, `Accept: application/json`, reject
redirects, and may forward a validated `X-Request-Id`.
Credentials must be distinct 32+ UTF-8 byte secrets, including from
`DOCTOR_INTERNAL_API_TOKEN`, `APPOINTMENT_RECORD_INTERNAL_API_TOKEN`, and the
reverse-direction `USER_DOCTOR_INTERNAL_API_TOKEN` and
`USER_APPOINTMENT_INTERNAL_API_TOKEN`. They are never sent through Gateway or
to a frontend. Provider missing/reused credential fails closed (`503
INTERNAL_AUTH_NOT_CONFIGURED`); missing/wrong caller credential returns
`401 INTERNAL_AUTH_REQUIRED`.

Doctor's existing `by-user` route accepts its existing
`DOCTOR_INTERNAL_API_TOKEN` for Appointment/Medical Record and the separate
`DOCTOR_USER_INTERNAL_API_TOKEN` for User. Appointment's new `patient-scope`
route accepts only `APPOINTMENT_USER_INTERNAL_API_TOKEN`; the existing
Record-specific `verify-for-medical-record` route and
`APPOINTMENT_RECORD_INTERNAL_API_TOKEN` are unchanged. Doctor returns
`404 DOCTOR_NOT_FOUND` for an unknown User ID. Appointment returns
`404 APPOINTMENT_NOT_FOUND` for an unknown appointment. Invalid UUIDs return
`400 VALIDATION_ERROR`. Responses retain each service's standard
`{ success, data }` / `{ success: false, error: { code, message, details } }`
envelope. User must verify `doctor.userId === requestedUserId`, valid UUIDs,
`doctor.isActive === true`, `appointment.id === requestedAppointmentId`,
`appointment.doctorId === doctor.id`, and `appointment.status` is one of
`PENDING`, `CONFIRMED`, `CHECKED_IN`, or `COMPLETED` before using
`appointment.patientId`.
Missing, malformed, `401`, `503`, timeout or redirect responses must never
authorize access. Bound each request to at most four seconds; do not retry
these reads with a different caller credential.

The patient-scope route returns only appointment, patient and doctor IDs plus
the status, including terminal statuses so User can apply its policy.
`CANCELLED` and `NO_SHOW` do not grant access. This preserves the existing User
patient-scope policy while keeping Record's `verify-for-medical-record`
semantics unchanged: Record requires `CHECKED_IN` or `COMPLETED` and uses its
own token.

TV2 has implemented the caller on its local branch, and TV3 implements both
providers here. TV1 still needs to inject the two new secrets into Doctor and
Appointment in Compose/runtime and review the shared `docs/api-contract.md`.
A cross-service smoke through Gateway with distinct databases remains required
for acceptance.
