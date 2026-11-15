import type { Role } from "@clinic/shared-types";
import type { Request } from "express";

export type SessionState = "ACTIVE" | "PENDING_MFA" | "LOCKED" | "EXPIRED" | "REVOKED";
export type AccountStatus = "ACTIVE" | "INACTIVE" | "LOCKED";

export type AuthenticatedUser = {
  id: string;
  role: Role;
  sessionId?: string;
  sessionState?: SessionState;
};

export type GatewayRequest = Request & {
  requestId?: string;
  user?: AuthenticatedUser;
};

export type VerifiedIdentity = {
  id: string;
  authUserId?: string;
  userId?: string;
  sessionId?: string;
  role: Role;
  status: SessionState | "INACTIVE";
  accountStatus?: AccountStatus;
  idleExpiresAt?: string | null;
  absoluteExpiresAt?: string | null;
  lockAt?: string | null;
  sessionVersion?: number;
  mfaVerifiedAt?: string | null;
};

export type InvalidationReason =
  | "LOGOUT_CURRENT"
  | "LOGOUT_ALL"
  | "SESSION_REVOKED"
  | "SESSION_LOCKED"
  | "SESSION_EXPIRED"
  | "ROLE_CHANGED"
  | "ACCOUNT_STATUS_CHANGED"
  | "MFA_FACTOR_CHANGED";

export type InvalidationPayload = {
  userId: string;
  sessionId?: string | null;
  scope: "CURRENT" | "ALL" | "ACCOUNT";
  reason: InvalidationReason;
  sessionVersion?: number;
  invalidatedAt?: string;
};

export type AccessTokenVerifier = (token: string, requestId: string) => Promise<VerifiedIdentity | null>;
