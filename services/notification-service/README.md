# Notification Service — M2-NOTIFY-001

Set the service variables in `.env.example` using a dedicated, disposable Notification database for verification.

```bash
node scripts/with-env.mjs services/notification-service/.env npm run db:migrate -w @clinic/notification-service
node scripts/with-env.mjs services/notification-service/.env npm run dev -w @clinic/notification-service
```

Migration `001_m2_notification_reminders` records a SHA-256 checksum in `notification_service.schema_migrations`. It upgrades the older schema in place, including backfilling event IDs into `processed_events`; it does not delete existing notifications. A changed checksum for an applied version fails; future schema changes need a new migration version.

For a disposable database already migrated, run `TEST_DATABASE_URL=<notify-test-url> npm run test -w @clinic/notification-service`. Without `TEST_DATABASE_URL`, the PostgreSQL integration tests are skipped. Event ingestion requires `NOTIFICATION_INTERNAL_API_TOKEN`; the reminder worker uses `APPOINTMENT_NOTIFICATION_INTERNAL_API_TOKEN` to verify current appointment context. `/health` includes reminder status counts. `FAILED` reminders remain available for operator investigation; manual retry policy is a P1 follow-up.

This branch depends on PR #14 (`M2-BOOKING-003`). The complete Gateway workflow is verified by `M2-INTEGRATION-001` after dependent branches merge.
