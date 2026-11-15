-- 002_m2_clinical_grants_and_finalization.sql

ALTER TABLE medical_record_service.medical_records
ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE medical_record_service.medical_records
ADD COLUMN IF NOT EXISTS appointment_completion TEXT NOT NULL DEFAULT 'NOT_REQUESTED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'medical_records_appointment_completion_check'
      AND conrelid = 'medical_record_service.medical_records'::regclass
  ) THEN
    ALTER TABLE medical_record_service.medical_records
    ADD CONSTRAINT medical_records_appointment_completion_check
    CHECK (appointment_completion IN ('NOT_REQUESTED', 'PENDING', 'COMPLETED'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS medical_record_service.clinical_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  doctor_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  appointment_id UUID NOT NULL,
  record_id UUID,
  access_mode TEXT NOT NULL CHECK (access_mode IN ('CURRENT_ENCOUNTER', 'AUTHORED_HISTORY')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_clinical_grants_doctor_session
ON medical_record_service.clinical_grants (doctor_id, session_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_clinical_grants_patient_appointment
ON medical_record_service.clinical_grants (patient_id, appointment_id);

CREATE TABLE IF NOT EXISTS medical_record_service.finalization_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL,
  record_id UUID,
  doctor_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  expected_version INT NOT NULL,
  content_digest TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finalization_contexts_doctor
ON medical_record_service.finalization_contexts (doctor_id, session_id, expires_at);

CREATE TABLE IF NOT EXISTS medical_record_service.consumed_proofs (
  proof_id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  record_id UUID NOT NULL,
  context_id UUID,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
