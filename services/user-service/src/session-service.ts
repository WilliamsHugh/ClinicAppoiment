import { createHash } from "node:crypto";
import type { Role } from "@clinic/shared-types";
import type { SessionRecord, SessionState, UserRepository } from "./repository.js";
import type { InvalidationPayload, InvalidationReason } from "./types/invalidation-payload.js";
import type { InternalSessionVerifyResponse } from "./types/internal-session-verify.js";

export const PATIENT_IDLE_TIMEOUT_SECONDS = 30 * 24 * 60 * 60; // 2,592,000s = 30 days
export const DOCTOR_IDLE_TIMEOUT_SECONDS = 15 * 24 * 60 * 60; // 1,296,000s = 15 days
export const STAFF_ADMIN_ABSOLUTE_TIMEOUT_SECONDS = 8 * 60 * 60; // 28,800s = 8 hours
export const STAFF_ADMIN_IDLE_LOCK_SECONDS = 15 * 60; // 900s = 15 minutes

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function evaluateSessionStatus(session: SessionRecord, now = new Date()): SessionState {
  if (session.status === "REVOKED") return "REVOKED";
  if (session.status === "EXPIRED") return "EXPIRED";

  const nowMs = now.getTime();

  // Check absolute timeout (STAFF/ADMIN)
  if (session.absoluteExpiresAt) {
    const absMs = new Date(session.absoluteExpiresAt).getTime();
    if (nowMs >= absMs) {
      return "EXPIRED";
    }
  }

  // Check idle timeout (PATIENT/DOCTOR)
  if (session.idleExpiresAt) {
    const idleMs = new Date(session.idleExpiresAt).getTime();
    if (nowMs >= idleMs) {
      return "EXPIRED";
    }
  }

  // Check inactivity lock (STAFF/ADMIN)
  if (session.status === "ACTIVE" && session.lockAt) {
    const lockMs = new Date(session.lockAt).getTime();
    if (nowMs >= lockMs) {
      return "LOCKED";
    }
  }

  return session.status;
}

export function formatSessionMetadata(session: SessionRecord, now = new Date()) {
  const evaluatedState = evaluateSessionStatus(session, now);
  if (session.role === "PATIENT") {
    return {
      sessionId: session.id,
      state: evaluatedState,
      lastActiveAt: session.lastActiveAt,
      idleExpiresAt: session.idleExpiresAt,
      idleTimeoutSeconds: PATIENT_IDLE_TIMEOUT_SECONDS,
    };
  }
  if (session.role === "DOCTOR") {
    return {
      sessionId: session.id,
      state: evaluatedState,
      lastActiveAt: session.lastActiveAt,
      idleExpiresAt: session.idleExpiresAt,
      idleTimeoutSeconds: DOCTOR_IDLE_TIMEOUT_SECONDS,
    };
  }
  // STAFF or ADMIN
  return {
    sessionId: session.id,
    state: evaluatedState,
    startedAt: session.startedAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    absoluteTimeoutSeconds: STAFF_ADMIN_ABSOLUTE_TIMEOUT_SECONDS,
    lastActiveAt: session.lastActiveAt,
    lockAt: session.lockAt,
    idleLockTimeoutSeconds: STAFF_ADMIN_IDLE_LOCK_SECONDS,
    mfaVerifiedAt: session.mfaState === "VERIFIED" ? session.updatedAt : null,
  };
}

export class SessionService {
  constructor(private readonly repository: UserRepository) {}

