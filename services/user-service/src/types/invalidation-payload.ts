export type InvalidationReason =
  | "LOGOUT_CURRENT"
  | "LOGOUT_ALL"
  | "SESSION_REVOKED"
  | "SESSION_LOCKED"
  | "SESSION_EXPIRED"
  | "ROLE_CHANGED"
  | "ACCOUNT_STATUS_CHANGED"
  | "MFA_FACTOR_CHANGED";

export interface InvalidationPayload {
  userId: string;
  sessionId?: string | null;
  scope: "CURRENT" | "ALL" | "ACCOUNT";
  reason: InvalidationReason;
  sessionVersion?: number;
  invalidatedAt: string;
}
