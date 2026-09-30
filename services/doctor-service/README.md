# Doctor Service

Doctor Service owns a separate PostgreSQL database (a separate Supabase project in the shared deployment). Within that database it owns the `doctor_service` schema. Its repository never queries another service's database.

## Local setup

Copy `services/doctor-service/.env.example` to the ignored `services/doctor-service/.env` file. Set `DATABASE_URL` to the **Doctor project** PostgreSQL connection string and configure SSL for that database. From the repository root, run:

```bash
npm install
npm run db:migrate:doctor
npm run dev:doctor
```

Both root scripts load `services/doctor-service/.env` on Windows and Unix. The single Doctor migration is `infrastructure/supabase/doctor-service/schema.sql`; run it only against the Doctor database. The script is rerunnable and adds constraints and indexes to the earlier Doctor scaffold when present. The root `.env.example` uses `DOCTOR_DATABASE_URL` for Docker Compose, which passes it to Doctor Service as `DATABASE_URL`. Do not put a real connection string in Git.

`USER_SERVICE_URL` defaults to `http://localhost:3001`. Doctor creation reads User Service's internal `GET /internal/v1/users/{userId}/doctor-eligibility` and requires an active account with role `DOCTOR`. The User Service team owns that API and the account lifecycle.

Docker Compose passes `USER_SERVICE_URL=http://user-service:3001` and `APPOINTMENT_SERVICE_URL=http://appointment-service:3003` on its private network. Doctor Service waits for User Service health at startup. It cannot wait for Appointment Service health because Appointment Service already waits for Doctor Service; its calls to Appointment Service happen only when needed.

Doctor public routes require `X-User-Id` and `X-Role` supplied by the authenticated Gateway; clients must call Gateway, not this service directly. `/health`, `/docs`, and `/openapi.json` are available on the internal service port.

## Appointment integration

`APPOINTMENT_SERVICE_URL` enables a read-only internal call to `GET /internal/v1/appointments/occupied-slots`. The response is `{ "success": true, "data": [{ "startAt": "...Z", "endAt": "...Z" }] }`, with active future appointments only and no patient data. The current Appointment Service route reads its in-memory repository; Booking must connect it to persistent appointments before production use. Without `APPOINTMENT_SERVICE_URL`, available-slots returns candidate schedule slots after time off is removed and cannot guarantee they are unbooked. Creating appointments remains the final decision in Appointment Service.

Editing a schedule, adding/editing time off, or deactivating a doctor requires the occupancy check. These writes fail closed with `503` when `APPOINTMENT_SERVICE_URL` is unset, or `502` when the endpoint is unavailable. A `409 SCHEDULE_CONFLICT_WITH_APPOINTMENTS` response contains the number of future bookings that would become invalid. This cross-service check needs coordination with Booking for concurrent booking versus schedule changes before production use.

Gateway forwards `GET/POST /api/v1/doctors/{doctorId}/time-offs` and `PATCH /api/v1/doctors/{doctorId}/time-offs/{timeOffId}` through its existing `/api/v1/doctors` prefix. The update route verifies that the time off belongs to the doctor in the path.

## Checks

```bash
npm run lint -w @clinic/doctor-service
npm run test -w @clinic/doctor-service
npm run build -w @clinic/doctor-service
```