  async createSessionForUser(
    userId: string,
    role: Role,
    refreshToken?: string,
    deviceInfo?: string,
    now = new Date(),
  ): Promise<SessionRecord> {
    const refreshTokenHash = refreshToken ? hashToken(refreshToken) : null;

    if (role === "PATIENT") {
      const idleExpiresAt = new Date(now.getTime() + PATIENT_IDLE_TIMEOUT_SECONDS * 1000);
      return this.repository.createSession({
        userId,
        role,
        status: "ACTIVE",
        startedAt: now,
        lastActiveAt: now,
        idleExpiresAt,
        absoluteExpiresAt: null,
        lockAt: null,
        mfaState: "NONE",
        sessionVersion: 1,
        refreshTokenHash,
        deviceInfo: deviceInfo ?? null,
      });
    }

    if (role === "DOCTOR") {
      const idleExpiresAt = new Date(now.getTime() + DOCTOR_IDLE_TIMEOUT_SECONDS * 1000);
      return this.repository.createSession({
        userId,
        role,
        status: "ACTIVE",
        startedAt: now,
        lastActiveAt: now,
        idleExpiresAt,
        absoluteExpiresAt: null,
        lockAt: null,
        mfaState: "NONE",
        sessionVersion: 1,
        refreshTokenHash,
        deviceInfo: deviceInfo ?? null,
      });
    }

    // STAFF or ADMIN: starts in PENDING_MFA, 8 hours absolute timeout
    const absoluteExpiresAt = new Date(now.getTime() + STAFF_ADMIN_ABSOLUTE_TIMEOUT_SECONDS * 1000);
    return this.repository.createSession({
      userId,
      role,
      status: "PENDING_MFA",
      startedAt: now,
      lastActiveAt: now,
      idleExpiresAt: null,
      absoluteExpiresAt,
      lockAt: null,
      mfaState: "PENDING",
      sessionVersion: 1,
      refreshTokenHash,
      deviceInfo: deviceInfo ?? null,
    });
  }

  async getSession(sessionId: string, now = new Date()): Promise<SessionRecord | null> {
    const session = await this.repository.findSessionById(sessionId);
    if (!session) return null;

    const evaluated = evaluateSessionStatus(session, now);
    if (evaluated !== session.status) {
      const updated = await this.repository.updateSession(session.id, { status: evaluated });
      return updated ?? { ...session, status: evaluated };
    }
    return session;
  }

  async getSessionByRefreshToken(refreshToken: string, now = new Date()): Promise<SessionRecord | null> {
    const tokenHash = hashToken(refreshToken);
    const session = await this.repository.findSessionByRefreshTokenHash(tokenHash);
    if (!session) return null;

    const evaluated = evaluateSessionStatus(session, now);
    if (evaluated !== session.status) {
      const updated = await this.repository.updateSession(session.id, { status: evaluated });
      return updated ?? { ...session, status: evaluated };
    }
    return session;
  }

  async rotateRefreshToken(
    sessionId: string,
    oldRefreshToken: string,
    newRefreshToken: string,
    now = new Date(),
  ): Promise<SessionRecord | null> {
    const session = await this.getSession(sessionId, now);
    if (!session) return null;

    const evaluated = evaluateSessionStatus(session, now);
    if (evaluated === "EXPIRED" || evaluated === "REVOKED") {
      return null;
    }

    const oldHash = hashToken(oldRefreshToken);
    const newHash = hashToken(newRefreshToken);

    const updated = await this.repository.rotateSessionRefreshToken(session.id, oldHash, newHash);
    return updated;
  }

  async recordActivity(sessionId: string, now = new Date()): Promise<SessionRecord | null> {
    const session = await this.getSession(sessionId, now);
    if (!session) return null;

    const evaluated = evaluateSessionStatus(session, now);
    if (evaluated !== "ACTIVE") {
      return null;
    }

    let newIdleExpiresAt: Date | null = null;
    let newLockAt: Date | null = null;

    if (session.role === "PATIENT") {
      newIdleExpiresAt = new Date(now.getTime() + PATIENT_IDLE_TIMEOUT_SECONDS * 1000);
    } else if (session.role === "DOCTOR") {
      newIdleExpiresAt = new Date(now.getTime() + DOCTOR_IDLE_TIMEOUT_SECONDS * 1000);
    } else if (session.role === "STAFF" || session.role === "ADMIN") {
      // Check absolute timeout
      if (session.absoluteExpiresAt) {
        const absMs = new Date(session.absoluteExpiresAt).getTime();
        if (now.getTime() >= absMs) {
          await this.repository.updateSession(session.id, { status: "EXPIRED" });
          return null;
        }
      }
      newLockAt = new Date(now.getTime() + STAFF_ADMIN_IDLE_LOCK_SECONDS * 1000);
    }

    const updated = await this.repository.touchSessionActivity(session.id, now, newIdleExpiresAt, newLockAt);
    return updated;
  }

