export type MfaPurpose =
  | "ENROLL_TOTP"
  | "OPEN_CLINICAL_RECORDS"
  | "FINALIZE_MEDICAL_RECORD"
  | "STAFF_ADMIN_LOGIN"
  | "UNLOCK_SESSION"
  | "AUTHORIZE_SENSITIVE_OPERATION";

export interface InternalProofVerifyRequest {
  proofId?: string;
  proof_token?: string;
  purpose: MfaPurpose;
  actorUserId?: string;
  actor_id?: string;
  sessionId?: string;
  session_id?: string;
  context?: Record<string, unknown>;
  resource_id?: string;
}

export interface InternalProofVerifyResponse {
  valid: boolean;
  proofId: string;
  proof_token: string;
  purpose: MfaPurpose;
  expiresAt: string;
  context: Record<string, unknown>;
  reason?: string;
}
