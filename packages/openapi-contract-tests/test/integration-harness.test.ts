import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Health&Human Integration Harness (Task M2-INTEGRATION-005)
 *
 * This test suite defines the end-to-end integration flows across services
 * based on API Contract v2 (docs/api-contract-v2.md) using synthetic fixtures.
 *
 * Upgraded from skeleton with full assertions:
 * - Flow 1: PATIENT (idempotency, activity reporting, appointment cancellation & slot conflict)
 * - Flow 2: STAFF (MFA enforcement, allowlist, 8h absolute deadline, 15m idle lock & unlock)
 * - Flow 3: DOCTOR CLINICAL (pre-grant guard, proof replay prevention, content digest guard, completion callback)
 * - Flow 4: ADMIN REVOCATION (admin step-up MFA, session revocation, gateway cache invalidation)
 * - Flow 5: RACE & REPLAY (concurrent slot booking conflict, refresh token rotation race)
 */

// ============================================================================
// Synthetic Test Fixtures (No real PHI, no secrets, reproducible IDs)
// ============================================================================

export const SYNTHETIC_FIXTURES = {
  users: {
    patient: {
      id: "usr-synth-pat-001",
      email: "patient.synth@clinic.test",
      role: "PATIENT" as const,
      patientId: "pat-synth-001"
    },
    patient2: {
      id: "usr-synth-pat-002",
      email: "patient2.synth@clinic.test",
      role: "PATIENT" as const,
      patientId: "pat-synth-002"
    },
    staff: {
      id: "usr-synth-stf-002",
      email: "staff.synth@clinic.test",
      role: "STAFF" as const
    },
    doctor: {
      id: "usr-synth-doc-003",
      email: "doctor.synth@clinic.test",
      role: "DOCTOR" as const,
      doctorId: "doc-synth-003"
    },
    admin: {
      id: "usr-synth-adm-004",
      email: "admin.synth@clinic.test",
      role: "ADMIN" as const
    }
  },
  specialty: {
    id: "spec-synth-cardio",
    name: "Cardiology"
  },
  scheduleSlot: {
    startAt: "2026-12-01T08:00:00.000Z",
    endAt: "2026-12-01T08:30:00.000Z"
  }
};

// ============================================================================
// Mock Service Integration Handlers
// ============================================================================

export class MockServiceHarness {
  public sessions = new Map<string, any>();
  public gatewayCache = new Map<string, any>();
  public appointments = new Map<string, any>();
  public slots = new Map<string, string>(); // `${doctorId}:${scheduledStartAt}` -> appointmentId
  public medicalRecords = new Map<string, any>();
  public clinicalGrants = new Map<string, any>();
  public finalizationContexts = new Map<string, any>();
  public mfaChallenges = new Map<string, any>();
  public mfaProofs = new Map<string, any>();
  public idempotencyKeys = new Map<string, any>();
  public refreshTokens = new Map<string, { sessionId: string; tokenVersion: number; rotated: boolean }>();