  async activateMfaLogin(sessionId: string, now = new Date()): Promise<SessionRecord | null> {
    const session = await this.getSession(sessionId, now);
    if (!session) return null;

    const evaluated = evaluateSessionStatus(session, now);
    if (evaluated === "EXPIRED" || evaluated === "REVOKED") return null;

    const lockAt = new Date(now.getTime() + STAFF_ADMIN_IDLE_LOCK_SECONDS * 1000);
    return this.repository.updateSession(session.id, {
      status: "ACTIVE",
      mfaState: "VERIFIED",
      lastActiveAt: now.toISOString(),
      lockAt: lockAt.toISOString(),
      sessionVersion: session.sessionVersion + 1,
    });
  }

  async unlockSession(sessionId: string, now = new Date()): Promise<SessionRecord | null> {
    const session = await this.getSession(sessionId, now);
    if (!session) return null;

    // Cannot unlock if absolute timeout reached
    if (session.absoluteExpiresAt) {
      const absMs = new Date(session.absoluteExpiresAt).getTime();
      if (now.getTime() >= absMs) {
        await this.repository.updateSession(session.id, { status: "EXPIRED" });
        return null;
      }
    }

    const lockAt = new Date(now.getTime() + STAFF_ADMIN_IDLE_LOCK_SECONDS * 1000);
    return this.repository.updateSession(session.id, {
      status: "ACTIVE",
      lastActiveAt: now.toISOString(),
      lockAt: lockAt.toISOString(),
      sessionVersion: session.sessionVersion + 1,
    });
  }

  async revokeSession(sessionId: string): Promise<SessionRecord | null> {
    return this.repository.revokeSession(sessionId);
  }

  async revokeAllUserSessions(userId: string): Promise<number> {
    return this.repository.revokeAllUserSessions(userId);
  }

  async listActiveSessions(userId: string, currentSessionId?: string, now = new Date()) {
    const sessions = await this.repository.listActiveSessions(userId);
    return sessions.map((s) => {
      const evaluated = evaluateSessionStatus(s, now);
      return {
        sessionId: s.id,
        isCurrent: Boolean(currentSessionId && s.id === currentSessionId),
        role: s.role,
        state: evaluated,
        startedAt: s.startedAt,
        lastActiveAt: s.lastActiveAt,
        idleExpiresAt: s.idleExpiresAt,
        absoluteExpiresAt: s.absoluteExpiresAt,
        lockAt: s.lockAt,
        deviceInfo: s.deviceInfo,
        createdAt: s.createdAt,
      };
    });
  }

  buildVerifyResponse(
    user: { id: string; role: Role; status: "ACTIVE" | "INACTIVE" | "LOCKED" },
    session: SessionRecord,
    now = new Date(),
  ): InternalSessionVerifyResponse {
    const state = evaluateSessionStatus(session, now);
    return {
      id: user.id,
      userId: user.id,
      sessionId: session.id,
      role: session.role,
      status: state,
      accountStatus: user.status,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      lockAt: session.lockAt,
      sessionVersion: session.sessionVersion,
      mfaVerifiedAt: session.mfaState === "VERIFIED" ? session.updatedAt : null,
    };
  }

  createInvalidationPayload(
    userId: string,
    scope: "CURRENT" | "ALL" | "ACCOUNT",
    reason: InvalidationReason,
    sessionId?: string | null,
    sessionVersion?: number,
  ): InvalidationPayload {
    return {
      userId,
      sessionId: sessionId ?? null,
      scope,
      reason,
      sessionVersion,
      invalidatedAt: new Date().toISOString(),
    };
  }
}
