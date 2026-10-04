# M2-BOOKING-003: Appointment ↔ Medical Record / Notification contract

This is the proposed integration contract for TV3 and TV4. The Appointment side is implemented on `feat/m2-booking-003-durable-events-and-internal-api`; TV4 must update its two service callers/receivers before cross-service acceptance.

## Authentication and deployment

All calls use `X-Internal-Token` with a distinct random secret of at least 32 UTF-8 bytes per trust boundary. Appointment rejects missing, weak, or mismatched credentials with `401 INTERNAL_AUTH_REQUIRED` before reading appointment data. The service-specific variables are:

| Request | Shared variable |
| --- | --- |
| Doctor → Appointment `occupied-slots` | `DOCTOR_INTERNAL_API_TOKEN` |
| Medical Record → Appointment `verify-for-medical-record` and `complete-from-record` | `APPOINTMENT_RECORD_INTERNAL_API_TOKEN` |
| Notification → Appointment `reminder-context` | `APPOINTMENT_NOTIFICATION_INTERNAL_API_TOKEN` |
| Appointment → Notification event ingestion | `NOTIFICATION_INTERNAL_API_TOKEN` |

TV4 must verify the inbound token on Notification `POST /internal/v1/notifications` and Medical Record `GET /internal/v1/medical-records/by-appointment/{appointmentId}`. Appointment already sends both tokens. The Medical Record lookup should return only `id`, `appointmentId`, `patientId`, `doctorId`, `status`, `createdBy`, and `updatedBy`; clinical text is not needed by Appointment.
Medical Record must also send `NOTIFICATION_INTERNAL_API_TOKEN` when publishing its own medical-record events to Notification.

## Completion after a final record

Medical Record sends `POST /internal/v1/appointments/{appointmentId}/complete-from-record` with `X-Internal-Token: <APPOINTMENT_RECORD_INTERNAL_API_TOKEN>` and JSON `{ "recordId": "<uuid>" }`. The callback must be emitted only after the final record commits. Its outbox event must contain `recordId`; the current Medical Record scaffold only contains `appointmentId`, `doctorId`, and `doctorUserId` and still calls the old public PATCH endpoint with forged actor headers. TV4 must change that caller. The old public PATCH endpoint now returns `409 MEDICAL_RECORD_REQUIRED` for a doctor.

Appointment checks that its booking is `CHECKED_IN`, reads the final record by appointment ID from Medical Record, checks the record ID, patient ID, doctor ID and final status, and checks the record actor against Doctor Service. It commits `COMPLETED`, a completion-to-record mapping, status history, and an outbox event in one database transaction. Exact callback replay returns `200` with `{ id, status: "COMPLETED", recordId }`; a different record for an already completed booking returns `409`. A mismatched or non-final record returns `422`; an unavailable dependency returns `503`. No frontend actor header can complete a booking.

Medical Record's `GET /internal/v1/appointments/{id}/verify-for-medical-record` response is `{ success: true, data: { valid, appointment: { id, patientId, doctorId, status } } }`, with `valid` true only for `CHECKED_IN` or `COMPLETED`.

## Notifications and reminders

Appointment writes an event in the same transaction as every booking change. Its worker leases outbox rows with `FOR UPDATE SKIP LOCKED`, retries with exponential backoff, reclaims expired leases after restart, and sends the persisted outbox UUID as `eventId`. Notification must continue deduplicating by `eventId`. Booking requests succeed when Notification is unavailable; the event remains pending. The `/health` response exposes outbox counts including `FAILED`; an operator can inspect failures after retry exhaustion.

The dispatched types are `appointment.created`, `appointment.confirmed`, `appointment.rescheduled`, `appointment.cancelled`, and `appointment.checked_in`, matching Notification's current accepted types. `appointment.completed` and `appointment.no_show` remain internal audit events and are marked processed without a Notification call. To check a reminder at send time, Notification calls `GET /internal/v1/appointments/{id}/reminder-context` with its token. It receives only `{ id, patientId, status, scheduledStartAt }` and should send only while status is `CONFIRMED` and the scheduled time still matches its reminder. The current Notification scaffold instead calls the protected public appointment detail route without an actor; TV4 must change this caller.

Deployment order: migrate Appointment schema version `002_durable_events_and_internal_api`, set all service credentials, deploy compatible TV4 callers/receivers, then enable cross-service acceptance. Acceptance should cover a final-record callback replay, wrong/missing token, Notification outage and recovery, a worker restart with an expired lease, and two workers claiming concurrently.
