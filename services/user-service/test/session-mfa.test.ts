import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  createAuthRouter,
  createInternalVerifyHandler,
  evaluateSessionStatus,
  formatSessionMetadata,
  PATIENT_IDLE_TIMEOUT_SECONDS,
  DOCTOR_IDLE_TIMEOUT_SECONDS,
  STAFF_ADMIN_ABSOLUTE_TIMEOUT_SECONDS,
  STAFF_ADMIN_IDLE_LOCK_SECONDS,
  type AuthProvider,
} from "../src/auth.js";
import { SessionService, hashToken } from "../src/session-service.js";
import { MfaService } from "../src/mfa-service.js";
import { generateTotpCode, generateTotpSecret, getTotpCounter, verifyTotpCode } from "../src/totp.js";
import type { SessionRecord, UserProfile, UserRepository } from "../src/repository.js";
import { createBatchPatientLookupHandler } from "../src/internal-patients.js";

describe("TOTP Core", () => {
  it("generates a valid base32 secret and verifies 6-digit TOTP codes preserving leading zeros", () => {
    const secret = generateTotpSecret(20);
    expect(secret).toMatch(/^[A-Z2-7]+$/);

    const counter = getTotpCounter();
    const code = generateTotpCode(secret, counter);
    expect(code).toMatch(/^[0-9]{6}$/);

    const isValid = verifyTotpCode(secret, code);
    expect(isValid).toBe(true);

    const isInvalid = verifyTotpCode(secret, "999999");
    expect(isInvalid).toBe(false);
  });

  it("handles time window drift within 1 step", () => {
    const secret = generateTotpSecret();
    const counter = getTotpCounter();
    const pastCode = generateTotpCode(secret, counter - 1);
    expect(verifyTotpCode(secret, pastCode, 1)).toBe(true);

    const wayPastCode = generateTotpCode(secret, counter - 5);
    expect(verifyTotpCode(secret, wayPastCode, 1)).toBe(false);
  });
});

