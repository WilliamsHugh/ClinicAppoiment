# Medical Record Service — M2-RECORD-001

Set the service variables in `.env.example` using a dedicated, disposable Record database for verification. Do not use a shared User, Doctor or Appointment database.

```bash
node scripts/with-env.mjs services/medical-record-service/.env npm run db:migrate -w @clinic/medical-record-service
node scripts/with-env.mjs services/medical-record-service/.env npm run dev -w @clinic/medical-record-service
```

Migration `001_m2_record_completion_outbox` records a SHA-256 checksum in `medical_record_service.schema_migrations`. It applies the idempotent schema to a fresh database or an older Record schema without deleting records. A changed checksum for an applied version fails; future schema changes need a new migration version.

For a disposable database already migrated, run `TEST_DATABASE_URL=<record-test-url> npm run test -w @clinic/medical-record-service`. Without `TEST_DATABASE_URL`, the PostgreSQL integration test is skipped. Final records queue `appointment.complete` with the record ID; the outbox sends the patient notification only after that callback succeeds. `FAILED` outbox rows and counts are visible through the Record database and `/health`. Manual retry policy remains an operational P1 follow-up.

This branch depends on PR #14 (`M2-BOOKING-003`) and the User/Doctor internal caller policy. The complete Gateway workflow is verified by `M2-INTEGRATION-001` after dependent branches merge.
