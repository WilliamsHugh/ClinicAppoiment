-- Migration DOWN: Rollback session and MFA tables (without dropping user data)
DROP TABLE IF EXISTS user_service.mfa_proofs;
DROP TABLE IF EXISTS user_service.mfa_challenges;
DROP TABLE IF EXISTS user_service.mfa_factors;
DROP TABLE IF EXISTS user_service.sessions;
