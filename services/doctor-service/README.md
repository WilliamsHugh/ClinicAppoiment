# Doctor Service

Doctor Service owns a separate PostgreSQL database (a separate Supabase project in the shared deployment). Within that database it owns the `doctor_service` schema. Its repository never queries another service's database.

## Local setup

From the repository root, set `DATABASE_URL` to the **Doctor project** PostgreSQL connection string and `DATABASE_SSL=true` for Supabase, then run:

```bash
npm install
npm run db:migrate -w @clinic/doctor-service
npm run dev:doctor
```

The single Doctor migration is `infrastructure/supabase/doctor-service/schema.sql`. The command above reads that same file; run it only against the Doctor database. The script is rerunnable and adds constraints and indexes to the earlier Doctor scaffold when present. The root `.env.example` uses `DOCTOR_DATABASE_URL` for Docker Compose, which passes it to Doctor Service as `DATABASE_URL`. Do not put a real connection string in Git.

`USER_SERVICE_URL` defaults to `http://localhost:3001`. Doctor creation reads User Service's `GET /api/v1/users/{userId}` and requires an active account with role `DOCTOR`. The User Service team owns that API and the account lifecycle.

Docker Compose already passes the Doctor database URL. Its owner still needs to pass `USER_SERVICE_URL=http://user-service:3001` for the account lookup; the localhost default is only for running services directly on the host.

Doctor public routes require `X-User-Id` and `X-Role` supplied by the authenticated Gateway; clients must call Gateway, not this service directly. `/health`, `/docs`, and `/openapi.json` are available on the internal service port.

## Appointment integration pending on the Booking branch

`APPOINTMENT_SERVICE_URL` enables a read-only internal call to `GET /internal/v1/appointments/occupied-slots`. The response must be `{ "success": true, "data": [{ "startAt": "...Z", "endAt": "...Z" }] }`, with active future appointments only and no patient data. The Booking branch owns this endpoint. Until it exists, available-slots returns candidate schedule slots after time off is removed; it cannot guarantee they are unbooked. Creating appointments remains the final decision in Appointment Service.

Editing a schedule, adding/editing time off, or deactivating a doctor requires the occupancy check. These writes fail closed with `503` when `APPOINTMENT_SERVICE_URL` is unset, or `502` when the endpoint is unavailable. A `409 SCHEDULE_CONFLICT_WITH_APPOINTMENTS` response contains the number of future bookings that would become invalid. This cross-service check needs coordination with Booking for concurrent booking versus schedule changes before production use.

Gateway routing for `GET/POST /api/v1/doctors/{doctorId}/time-offs` and `PATCH /api/v1/time-offs/{timeOffId}` remains with the Gateway owner. The Doctor branch implements the service routes and documents them in `docs/api-contract.md` for review.

## Checks

```bash
npm run lint -w @clinic/doctor-service
npm run test -w @clinic/doctor-service
npm run build -w @clinic/doctor-service
```