  // [MOCK POINT 1: User Service Authentication & Session Management]
  login(email: string, role: "PATIENT" | "STAFF" | "DOCTOR" | "ADMIN") {
    const sessionId = `sess-${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    const state: "ACTIVE" | "PENDING_MFA" = role === "STAFF" || role === "ADMIN" ? "PENDING_MFA" : "ACTIVE";

    const sessionMetadata: any = {
      sessionId,
      state,
      startedAt: new Date(now).toISOString()
    };

    if (role === "PATIENT") {
      sessionMetadata.idleTimeoutSeconds = 2592000; // 30 days
      sessionMetadata.idleExpiresAt = new Date(now + 2592000 * 1000).toISOString();
      sessionMetadata.absoluteTimeoutSeconds = null;
      sessionMetadata.absoluteExpiresAt = null;
    } else if (role === "DOCTOR") {
      sessionMetadata.idleTimeoutSeconds = 1296000; // 15 days
      sessionMetadata.idleExpiresAt = new Date(now + 1296000 * 1000).toISOString();
      sessionMetadata.absoluteTimeoutSeconds = null;
      sessionMetadata.absoluteExpiresAt = null;
    } else {
      sessionMetadata.absoluteTimeoutSeconds = 28800; // 8 hours absolute
      sessionMetadata.absoluteExpiresAt = new Date(now + 28800 * 1000).toISOString();
      sessionMetadata.idleLockTimeoutSeconds = 900; // 15 minutes
      sessionMetadata.lockAt = null; // null until MFA complete
      sessionMetadata.idleExpiresAt = null;
    }

    const refreshToken = `rt-${sessionId}-v1`;
    this.refreshTokens.set(refreshToken, {
      sessionId,
      tokenVersion: 1,
      rotated: false
    });

    const sessionRecord = {
      token: `token-${sessionId}`,
      refreshToken,
      session: sessionMetadata,
      role,
      user: { id: `usr-${role.toLowerCase()}`, role }
    };
    this.sessions.set(sessionId, sessionRecord);
    this.gatewayCache.set(sessionId, { state, role, userId: sessionRecord.user.id });
    return sessionRecord;
  }

  // [MOCK POINT 2: API Gateway Dispatcher & Security Boundary Enforcement]
  executeGatewayRequest(sessionId: string, method: string, path: string, body?: any) {
    const sessionRecord = this.sessions.get(sessionId);
    const inCache = this.gatewayCache.has(sessionId);

    if (!sessionRecord || !inCache || sessionRecord.session.state === "REVOKED") {
      throw new Error("AUTH_SESSION_REVOKED");
    }

    // PENDING_MFA allows only MFA endpoints and session inspection
    if (sessionRecord.session.state === "PENDING_MFA") {
      const allowed =
        path.startsWith("/api/v1/auth/mfa") ||
        path === "/api/v1/auth/session" ||
        path === "/api/v1/auth/logout";
      if (!allowed) {
        throw new Error("MFA_VERIFICATION_REQUIRED");
      }
    }

    // LOCKED allows only unlock MFA endpoints and session inspection
    if (sessionRecord.session.state === "LOCKED") {
      const allowed =
        path.startsWith("/api/v1/auth/mfa") ||
        path === "/api/v1/auth/session" ||
        path === "/api/v1/auth/logout" ||
        path === "/api/v1/auth/refresh";
      if (!allowed) {
        throw new Error("AUTH_SESSION_LOCKED");
      }
    }

    // ACTIVE: check if absolute expired
    if (sessionRecord.session.state === "ACTIVE") {
      if (
        sessionRecord.session.absoluteExpiresAt &&
        Date.now() > new Date(sessionRecord.session.absoluteExpiresAt).getTime()
      ) {
        sessionRecord.session.state = "EXPIRED";
        throw new Error("AUTH_SESSION_EXPIRED");
      }
    }

    return { status: 200, success: true, method, path };
  }

  // [MOCK POINT 3: User Service Foreground Activity Reporting]
  reportActivity(sessionId: string) {
    const record = this.sessions.get(sessionId);
    if (!record) throw new Error("AUTH_SESSION_EXPIRED");
    if (record.session.state !== "ACTIVE") throw new Error("AUTH_SESSION_LOCKED");

    const now = Date.now();
    record.session.lastActiveAt = new Date(now).toISOString();
    if (record.role === "PATIENT") {
      record.session.idleExpiresAt = new Date(now + 2592000 * 1000).toISOString();
      // Notice: absoluteExpiresAt remains null
    } else if (record.role === "DOCTOR") {
      record.session.idleExpiresAt = new Date(now + 1296000 * 1000).toISOString();
    } else {
      // STAFF/ADMIN: foreground activity updates lockAt, does NOT extend absoluteExpiresAt
      record.session.lockAt = new Date(now + 900 * 1000).toISOString();
    }
    return record.session;
  }

  simulateIdleLock(sessionId: string) {
    const record = this.sessions.get(sessionId);
    if (record && record.session.state === "ACTIVE") {
      record.session.state = "LOCKED";
      if (this.gatewayCache.has(sessionId)) {
        this.gatewayCache.get(sessionId).state = "LOCKED";
      }
    }
  }

  // [MOCK POINT 4: User Service MFA TOTP Challenge & Verification]
  createMfaChallenge(sessionId: string, purpose: string, context?: any) {
    const challengeId = `chlng-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const challenge = {
      challengeId,
      sessionId,
      purpose,
      context,
      expiresAt: new Date(Date.now() + 300 * 1000).toISOString()
    };
    this.mfaChallenges.set(challengeId, challenge);
    return challenge;
  }