describe("Session Lifecycle & Policies", () => {
  const mockRepo = {
    sessions: new Map<string, SessionRecord>(),
    async createSession(input: any): Promise<SessionRecord> {
      const id = "sess-" + Math.random().toString(36).substring(2, 9);
      const record: SessionRecord = {
        id,
        userId: input.userId,
        role: input.role,
        status: input.status,
        startedAt: (input.startedAt ?? new Date()).toISOString(),
        lastActiveAt: (input.lastActiveAt ?? new Date()).toISOString(),
        idleExpiresAt: input.idleExpiresAt ? input.idleExpiresAt.toISOString() : null,
        absoluteExpiresAt: input.absoluteExpiresAt ? input.absoluteExpiresAt.toISOString() : null,
        lockAt: input.lockAt ? input.lockAt.toISOString() : null,
        mfaState: input.mfaState ?? "NONE",
        sessionVersion: input.sessionVersion ?? 1,
        refreshTokenHash: input.refreshTokenHash ?? null,
        deviceInfo: input.deviceInfo ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.sessions.set(id, record);
      return record;
    },
    async findSessionById(id: string): Promise<SessionRecord | null> {
      return this.sessions.get(id) ?? null;
    },
    async findSessionByRefreshTokenHash(hash: string): Promise<SessionRecord | null> {
      for (const s of this.sessions.values()) {
        if (s.refreshTokenHash === hash) return s;
      }
      return null;
    },
    async updateSession(id: string, updates: any): Promise<SessionRecord | null> {
      const s = this.sessions.get(id);
      if (!s) return null;
      const updated = { ...s, ...updates, updatedAt: new Date().toISOString() };
      this.sessions.set(id, updated);
      return updated;
    },
    async touchSessionActivity(id: string, now: Date, idleExp?: Date | null, lockAt?: Date | null): Promise<SessionRecord | null> {
      const s = this.sessions.get(id);
      if (!s || s.status !== "ACTIVE") return null;
      const updated: SessionRecord = {
        ...s,
        lastActiveAt: now.toISOString(),
        idleExpiresAt: idleExp !== undefined ? (idleExp ? idleExp.toISOString() : null) : s.idleExpiresAt,
        lockAt: lockAt !== undefined ? (lockAt ? lockAt.toISOString() : null) : s.lockAt,
        updatedAt: now.toISOString(),
      };
      this.sessions.set(id, updated);
      return updated;
    },
    async rotateSessionRefreshToken(id: string, oldHash: string, newHash: string): Promise<SessionRecord | null> {
      const s = this.sessions.get(id);
      if (!s || s.refreshTokenHash !== oldHash || s.status === "REVOKED" || s.status === "EXPIRED") return null;
      const updated: SessionRecord = {
        ...s,
        refreshTokenHash: newHash,
        sessionVersion: s.sessionVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      this.sessions.set(id, updated);
      return updated;
    },
    async revokeSession(id: string): Promise<SessionRecord | null> {
      const s = this.sessions.get(id);
      if (!s) return null;
      const updated: SessionRecord = {
        ...s,
        status: "REVOKED",
        refreshTokenHash: null,
        sessionVersion: s.sessionVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      this.sessions.set(id, updated);
      return updated;
    },
    async revokeAllUserSessions(userId: string): Promise<number> {
      let count = 0;
      for (const [id, s] of this.sessions.entries()) {
        if (s.userId === userId && s.status !== "REVOKED") {
          this.sessions.set(id, { ...s, status: "REVOKED", refreshTokenHash: null, sessionVersion: s.sessionVersion + 1 });
          count++;
        }
      }
      return count;
    },
    async listActiveSessions(userId: string): Promise<SessionRecord[]> {
      const res: SessionRecord[] = [];
      for (const s of this.sessions.values()) {
        if (s.userId === userId && (s.status === "ACTIVE" || s.status === "PENDING_MFA" || s.status === "LOCKED")) {
          res.push(s);
        }
      }
      return res;
    },
  } as unknown as UserRepository & { sessions: Map<string, SessionRecord> };

  const sessionService = new SessionService(mockRepo);

  it("creates a PATIENT session with 30-day idle expiry and active status", async () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const session = await sessionService.createSessionForUser("user-pat-1", "PATIENT", "token-1", "Mobile App", now);

    expect(session.role).toBe("PATIENT");
    expect(session.status).toBe("ACTIVE");
    expect(session.absoluteExpiresAt).toBeNull();
    expect(session.lockAt).toBeNull();

    const expectedIdle = new Date(now.getTime() + PATIENT_IDLE_TIMEOUT_SECONDS * 1000).toISOString();
    expect(session.idleExpiresAt).toBe(expectedIdle);

    const formatted = formatSessionMetadata(session, now);
    expect(formatted.state).toBe("ACTIVE");
    expect(formatted.idleTimeoutSeconds).toBe(PATIENT_IDLE_TIMEOUT_SECONDS);
  });

  it("creates a DOCTOR session with 15-day idle expiry", async () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const session = await sessionService.createSessionForUser("user-doc-1", "DOCTOR", "token-doc", "Web Browser", now);

    expect(session.role).toBe("DOCTOR");
    expect(session.status).toBe("ACTIVE");
    const expectedIdle = new Date(now.getTime() + DOCTOR_IDLE_TIMEOUT_SECONDS * 1000).toISOString();
    expect(session.idleExpiresAt).toBe(expectedIdle);
  });

  it("creates a STAFF/ADMIN session in PENDING_MFA with 8-hour absolute timeout", async () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const session = await sessionService.createSessionForUser("user-staff-1", "STAFF", "token-staff", "Clinic Workstation", now);

    expect(session.role).toBe("STAFF");
    expect(session.status).toBe("PENDING_MFA");
    expect(session.mfaState).toBe("PENDING");
    expect(session.idleExpiresAt).toBeNull();

    const expectedAbs = new Date(now.getTime() + STAFF_ADMIN_ABSOLUTE_TIMEOUT_SECONDS * 1000).toISOString();
    expect(session.absoluteExpiresAt).toBe(expectedAbs);

    // Activates session upon successful login MFA
    const activated = await sessionService.activateMfaLogin(session.id, now);
    expect(activated?.status).toBe("ACTIVE");
    expect(activated?.mfaState).toBe("VERIFIED");
    const expectedLock = new Date(now.getTime() + STAFF_ADMIN_IDLE_LOCK_SECONDS * 1000).toISOString();
    expect(activated?.lockAt).toBe(expectedLock);
  });

  it("locks STAFF session after 15 minutes of inactivity, and unlocks with TOTP", async () => {
    const start = new Date("2026-11-15T12:00:00Z");
    const session = await sessionService.createSessionForUser("user-admin-1", "ADMIN", "token-adm", "Admin PC", start);
    const active = await sessionService.activateMfaLogin(session.id, start);
    expect(active?.status).toBe("ACTIVE");

    // 10 minutes later: still ACTIVE
    const at10m = new Date(start.getTime() + 10 * 60 * 1000);
    expect(evaluateSessionStatus(active!, at10m)).toBe("ACTIVE");

    // 16 minutes later: transitions to LOCKED
    const at16m = new Date(start.getTime() + 16 * 60 * 1000);
    expect(evaluateSessionStatus(active!, at16m)).toBe("LOCKED");

    // Unlock session with TOTP at 20 minutes (still well within 8 hours)
    const at20m = new Date(start.getTime() + 20 * 60 * 1000);
    const unlocked = await sessionService.unlockSession(session.id, at20m);
    expect(unlocked?.status).toBe("ACTIVE");
    const expectedLockAt = new Date(at20m.getTime() + STAFF_ADMIN_IDLE_LOCK_SECONDS * 1000).toISOString();
    expect(unlocked?.lockAt).toBe(expectedLockAt);
    // Absolute expiration remains fixed at start + 8 hours!
    expect(unlocked?.absoluteExpiresAt).toBe(active?.absoluteExpiresAt);
  });

  it("enforces 8-hour absolute expiry even with ongoing activity, rejecting unlock attempts", async () => {
    const start = new Date("2026-11-15T08:00:00Z");
    const session = await sessionService.createSessionForUser("user-staff-2", "STAFF", "token-staff", "Clinic Workstation", start);
    await sessionService.activateMfaLogin(session.id, start);

    // After 8 hours and 1 second: session is EXPIRED
    const after8h = new Date(start.getTime() + 8 * 60 * 60 * 1000 + 1000);
    const stored = await mockRepo.findSessionById(session.id);
    expect(evaluateSessionStatus(stored!, after8h)).toBe("EXPIRED");

    // Attempting to unlock after 8h must fail
    const unlockAttempt = await sessionService.unlockSession(session.id, after8h);
    expect(unlockAttempt).toBeNull();
  });

  it("updates foreground activity for PATIENT extending idleExpiresAt", async () => {
    const day1 = new Date("2026-11-01T10:00:00Z");
    const session = await sessionService.createSessionForUser("user-pat-2", "PATIENT", "token-pat", "Flutter App", day1);

    // Active on day 20
    const day20 = new Date("2026-11-20T10:00:00Z");
    const updated = await sessionService.recordActivity(session.id, day20);
    expect(updated).not.toBeNull();
    expect(updated?.lastActiveAt).toBe(day20.toISOString());

    const expectedNewIdle = new Date(day20.getTime() + PATIENT_IDLE_TIMEOUT_SECONDS * 1000).toISOString();
    expect(updated?.idleExpiresAt).toBe(expectedNewIdle);
  });

  it("atomically rotates refresh tokens and rejects replay with old token", async () => {
    const session = await sessionService.createSessionForUser("user-rot", "PATIENT", "old-refresh-token");
    expect(session.sessionVersion).toBe(1);

    // Successful rotation
    const rotated = await sessionService.rotateRefreshToken(session.id, "old-refresh-token", "new-refresh-token");
    expect(rotated).not.toBeNull();
    expect(rotated?.sessionVersion).toBe(2);
    expect(rotated?.refreshTokenHash).toBe(hashToken("new-refresh-token"));

    // Replay with old-refresh-token is rejected
    const replayAttempt = await sessionService.rotateRefreshToken(session.id, "old-refresh-token", "another-token");
    expect(replayAttempt).toBeNull();
  });

  it("revokes current session and all user sessions cleanly", async () => {
    const s1 = await sessionService.createSessionForUser("user-rev", "PATIENT", "tok-1");
    const s2 = await sessionService.createSessionForUser("user-rev", "PATIENT", "tok-2");

    // Revoke s1
    const revokedS1 = await sessionService.revokeSession(s1.id);
    expect(revokedS1?.status).toBe("REVOKED");
    expect(revokedS1?.refreshTokenHash).toBeNull();

    // Revoke all remaining sessions for user
    const revokedCount = await sessionService.revokeAllUserSessions("user-rev");
    expect(revokedCount).toBe(1);

    const s2After = await mockRepo.findSessionById(s2.id);
    expect(s2After?.status).toBe("REVOKED");
  });
});

