BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA IF NOT EXISTS appointment_service;

CREATE TABLE IF NOT EXISTS appointment_service.schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointment_service.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL,
  doctor_id UUID NOT NULL,
  specialty_id UUID,
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  idempotency_key TEXT,
  created_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointment_service.appointment_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointment_service.appointment_outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE appointment_service.appointment_outbox_events
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE TABLE IF NOT EXISTS appointment_service.appointment_completions (
  appointment_id UUID PRIMARY KEY REFERENCES appointment_service.appointments(id),
  record_id UUID NOT NULL UNIQUE,
  doctor_user_id UUID NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointment_service.idempotency_requests (
  actor_id UUID NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint JSONB NOT NULL,
  appointment_id UUID REFERENCES appointment_service.appointments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, operation, idempotency_key)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'appointment_service.appointments'::regclass AND conname = 'appointment_positive_interval') THEN
    ALTER TABLE appointment_service.appointments ADD CONSTRAINT appointment_positive_interval CHECK (scheduled_start_at < scheduled_end_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'appointment_service.appointments'::regclass AND conname = 'appointment_no_active_overlap') THEN
    ALTER TABLE appointment_service.appointments ADD CONSTRAINT appointment_no_active_overlap
      EXCLUDE USING gist (doctor_id WITH =, tstzrange(scheduled_start_at, scheduled_end_at, '[)') WITH &&)
      WHERE (status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'appointment_service.appointment_status_history'::regclass AND conname = 'appointment_history_owner_fk') THEN
    ALTER TABLE appointment_service.appointment_status_history ADD CONSTRAINT appointment_history_owner_fk
      FOREIGN KEY (appointment_id) REFERENCES appointment_service.appointments(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS appointment_patient_time_idx
  ON appointment_service.appointments (patient_id, scheduled_start_at, id);
CREATE INDEX IF NOT EXISTS appointment_doctor_time_idx
  ON appointment_service.appointments (doctor_id, scheduled_start_at, id);
CREATE INDEX IF NOT EXISTS appointment_outbox_pending_idx
  ON appointment_service.appointment_outbox_events (status, created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS appointment_outbox_due_idx
  ON appointment_service.appointment_outbox_events (next_attempt_at, created_at, id)
  WHERE status IN ('PENDING', 'PROCESSING');

-- Preserve retries for rows written by the old scaffold before dropping its global key index.
INSERT INTO appointment_service.idempotency_requests
  (actor_id, operation, idempotency_key, request_fingerprint, appointment_id)
SELECT created_by, 'CREATE', idempotency_key,
  jsonb_build_object(
    'patientId', patient_id::text, 'doctorId', doctor_id::text,
    'specialtyId', specialty_id::text,
    'scheduledStartAt', to_char(scheduled_start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'scheduledEndAt', to_char(scheduled_end_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'reason', reason), id
FROM appointment_service.appointments WHERE idempotency_key IS NOT NULL
ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING;

DROP INDEX IF EXISTS appointment_service.unique_active_doctor_slot;
DROP INDEX IF EXISTS appointment_service.unique_appointment_idempotency_key;

INSERT INTO appointment_service.schema_migrations (version)
VALUES ('001_booking_persistence') ON CONFLICT (version) DO NOTHING;
INSERT INTO appointment_service.schema_migrations (version)
VALUES ('002_durable_events_and_internal_api') ON CONFLICT (version) DO NOTHING;
COMMIT;
