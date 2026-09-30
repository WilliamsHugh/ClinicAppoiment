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

Generate a random secret of at least 32 bytes, for example with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Set `DOCTOR_INTERNAL_API_TOKEN` to that same value in the ignored Doctor and Appointment service `.env` files for local runs, or in the ignored root `.env` for Compose. `npm run dev:appointment` loads its service `.env`. Doctor Service refuses to start without a sufficiently long token. Keep it out of frontend configuration and Git.

`USER_SERVICE_URL` defaults to `http://localhost:3001`. Doctor creation reads User Service's internal `GET /internal/v1/users/{userId}/doctor-eligibility` and requires an active account with role `DOCTOR`. The User Service team owns that API and the account lifecycle.

Docker Compose passes `USER_SERVICE_URL=http://user-service:3001` and `APPOINTMENT_SERVICE_URL=http://appointment-service:3003` on its private network. Doctor Service waits for User Service health at startup. It cannot wait for Appointment Service health because Appointment Service already waits for Doctor Service; its calls to Appointment Service happen only when needed.

Doctor public routes require `X-User-Id` and `X-Role` supplied by the authenticated Gateway; clients must call Gateway, not this service directly. `/health`, `/docs`, and `/openapi.json` are available on the internal service port.

`POST /internal/v1/doctors/verify-slot` requires the Appointment Service to send `X-Internal-Token`; missing or incorrect credentials return `401 INTERNAL_AUTH_REQUIRED`. Gateway never routes `/internal/v1/*` and strips this header from public requests. Standard Compose only exposes Doctor Service inside its private network; the debug override binds its port to `127.0.0.1`. The `/health` endpoint returns `503 DATABASE_UNAVAILABLE` if the Doctor database cannot be queried.

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

## Live smoke test through Gateway

Use a dedicated **test** Doctor database and fresh active User accounts: one ADMIN, two
DOCTOR accounts not yet linked to Doctor profiles, and one PATIENT with a patient profile.
Start User, Appointment, Doctor and Gateway with their private `.env` files. Doctor and
Appointment must share `DOCTOR_INTERNAL_API_TOKEN`; Doctor must point to the running
User and Appointment services. Run the Doctor migration twice to check that it is
rerunnable before testing the public API:

```bash
npm run db:migrate:doctor
npm run db:migrate:doctor
```

Provide raw access tokens through environment variables (without a `Bearer ` prefix):
`SMOKE_ADMIN_TOKEN`, `SMOKE_DOCTOR_TOKEN`, `SMOKE_OTHER_DOCTOR_TOKEN`, and
`SMOKE_PATIENT_TOKEN`. `SMOKE_GATEWAY_URL` defaults to `http://localhost:8080`.
An ignored `.env.smoke` file at the repository root can hold these values; run it with
`node --env-file=.env.smoke scripts/smoke-doctor.mjs`. Alternatively, export the variables
in the shell and run `npm run smoke:doctor`. Never commit tokens or database URLs.

The smoke command creates specialties, two Doctor profiles, a schedule, a time off and
an appointment through Gateway. It checks patient search/detail/slots, Doctor ownership,
User eligibility, Appointment occupancy, and `409` responses that leave Doctor data
unchanged. Doctor test records remain in the isolated database; the current Appointment
repository is in-memory, so its test appointment lasts only for that service process.
Stop Appointment Service separately to verify dependent schedule/time-off writes return
`502`/`503` without changing persisted Doctor data, then restart it; the automated
smoke command does not stop services or alter their network settings.
