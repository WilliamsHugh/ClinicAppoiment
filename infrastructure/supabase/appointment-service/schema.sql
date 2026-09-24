CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS appointment_service;

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

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_doctor_slot
ON appointment_service.appointments (doctor_id, scheduled_start_at)
WHERE status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN');

CREATE UNIQUE INDEX IF NOT EXISTS unique_appointment_idempotency_key
ON appointment_service.appointments (idempotency_key)
WHERE idempotency_key IS NOT NULL;

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
