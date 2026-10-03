# Appointment Service — M2-BOOKING-001 (TV3)

The public request path is Gateway → Appointment Service → its own PostgreSQL database. Patient and Doctor references are checked through the owning services' internal HTTP APIs; this service never reads their databases.

Copy `.env.example` to `.env`, set `DATABASE_URL` to the Appointment database, and set the Doctor internal token. Run `npm run db:migrate:appointment` at the repository root before `npm run dev:appointment`. The migration is repeatable and upgrades the scaffold tables without deleting appointments. It fails if legacy rows violate the new positive-interval or active-overlap constraints; resolve those rows explicitly before retrying.

The migration uses `btree_gist` and a GiST exclusion constraint on half-open ranges `[scheduled_start_at, scheduled_end_at)`. `PENDING`, `CONFIRMED`, and `CHECKED_IN` reserve the doctor; adjacent intervals and terminal rows do not conflict. Both creation and rescheduling use transactions. Creation stores the appointment, initial history, idempotency claim, and outbox event in one transaction. The idempotency key is scoped to `(actor_id, operation, key)` and the normalized booking payload; an exact retry returns the original appointment, while a changed payload returns `409`.

`GET /health` checks the database and migration version. The list endpoint filters and paginates in SQL with stable `(scheduled_start_at, id)` ordering. The internal occupancy endpoint reads the same persisted active appointments.

Run unit tests with `npm test -w @clinic/appointment-service`. To run PostgreSQL integration tests, provide a **disposable** database and set `APPOINTMENT_TEST_DATABASE_URL` plus `APPOINTMENT_TEST_DATABASE_DISPOSABLE=1`. Those tests apply the migration twice and truncate Appointment tables before testing concurrent overlapping creates, replay after a new connection pool, history, occupancy, and reschedule rollback. They are skipped when no disposable test database is configured.

The outbox writer is included so booking mutations are atomic. Processing, retry, and consumer delivery belong to M2-BOOKING-003. Authorization and the full state-machine audit belong to M2-BOOKING-002.
