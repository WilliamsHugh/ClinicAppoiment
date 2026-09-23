CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS medical_record_service;

CREATE TABLE IF NOT EXISTS medical_record_service.medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  doctor_id UUID NOT NULL,
  symptoms TEXT,
  diagnosis TEXT,
  notes TEXT,
  treatment_plan TEXT,
  prescription JSONB,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINAL')),
  created_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE medical_record_service.medical_records ALTER COLUMN status SET DEFAULT 'DRAFT';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'medical_records_status_check'
      AND conrelid = 'medical_record_service.medical_records'::regclass
  ) THEN
    ALTER TABLE medical_record_service.medical_records
    ADD CONSTRAINT medical_records_status_check CHECK (status IN ('DRAFT', 'FINAL'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS unique_medical_record_appointment
ON medical_record_service.medical_records (appointment_id)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS medical_record_service.medical_record_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_record_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  action TEXT NOT NULL,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medical_record_service.outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT')),
  retry_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
