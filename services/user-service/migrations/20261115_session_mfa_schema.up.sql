-- Migration UP: Session and MFA tables for User Service
CREATE SCHEMA IF NOT EXISTS user_service;

CREATE TABLE IF NOT EXISTS user_service.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_service.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('PATIENT', 'DOCTOR', 'STAFF', 'ADMIN')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PENDING_MFA', 'LOCKED', 'EXPIRED', 'REVOKED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idle_expires_at TIMESTAMPTZ,
  absolute_expires_at TIMESTAMPTZ,
  lock_at TIMESTAMPTZ,
  mfa_state TEXT NOT NULL DEFAULT 'NONE' CHECK (mfa_state IN ('NONE', 'PENDING', 'VERIFIED')),
  session_version INTEGER NOT NULL DEFAULT 1,
  refresh_token_hash TEXT,
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_service.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON user_service.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_idle_expires_at ON user_service.sessions(idle_expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_absolute_expires_at ON user_service.sessions(absolute_expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token_hash ON user_service.sessions(refresh_token_hash);

CREATE TABLE IF NOT EXISTS user_service.mfa_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_service.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'totp' CHECK (type IN ('totp')),
  status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'verified')),
  secret_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_factors_user_id ON user_service.mfa_factors(user_id);

CREATE TABLE IF NOT EXISTS user_service.mfa_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factor_id UUID NOT NULL REFERENCES user_service.mfa_factors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_service.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES user_service.sessions(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('ENROLL_TOTP', 'OPEN_CLINICAL_RECORDS', 'FINALIZE_MEDICAL_RECORD', 'STAFF_ADMIN_LOGIN', 'UNLOCK_SESSION', 'AUTHORIZE_SENSITIVE_OPERATION')),
  context JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user_id ON user_service.mfa_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_session_id ON user_service.mfa_challenges(session_id);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires_at ON user_service.mfa_challenges(expires_at);

CREATE TABLE IF NOT EXISTS user_service.mfa_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_service.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES user_service.sessions(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES user_service.mfa_challenges(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('OPEN_CLINICAL_RECORDS', 'FINALIZE_MEDICAL_RECORD', 'STAFF_ADMIN_LOGIN', 'UNLOCK_SESSION', 'AUTHORIZE_SENSITIVE_OPERATION')),
  context JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_proofs_user_session ON user_service.mfa_proofs(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_mfa_proofs_expires_at ON user_service.mfa_proofs(expires_at);