describe("MFA Challenges & Proofs", () => {
  const mfaMockRepo = {
    factors: new Map<string, any>(),
    challenges: new Map<string, any>(),
    proofs: new Map<string, any>(),
    async createMfaFactor(userId: string, secretEncrypted: string, type = "totp", status = "unverified") {
      const id = "fac-" + Math.random().toString(36).substring(2, 9);
      const rec = { id, userId, type, status, secretEncrypted, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      this.factors.set(id, rec);
      return rec;
    },
    async findMfaFactorsByUserId(userId: string) {
      return Array.from(this.factors.values()).filter((f) => f.userId === userId);
    },
    async findMfaFactorById(id: string) {
      return this.factors.get(id) ?? null;
    },
    async updateMfaFactorStatus(id: string, status: string) {
      const f = this.factors.get(id);
      if (!f) return null;
      f.status = status;
      return f;
    },
    async createMfaChallenge(input: any) {
      const id = "ch-" + Math.random().toString(36).substring(2, 9);
      const rec = {
        id,
        factorId: input.factorId,
        userId: input.userId,
        sessionId: input.sessionId ?? null,
        purpose: input.purpose,
        context: input.context ?? {},
        expiresAt: input.expiresAt.toISOString(),
        verifiedAt: null,
        attemptCount: 0,
        maxAttempts: input.maxAttempts ?? 5,
        createdAt: new Date().toISOString(),
      };
      this.challenges.set(id, rec);
      return rec;
    },
    async findMfaChallengeById(id: string) {
      return this.challenges.get(id) ?? null;
    },
    async incrementChallengeAttempt(id: string) {
      const c = this.challenges.get(id);
      if (!c) return 0;
      c.attemptCount++;
      return c.attemptCount;
    },
    async markChallengeVerified(id: string) {
      const c = this.challenges.get(id);
      if (c) c.verifiedAt = new Date().toISOString();
    },
    async createMfaProof(input: any) {
      const id = "proof-" + Math.random().toString(36).substring(2, 9);
      const rec = {
        id,
        userId: input.userId,
        sessionId: input.sessionId,
        challengeId: input.challengeId,
        purpose: input.purpose,
        context: input.context ?? {},
        expiresAt: input.expiresAt.toISOString(),
        consumedAt: null,
        consumedBy: null,
        createdAt: new Date().toISOString(),
      };
      this.proofs.set(id, rec);
      return rec;
    },
    async findMfaProofById(id: string) {
      return this.proofs.get(id) ?? null;
    },
    async consumeMfaProof(id: string, consumedBy?: string) {
      const p = this.proofs.get(id);
      if (!p || p.consumedAt) return false;
      p.consumedAt = new Date().toISOString();
      p.consumedBy = consumedBy ?? "internal-verifier";
      return true;
    },
  } as unknown as UserRepository;

  const mfaService = new MfaService(mfaMockRepo);

  it("enrolls a factor and creates a purpose-bound challenge", async () => {
    const enroll = await mfaService.enrollTotp("user-mfa-1", "user1@example.com");
    expect(enroll.factorId).toBeDefined();
    expect(enroll.secret).toBeDefined();
    expect(enroll.qrCode).toContain("otpauth://totp/");

    const challenge = await mfaService.createChallenge({
      factorId: enroll.factorId,
      userId: "user-mfa-1",
      purpose: "OPEN_CLINICAL_RECORDS",
      context: { appointmentId: "app-123" },
    });
    expect(challenge.challengeId).toBeDefined();
    expect(challenge.purpose).toBe("OPEN_CLINICAL_RECORDS");
  });

  it("verifies challenge and generates purpose-bound proof for clinical operations", async () => {
    const enroll = await mfaService.enrollTotp("doc-1", "doc1@example.com");
    const challenge = await mfaService.createChallenge({
      factorId: enroll.factorId,
      userId: "doc-1",
      sessionId: "doc-session-1",
      purpose: "FINALIZE_MEDICAL_RECORD",
      context: { recordId: "rec-999" },
    });

    const validCode = generateTotpCode(enroll.secret, getTotpCounter());
    const verifyResult = await mfaService.verifyChallenge({
      challengeId: challenge.challengeId,
      code: validCode,
      sessionId: "doc-session-1",
    });

    expect(verifyResult.success).toBe(true);
    expect(verifyResult.purpose).toBe("FINALIZE_MEDICAL_RECORD");
    expect(verifyResult.proofId).toBeDefined();

    // Verify the issued proof
    const proofCheck = await mfaService.verifyProof({
      proofId: verifyResult.proofId!,
      purpose: "FINALIZE_MEDICAL_RECORD",
      actorUserId: "doc-1",
      sessionId: "doc-session-1",
    });
    expect(proofCheck.valid).toBe(true);

    // Mismatched purpose rejected
    const mismatch = await mfaService.verifyProof({
      proofId: verifyResult.proofId!,
      purpose: "OPEN_CLINICAL_RECORDS",
      actorUserId: "doc-1",
    });
    expect(mismatch.valid).toBe(false);
    expect(mismatch.reason).toBe("PROOF_PURPOSE_MISMATCH");

    // Single-use consumption
    const consumed = await mfaService.consumeProof(verifyResult.proofId!, "medical-record-service");
    expect(consumed).toBe(true);

    // Second consumption rejected
    const secondConsume = await mfaService.consumeProof(verifyResult.proofId!, "medical-record-service");
    expect(secondConsume).toBe(false);
  });

  it("rate limits challenge verification after 5 attempts", async () => {
    const enroll = await mfaService.enrollTotp("user-lim", "userlim@example.com");
    const challenge = await mfaService.createChallenge({
      factorId: enroll.factorId,
      userId: "user-lim",
      purpose: "ENROLL_TOTP",
    });

    for (let i = 0; i < 5; i++) {
      const res = await mfaService.verifyChallenge({ challengeId: challenge.challengeId, code: "000000" });
      expect(res.success).toBe(false);
      expect(res.error).toBe("MFA_CODE_INVALID");
    }

    // 6th attempt is rate-limited
    const rateLimited = await mfaService.verifyChallenge({ challengeId: challenge.challengeId, code: "000000" });
    expect(rateLimited.success).toBe(false);
    expect(rateLimited.error).toBe("MFA_RATE_LIMITED");
  });
});

describe("HTTP Endpoints (Auth, Sessions, MFA & Internal Verifications)", () => {
  const testProfile: UserProfile = {
    id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    supabaseAuthUserId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
    email: "doctor@example.com",
    fullName: "Dr. Doctor",
    role: "DOCTOR",
    status: "ACTIVE",
  };

  const testSession: SessionRecord = {
    id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
    userId: testProfile.id,
    role: "DOCTOR",
    status: "ACTIVE",
    startedAt: "2026-11-15T10:00:00.000Z",
    lastActiveAt: "2026-11-15T10:00:00.000Z",
    idleExpiresAt: "2026-11-30T10:00:00.000Z",
    absoluteExpiresAt: null,
    lockAt: null,
    mfaState: "NONE",
    sessionVersion: 1,
    refreshTokenHash: hashToken("test-refresh-token"),
    deviceInfo: "Test Agent",
    createdAt: "2026-11-15T10:00:00.000Z",
    updatedAt: "2026-11-15T10:00:00.000Z",
  };

  const mockProvider: AuthProvider = {
    signIn: vi.fn(),
    signUp: vi.fn(),
    refresh: vi.fn(),
    signOut: vi.fn(),
    verify: vi.fn(async (t) => (t === "valid-token" ? testProfile.supabaseAuthUserId : null)),
  };

  const mockRepo = {
    findUserByAuthId: vi.fn(async (id: string) => (id === testProfile.supabaseAuthUserId ? testProfile : null)),
    findSessionById: vi.fn(async (id: string) => (id === testSession.id ? testSession : null)),
    listActiveSessions: vi.fn(async () => [testSession]),
    touchSessionActivity: vi.fn(async () => ({ ...testSession, lastActiveAt: new Date().toISOString() })),
    revokeSession: vi.fn(async () => ({ ...testSession, status: "REVOKED" })),
    revokeAllUserSessions: vi.fn(async () => 1),
    findPatientById: vi.fn(async (id: string) => ({ id, userId: testProfile.id, fullName: "Patient Test" })),
  } as unknown as UserRepository;

  const sessionService = new SessionService(mockRepo);
  const mfaService = new MfaService(mockRepo);

  const app = express();
  app.use(express.json());
  app.use("/api/v1/auth", createAuthRouter(mockProvider, mockRepo, sessionService, mfaService));
  app.get("/internal/v1/auth/verify", createInternalVerifyHandler(mockProvider, mockRepo, sessionService));

  app.post("/internal/v1/auth/invalidate", async (req, res) => {
    const payload = req.body;
    if (payload.scope === "ALL") await sessionService.revokeAllUserSessions(payload.userId);
    return res.json({ success: true, data: { processed: true } });
  });

  app.post("/internal/v1/patients/lookup", createBatchPatientLookupHandler(mockRepo));

  it("GET /internal/v1/auth/verify returns complete session DTO for Gateway", async () => {
    const res = await request(app)
      .get("/internal/v1/auth/verify")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      userId: testProfile.id,
      sessionId: testSession.id,
      role: "DOCTOR",
      status: "ACTIVE",
      accountStatus: "ACTIVE",
      idleExpiresAt: testSession.idleExpiresAt,
      sessionVersion: 1,
    });
  });

  it("POST /api/v1/auth/session/activity updates lastActiveAt and returns session metadata", async () => {
    const res = await request(app)
      .post("/api/v1/auth/session/activity")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.data.sessionId).toBe(testSession.id);
    expect(res.body.data.state).toBe("ACTIVE");
    expect(res.body.data.idleTimeoutSeconds).toBe(DOCTOR_IDLE_TIMEOUT_SECONDS);
  });

  it("DELETE /api/v1/auth/sessions/:sessionId revokes session", async () => {
    const res = await request(app)
      .delete(`/api/v1/auth/sessions/${testSession.id}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ sessionId: testSession.id, revoked: true });
  });

  it("POST /internal/v1/auth/invalidate handles invalidation signal", async () => {
    const res = await request(app)
      .post("/internal/v1/auth/invalidate")
      .send({ userId: testProfile.id, scope: "ALL", reason: "LOGOUT_ALL", invalidatedAt: new Date().toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.data.processed).toBe(true);
    expect(mockRepo.revokeAllUserSessions).toHaveBeenCalledWith(testProfile.id);
  });

  it("POST /internal/v1/patients/lookup handles batch lookup for Appointment/Medical Record", async () => {
    const res = await request(app)
      .post("/internal/v1/patients/lookup")
      .send({ patientIds: ["11111111-1111-4111-8111-111111111111"] });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].fullName).toBe("Patient Test");
  });
});
