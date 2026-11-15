export type SessionState = "ACTIVE" | "PENDING_MFA" | "LOCKED" | "EXPIRED" | "REVOKED";
export type UserRole = "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";
export type AccountStatus = "ACTIVE" | "INACTIVE" | "LOCKED";

export interface InternalSessionVerifyResponse {
  /** User ID (matches id for compatibility) */
  id: string;
  userId: string;
  sessionId: string;
  role: UserRole;
  /** Session status: ACTIVE | PENDING_MFA | LOCKED | EXPIRED | REVOKED */
  status: SessionState;
  /** User account status from user_service.users */
  accountStatus: AccountStatus;
  /** ISO 8601 string or null (PATIENT: 30 days idle, DOCTOR: 15 days idle) */
  idleExpiresAt: string | null;
  /** ISO 8601 string or null (STAFF/ADMIN: 8 hours absolute timeout) */
  absoluteExpiresAt: string | null;
  /** ISO 8601 string or null (STAFF/ADMIN: 15 minutes inactivity lock) */
  lockAt: string | null;
  /** Generation counter for cache invalidation and anti-replay */
  sessionVersion: number;
  /** ISO 8601 string or null when MFA was verified */
  mfaVerifiedAt: string | null;
}