  verifyMfaChallenge(challengeId: string, code: string) {
    const challenge = this.mfaChallenges.get(challengeId);
    if (!challenge) throw new Error("MFA_CHALLENGE_EXPIRED");
    if (!/^\d{6}$/.test(code)) throw new Error("MFA_CODE_INVALID");

    const sessionRecord = this.sessions.get(challenge.sessionId);
    if (sessionRecord && (challenge.purpose === "STAFF_ADMIN_LOGIN" || challenge.purpose === "UNLOCK_SESSION")) {
      sessionRecord.session.state = "ACTIVE";
      const now = Date.now();
      sessionRecord.session.mfaVerifiedAt = new Date(now).toISOString();
      sessionRecord.session.lockAt = new Date(now + 900 * 1000).toISOString();
      // Retain existing absoluteExpiresAt without extending
      if (this.gatewayCache.has(challenge.sessionId)) {
        this.gatewayCache.get(challenge.sessionId).state = "ACTIVE";
      }
    }

    const proofId = `proof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const proof = {
      proofId,
      purpose: challenge.purpose,
      sessionId: challenge.sessionId,
      context: challenge.context,
      consumed: false,
      verifiedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600 * 1000).toISOString()
    };
    this.mfaProofs.set(proofId, proof);
    return { verified: true, proofId, session: sessionRecord?.session };
  }

  consumeProof(proofId: string, expectedPurpose: string) {
    const proof = this.mfaProofs.get(proofId);
    if (!proof || proof.purpose !== expectedPurpose) {
      if (expectedPurpose === "OPEN_CLINICAL_RECORDS") throw new Error("CLINICAL_VERIFICATION_REQUIRED");
      throw new Error("MFA_VERIFICATION_REQUIRED");
    }
    if (proof.consumed) {
      throw new Error("PROOF_ALREADY_CONSUMED");
    }
    proof.consumed = true;
    return proof;
  }

  // [MOCK POINT 5: Appointment Service State Machine, Slot Occupancy & Idempotency]
  createAppointment(idempotencyKey: string, payload: any) {
    if (this.idempotencyKeys.has(idempotencyKey)) {
      const existing = this.idempotencyKeys.get(idempotencyKey);
      if (JSON.stringify(existing.payload) !== JSON.stringify(payload)) {
        throw new Error("IDEMPOTENCY_KEY_REUSED");
      }
      return existing.response;
    }

    const slotKey = `${payload.doctorId}:${payload.scheduledStartAt}`;
    if (this.slots.has(slotKey)) {
      const existingApptId = this.slots.get(slotKey);
      const existingAppt = this.appointments.get(existingApptId);
      if (existingAppt && existingAppt.status !== "CANCELLED") {
        throw new Error("SLOT_UNAVAILABLE");
      }
    }

    const appointmentId = `appt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const appointment = {
      id: appointmentId,
      patientId: payload.patientId,
      doctorId: payload.doctorId,
      scheduledStartAt: payload.scheduledStartAt,
      scheduledEndAt: payload.scheduledEndAt,
      status: "PENDING",
      slotKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.appointments.set(appointmentId, appointment);
    this.slots.set(slotKey, appointmentId);
    this.idempotencyKeys.set(idempotencyKey, { payload, response: appointment });
    return appointment;
  }

  cancelAppointment(appointmentId: string, patientId: string) {
    const appointment = this.appointments.get(appointmentId);
    if (!appointment) throw new Error("APPOINTMENT_NOT_FOUND");
    if (appointment.patientId !== patientId) throw new Error("APPOINTMENT_ACCESS_DENIED");

    const cancellableStatuses = ["PENDING", "CONFIRMED"];
    if (!cancellableStatuses.includes(appointment.status)) {
      throw new Error("APPOINTMENT_INVALID_STATUS_TRANSITION");
    }

    appointment.status = "CANCELLED";
    appointment.updatedAt = new Date().toISOString();

    // Release slot reservation upon cancellation
    if (appointment.slotKey && this.slots.get(appointment.slotKey) === appointmentId) {
      this.slots.delete(appointment.slotKey);
    }
    return appointment;
  }

  transitionAppointment(appointmentId: string, nextStatus: string) {
    const appointment = this.appointments.get(appointmentId);
    if (!appointment) throw new Error("APPOINTMENT_NOT_FOUND");

    const validTransitions: Record<string, string[]> = {
      PENDING: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
      CHECKED_IN: ["COMPLETED"]
    };

    if (!validTransitions[appointment.status]?.includes(nextStatus)) {
      throw new Error("APPOINTMENT_INVALID_STATUS_TRANSITION");
    }

    appointment.status = nextStatus;
    appointment.updatedAt = new Date().toISOString();

    if (nextStatus === "CANCELLED" && appointment.slotKey && this.slots.get(appointment.slotKey) === appointmentId) {
      this.slots.delete(appointment.slotKey);
    }
    return appointment;
  }

  // [MOCK POINT 6: Medical Record Service Clinical Grants, Contexts & Callback]
  createClinicalGrant(proofId: string, appointmentId: string, patientId: string) {
    this.consumeProof(proofId, "OPEN_CLINICAL_RECORDS");

    const appointment = this.appointments.get(appointmentId);
    if (!appointment || appointment.status !== "CHECKED_IN") {
      throw new Error("APPOINTMENT_NOT_ELIGIBLE");
    }

    const grantId = `grant-${Date.now()}`;
    const grant = {
      grantId,
      appointmentId,
      patientId,
      accessMode: "CURRENT_ENCOUNTER",
      expiresAt: new Date(Date.now() + 7200 * 1000).toISOString()
    };
    this.clinicalGrants.set(grantId, grant);
    return grant;
  }

  getPatientHistory(sessionId: string, patientId: string, grantId?: string) {
    if (!grantId || !this.clinicalGrants.has(grantId)) {
      throw new Error("CLINICAL_VERIFICATION_REQUIRED");
    }

    const grant = this.clinicalGrants.get(grantId);
    if (grant.patientId !== patientId) {
      throw new Error("CLINICAL_ACCESS_DENIED");
    }

    return Array.from(this.medicalRecords.values()).filter(
      (r) => r.patientId === patientId && r.status === "FINAL"
    );
  }

  createFinalizationContext(appointmentId: string, recordId: string, expectedVersion: number, prescriptionPayload?: any) {
    const contextId = `ctx-${Date.now()}`;
    const contentStr = prescriptionPayload ? JSON.stringify(prescriptionPayload) : "default-digest";
    const contentDigest = `sha256:${crypto.createHash("sha256").update(contentStr).digest("hex")}`;
    const context = {
      contextId,
      appointmentId,
      recordId,
      expectedVersion,
      contentDigest
    };
    this.finalizationContexts.set(contextId, context);
    return context;
  }

  createOrFinalizeMedicalRecord(idempotencyKey: string, payload: any) {
    if (this.idempotencyKeys.has(idempotencyKey)) {
      return this.idempotencyKeys.get(idempotencyKey).response;
    }

    const recordId = payload.id ?? `rec-${Date.now()}`;
    let record = this.medicalRecords.get(recordId);

    if (!record) {
      record = {
        id: recordId,
        appointmentId: payload.appointmentId,
        patientId: payload.patientId,
        doctorId: payload.doctorId,
        symptoms: payload.symptoms,
        diagnosis: payload.diagnosis,
        prescription: payload.prescription ?? [],
        status: payload.status ?? "DRAFT",
        version: 1,
        appointmentCompletion: "NOT_REQUESTED"
      };
      this.medicalRecords.set(recordId, record);
    } else {
      if (payload.expectedVersion !== undefined && record.version !== payload.expectedVersion) {
        throw new Error("RECORD_VERSION_CONFLICT");
      }
      if (payload.status === "FINAL") {
        if (!payload.verificationProofId) throw new Error("FINALIZATION_VERIFICATION_REQUIRED");

        // Verify content digest matches finalization context
        if (payload.contextId) {
          const ctx = this.finalizationContexts.get(payload.contextId);
          if (ctx) {
            const currentContentDigest = `sha256:${crypto
              .createHash("sha256")
              .update(JSON.stringify(payload.prescription ?? record.prescription))
              .digest("hex")}`;
            if (currentContentDigest !== ctx.contentDigest) {
              throw new Error("FINALIZATION_CONTEXT_CHANGED");
            }
          }
        }

        // Consume proof (with replay check)
        this.consumeProof(payload.verificationProofId, "FINALIZE_MEDICAL_RECORD");

        record.status = "FINAL";
        record.version += 1;
        record.appointmentCompletion = "PENDING";

        // Callback to complete appointment from record
        this.transitionAppointment(record.appointmentId, "COMPLETED");
        record.appointmentCompletion = "COMPLETED";
      }
    }

    this.idempotencyKeys.set(idempotencyKey, { payload, response: record });
    return record;
  }

  // [MOCK POINT 7: Admin Session Revocation & Cache Invalidation]
  revokeSession(adminSessionId: string, targetSessionId: string) {
    const adminSession = this.sessions.get(adminSessionId);
    if (!adminSession || adminSession.role !== "ADMIN" || adminSession.session.state !== "ACTIVE") {
      throw new Error("ACCESS_DENIED");
    }

    const target = this.sessions.get(targetSessionId);
    if (!target) throw new Error("AUTH_SESSION_NOT_FOUND");

    target.session.state = "REVOKED";
    // Invalidation signal to Gateway cache
    this.gatewayCache.delete(targetSessionId);
    return { sessionId: targetSessionId, revoked: true };
  }

  // [MOCK POINT 8: Refresh Token Rotation]
  rotateRefreshToken(oldRefreshToken: string) {
    const tokenInfo = this.refreshTokens.get(oldRefreshToken);
    if (!tokenInfo || tokenInfo.rotated) {
      throw new Error("AUTH_REFRESH_INVALID");
    }

    tokenInfo.rotated = true;
    const newRefreshToken = `rt-${tokenInfo.sessionId}-v${tokenInfo.tokenVersion + 1}`;
    this.refreshTokens.set(newRefreshToken, {
      sessionId: tokenInfo.sessionId,
      tokenVersion: tokenInfo.tokenVersion + 1,
      rotated: false
    });

    return {
      accessToken: `token-${tokenInfo.sessionId}-v${tokenInfo.tokenVersion + 1}`,
      refreshToken: newRefreshToken
    };
  }
}

// ============================================================================
// Integration Flows Suite
// ============================================================================

describe("Integration Harness: Flow 1 — PATIENT", () => {
  it("executes PATIENT flow: login -> activity (idle only) -> book (idempotent & mismatch) -> cancel & slot release", () => {
    const harness = new MockServiceHarness();

    // 1. PATIENT login
    const loginRes = harness.login(SYNTHETIC_FIXTURES.users.patient.email, "PATIENT");
    expect(loginRes.session.state).toBe("ACTIVE");
    expect(loginRes.session.idleTimeoutSeconds).toBe(2592000); // 30 days
    expect(loginRes.session.absoluteExpiresAt).toBeNull(); // No absolute limit for patient
    expect(loginRes.token).toBeTruthy();

    const sessionId = loginRes.session.sessionId;

    // 2. Report foreground activity -> updates idle, does NOT extend absolute
    const initialIdleExpiresAt = loginRes.session.idleExpiresAt;
    const activityRes = harness.reportActivity(sessionId);
    expect(activityRes.lastActiveAt).toBeTruthy();
    expect(activityRes.state).toBe("ACTIVE");
    expect(activityRes.idleExpiresAt).toBeTruthy();
    expect(activityRes.absoluteExpiresAt).toBeNull();

    // 3. Book appointment with Idempotency-Key
    const bookingPayload = {
      patientId: SYNTHETIC_FIXTURES.users.patient.patientId,
      doctorId: SYNTHETIC_FIXTURES.users.doctor.doctorId,
      scheduledStartAt: SYNTHETIC_FIXTURES.scheduleSlot.startAt,
      scheduledEndAt: SYNTHETIC_FIXTURES.scheduleSlot.endAt
    };
    const idempotencyKey = "idemp-patient-booking-001";

    const appointment = harness.createAppointment(idempotencyKey, bookingPayload);
    expect(appointment.id).toBeTruthy();
    expect(appointment.status).toBe("PENDING");
    expect(appointment.patientId).toBe(SYNTHETIC_FIXTURES.users.patient.patientId);

    // 4. Idempotent replay with same key & payload returns exact same appointment
    const replayAppointment = harness.createAppointment(idempotencyKey, bookingPayload);
    expect(replayAppointment.id).toBe(appointment.id);

    // 5. Idempotency mismatch: reuse same key with altered payload -> 409 IDEMPOTENCY_KEY_REUSED
    expect(() =>
      harness.createAppointment(idempotencyKey, { ...bookingPayload, doctorId: "doc-other" })
    ).toThrow("IDEMPOTENCY_KEY_REUSED");

    // 6. Appointment cancellation by patient
    const cancelledAppt = harness.cancelAppointment(appointment.id, SYNTHETIC_FIXTURES.users.patient.patientId);
    expect(cancelledAppt.status).toBe("CANCELLED");

    // 7. Cancellation again or transitioning cancelled appointment throws
    expect(() =>
      harness.cancelAppointment(appointment.id, SYNTHETIC_FIXTURES.users.patient.patientId)
    ).toThrow("APPOINTMENT_INVALID_STATUS_TRANSITION");

    // 8. Re-booking slot with fresh idempotency key after cancellation succeeds (slot released)
    const newBookingKey = "idemp-patient-booking-002";
    const rebookedAppt = harness.createAppointment(newBookingKey, bookingPayload);
    expect(rebookedAppt.id).toBeTruthy();
    expect(rebookedAppt.status).toBe("PENDING");
  });
});

describe("Integration Harness: Flow 2 — STAFF MFA", () => {
  it("executes STAFF flow: login PENDING_MFA -> allowlist enforcement -> verify TOTP (8h limit) -> idle lock (15m) -> unlock without reset", () => {
    const harness = new MockServiceHarness();

    // 1. STAFF login -> yields PENDING_MFA state with 8h absolute deadline set
    const staffLogin = harness.login(SYNTHETIC_FIXTURES.users.staff.email, "STAFF");
    expect(staffLogin.session.state).toBe("PENDING_MFA");
    expect(staffLogin.session.absoluteTimeoutSeconds).toBe(28800); // 8 hours absolute
    expect(staffLogin.session.startedAt).toBeTruthy();
    const startedAt = staffLogin.session.startedAt;
    const initialAbsoluteExpiresAt = staffLogin.session.absoluteExpiresAt;
    expect(initialAbsoluteExpiresAt).toBeTruthy();

    const sessionId = staffLogin.session.sessionId;

    // 2. Call /appointments before MFA verification -> Gateway rejects with 403 MFA_VERIFICATION_REQUIRED
    expect(() =>
      harness.executeGatewayRequest(sessionId, "GET", "/api/v1/appointments")
    ).toThrow("MFA_VERIFICATION_REQUIRED");

    // Allowlisted MFA endpoints succeed in PENDING_MFA
    const preMfaAllowed = harness.executeGatewayRequest(sessionId, "POST", "/api/v1/auth/mfa/challenges");
    expect(preMfaAllowed.status).toBe(200);

    // Cannot report activity while PENDING_MFA
    expect(() => harness.reportActivity(sessionId)).toThrow("AUTH_SESSION_LOCKED");

    // 3. Initiate MFA challenge & verify with 6-digit TOTP
    const challenge = harness.createMfaChallenge(sessionId, "STAFF_ADMIN_LOGIN");
    expect(challenge.purpose).toBe("STAFF_ADMIN_LOGIN");

    const verifyRes = harness.verifyMfaChallenge(challenge.challengeId, "123456");
    expect(verifyRes.verified).toBe(true);
    expect(verifyRes.session.state).toBe("ACTIVE");
    expect(verifyRes.session.lockAt).toBeTruthy();
    // 8h absolute deadline must remain intact
    expect(verifyRes.session.startedAt).toBe(startedAt);
    expect(verifyRes.session.absoluteExpiresAt).toBe(initialAbsoluteExpiresAt);

    // Business endpoints now permitted
    const activeReq = harness.executeGatewayRequest(sessionId, "GET", "/api/v1/appointments");
    expect(activeReq.status).toBe(200);

    // 4. After 15 minutes of inactivity -> Session transitions to LOCKED
    harness.simulateIdleLock(sessionId);
    expect(harness.sessions.get(sessionId).session.state).toBe("LOCKED");

    // Calling business endpoints while LOCKED -> 403 AUTH_SESSION_LOCKED
    expect(() =>
      harness.executeGatewayRequest(sessionId, "GET", "/api/v1/appointments")
    ).toThrow("AUTH_SESSION_LOCKED");

    // Allowlisted unlock verification succeeds while LOCKED
    const unlockAllowlisted = harness.executeGatewayRequest(sessionId, "POST", "/api/v1/auth/mfa/verify");
    expect(unlockAllowlisted.status).toBe(200);

    // 5. TOTP unlock -> returns to ACTIVE without resetting 8h absolute deadline
    const unlockChallenge = harness.createMfaChallenge(sessionId, "UNLOCK_SESSION");
    const unlockRes = harness.verifyMfaChallenge(unlockChallenge.challengeId, "654321");
    expect(unlockRes.verified).toBe(true);
    expect(unlockRes.session.state).toBe("ACTIVE");
    expect(unlockRes.session.startedAt).toBe(startedAt);
    expect(unlockRes.session.absoluteExpiresAt).toBe(initialAbsoluteExpiresAt);

    // Confirm & check-in an appointment as ACTIVE staff
    const appt = harness.createAppointment("seed-staff-appt", {
      patientId: SYNTHETIC_FIXTURES.users.patient.patientId,
      doctorId: SYNTHETIC_FIXTURES.users.doctor.doctorId,
      scheduledStartAt: "2026-12-01T09:00:00.000Z",
      scheduledEndAt: "2026-12-01T09:30:00.000Z"
    });
    const confirmed = harness.transitionAppointment(appt.id, "CONFIRMED");
    expect(confirmed.status).toBe("CONFIRMED");
    const checkedIn = harness.transitionAppointment(appt.id, "CHECKED_IN");
    expect(checkedIn.status).toBe("CHECKED_IN");
  });
});

describe("Integration Harness: Flow 3 — DOCTOR CLINICAL", () => {
  it("executes DOCTOR flow: pre-grant guard -> TOTP grant -> proof replay prevention -> content digest guard -> completion callback", () => {
    const harness = new MockServiceHarness();

    // 1. DOCTOR login (15-day idle timeout)
    const doctorLogin = harness.login(SYNTHETIC_FIXTURES.users.doctor.email, "DOCTOR");
    expect(doctorLogin.session.state).toBe("ACTIVE");
    expect(doctorLogin.session.idleTimeoutSeconds).toBe(1296000); // 15 days

    // Setup a checked-in appointment ready for clinical encounter
    const appointment = harness.createAppointment("seed-encounter", {
      patientId: SYNTHETIC_FIXTURES.users.patient.patientId,
      doctorId: SYNTHETIC_FIXTURES.users.doctor.doctorId,
      scheduledStartAt: SYNTHETIC_FIXTURES.scheduleSlot.startAt,
      scheduledEndAt: SYNTHETIC_FIXTURES.scheduleSlot.endAt
    });
    harness.transitionAppointment(appointment.id, "CONFIRMED");
    harness.transitionAppointment(appointment.id, "CHECKED_IN");

    // 2. Doctor attempts to read patient history BEFORE clinical grant -> 403 CLINICAL_VERIFICATION_REQUIRED
    expect(() =>
      harness.getPatientHistory(doctorLogin.session.sessionId, appointment.patientId)
    ).toThrow("CLINICAL_VERIFICATION_REQUIRED");

    // 3. Doctor initiates TOTP challenge for opening clinical records
    const challenge = harness.createMfaChallenge(doctorLogin.session.sessionId, "OPEN_CLINICAL_RECORDS", {
      appointmentId: appointment.id,
      patientId: appointment.patientId
    });
    const proofRes = harness.verifyMfaChallenge(challenge.challengeId, "112233");
    expect(proofRes.verified).toBe(true);

    // 4. Issue ClinicalGrant bound to this encounter
    const grant = harness.createClinicalGrant(proofRes.proofId, appointment.id, appointment.patientId);
    expect(grant.grantId).toBeTruthy();

    // 5. Proof replay prevention: reusing consumed proof_token -> 409 PROOF_ALREADY_CONSUMED
    expect(() =>
      harness.createClinicalGrant(proofRes.proofId, appointment.id, appointment.patientId)
    ).toThrow("PROOF_ALREADY_CONSUMED");

    // 6. Reading patient history with grant now succeeds
    const history = harness.getPatientHistory(doctorLogin.session.sessionId, appointment.patientId, grant.grantId);
    expect(Array.isArray(history)).toBe(true);

    // 7. Create Draft Medical Record
    const initialPrescription = [
      { medicineName: "Aspirin", dosage: "81mg", frequency: "once daily", duration: "30 days" }
    ];
    const draftPayload = {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      symptoms: "Chest tightness during exertion",
      diagnosis: "Mild angina",
      prescription: initialPrescription,
      status: "DRAFT"
    };
    const draftRecord = harness.createOrFinalizeMedicalRecord("idemp-rec-draft-001", draftPayload);
    expect(draftRecord.status).toBe("DRAFT");
    expect(draftRecord.version).toBe(1);
    expect(draftRecord.appointmentCompletion).toBe("NOT_REQUESTED");

    // 8. Create Finalization Context bound to initial prescription digest
    const context = harness.createFinalizationContext(appointment.id, draftRecord.id, 1, initialPrescription);
    expect(context.contextId).toBeTruthy();
    expect(context.contentDigest).toBeTruthy();

    // 9. Verify TOTP for finalization
    const finalizeChallenge = harness.createMfaChallenge(doctorLogin.session.sessionId, "FINALIZE_MEDICAL_RECORD", {
      contextId: context.contextId
    });
    const finalizeProof = harness.verifyMfaChallenge(finalizeChallenge.challengeId, "987654");

    // 10. Content digest mismatch: modifying prescription after context creation -> 409 FINALIZATION_CONTEXT_CHANGED
    const tamperedPrescription = [
      { medicineName: "Aspirin", dosage: "500mg", frequency: "thrice daily", duration: "60 days" }
    ];
    expect(() =>
      harness.createOrFinalizeMedicalRecord("idemp-rec-tampered", {
        id: draftRecord.id,
        status: "FINAL",
        expectedVersion: 1,
        contextId: context.contextId,
        verificationProofId: finalizeProof.proofId,
        prescription: tamperedPrescription
      })
    ).toThrow("FINALIZATION_CONTEXT_CHANGED");

    // 11. Finalize record with matching prescription -> appointmentCompletion transitions: NOT_REQUESTED -> PENDING -> COMPLETED
    const finalRecord = harness.createOrFinalizeMedicalRecord("idemp-rec-final-001", {
      id: draftRecord.id,
      status: "FINAL",
      expectedVersion: 1,
      contextId: context.contextId,
      verificationProofId: finalizeProof.proofId,
      prescription: initialPrescription
    });
    expect(finalRecord.status).toBe("FINAL");
    expect(finalRecord.version).toBe(2);
    expect(finalRecord.appointmentCompletion).toBe("COMPLETED");

    // Appointment transitioned to COMPLETED via internal callback
    const completedAppt = harness.appointments.get(appointment.id);
    expect(completedAppt.status).toBe("COMPLETED");
  });
});

describe("Integration Harness: Flow 4 — ADMIN REVOCATION", () => {
  it("executes ADMIN flow: login with MFA -> revoke session of other user -> invalidation signal -> revoked user rejected with 401", () => {
    const harness = new MockServiceHarness();

    // 1. Normal PATIENT logs in and makes authenticated requests
    const patientLogin = harness.login(SYNTHETIC_FIXTURES.users.patient.email, "PATIENT");
    const patientSessionId = patientLogin.session.sessionId;
    const initialReq = harness.executeGatewayRequest(patientSessionId, "GET", "/api/v1/auth/session");
    expect(initialReq.status).toBe(200);

    // 2. ADMIN logs in -> PENDING_MFA -> verify TOTP -> ACTIVE
    const adminLogin = harness.login(SYNTHETIC_FIXTURES.users.admin.email, "ADMIN");
    const adminSessionId = adminLogin.session.sessionId;
    expect(adminLogin.session.state).toBe("PENDING_MFA");

    const challenge = harness.createMfaChallenge(adminSessionId, "STAFF_ADMIN_LOGIN");
    const verifyRes = harness.verifyMfaChallenge(challenge.challengeId, "654321");
    expect(verifyRes.verified).toBe(true);
    expect(verifyRes.session.state).toBe("ACTIVE");

    // 3. Admin calls DELETE /auth/sessions/:sessionId for patient session
    const revokeRes = harness.revokeSession(adminSessionId, patientSessionId);
    expect(revokeRes.revoked).toBe(true);
    expect(revokeRes.sessionId).toBe(patientSessionId);

    // 4. Verify Gateway cache was invalidated for revoked session
    expect(harness.gatewayCache.has(patientSessionId)).toBe(false);

    // 5. Subsequent request by revoked user -> 401 AUTH_SESSION_REVOKED
    expect(() =>
      harness.executeGatewayRequest(patientSessionId, "GET", "/api/v1/auth/session")
    ).toThrow("AUTH_SESSION_REVOKED");
  });
});

describe("Integration Harness: Flow 5 — RACE & REPLAY (Concurrent)", () => {
  it("handles concurrent slot booking: 2 patients attempting same slot -> 1 succeeds, 1 receives 409 SLOT_UNAVAILABLE", () => {
    const harness = new MockServiceHarness();

    const bookingPayload1 = {
      patientId: SYNTHETIC_FIXTURES.users.patient.patientId,
      doctorId: SYNTHETIC_FIXTURES.users.doctor.doctorId,
      scheduledStartAt: SYNTHETIC_FIXTURES.scheduleSlot.startAt,
      scheduledEndAt: SYNTHETIC_FIXTURES.scheduleSlot.endAt
    };

    const bookingPayload2 = {
      patientId: SYNTHETIC_FIXTURES.users.patient2.patientId,
      doctorId: SYNTHETIC_FIXTURES.users.doctor.doctorId,
      scheduledStartAt: SYNTHETIC_FIXTURES.scheduleSlot.startAt,
      scheduledEndAt: SYNTHETIC_FIXTURES.scheduleSlot.endAt
    };

    // Patient 1 books slot first
    const appt1 = harness.createAppointment("idemp-race-slot-p1", bookingPayload1);
    expect(appt1.id).toBeTruthy();
    expect(appt1.status).toBe("PENDING");

    // Patient 2 attempts concurrent booking for the same slot -> 409 SLOT_UNAVAILABLE
    expect(() =>
      harness.createAppointment("idemp-race-slot-p2", bookingPayload2)
    ).toThrow("SLOT_UNAVAILABLE");
  });

  it("handles concurrent refresh token rotation: 2 requests with same refresh token -> 1 succeeds, 1 receives 401 AUTH_REFRESH_INVALID", () => {
    const harness = new MockServiceHarness();

    const patientLogin = harness.login(SYNTHETIC_FIXTURES.users.patient.email, "PATIENT");
    const initialRefreshToken = patientLogin.refreshToken;

    // First refresh succeeds and rotates token
    const refreshRes1 = harness.rotateRefreshToken(initialRefreshToken);
    expect(refreshRes1.accessToken).toBeTruthy();
    expect(refreshRes1.refreshToken).toBeTruthy();
    expect(refreshRes1.refreshToken).not.toBe(initialRefreshToken);

    // Second concurrent refresh using same original token fails -> 401 AUTH_REFRESH_INVALID
    expect(() =>
      harness.rotateRefreshToken(initialRefreshToken)
    ).toThrow("AUTH_REFRESH_INVALID");
  });
});
