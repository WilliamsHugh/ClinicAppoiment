-- 003_m2_idempotency_requests.sql

CREATE TABLE IF NOT EXISTS medical_record_service.idempotency_requests (
  actor_id UUID NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint JSONB NOT NULL,
  record_id UUID REFERENCES medical_record_service.medical_records(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_medical_record_idempotency_actor
ON medical_record_service.idempotency_requests (actor_id, operation, idempotency_key);
