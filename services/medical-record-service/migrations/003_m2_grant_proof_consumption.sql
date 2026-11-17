CREATE TABLE IF NOT EXISTS medical_record_service.consumed_grant_proofs (
  proof_id TEXT PRIMARY KEY,
  grant_id UUID NOT NULL REFERENCES medical_record_service.clinical_grants(id),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
