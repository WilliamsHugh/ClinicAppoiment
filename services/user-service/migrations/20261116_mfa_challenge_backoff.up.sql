ALTER TABLE user_service.mfa_challenges
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
