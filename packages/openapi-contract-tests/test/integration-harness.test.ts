import { describe, expect, it } from "vitest";

/**
 * Health&Human Integration Harness Skeleton (Task M2-INTEGRATION-004 Step 6)
 *
 * This test suite defines the end-to-end integration flows across services
 * based on API Contract v2 (docs/api-contract-v2.md) using synthetic fixtures.
 *
 * It is NOT a production service; it is a contract integration test harness that
 * models full user journeys, boundary security, state transitions, and idempotency,
 * with clearly documented mock points for the underlying domain microservices.
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

class MockServiceHarness {
  public sessions = new Map<string, any>();
  public appointments = new Map<string, any>();
  public medicalRecords = new Map<string, any>();
  public clinicalGrants = new Map<string, any>();
  public finalizationContexts = new Map<string, any>();
  public mfaChallenges = new Map<string, any>();
  public mfaProofs = new Map<string, any>();
  public idempotencyKeys = new Map<string, any>();

  // [MOCK POINT 1: User Service Authentication & Session Management]
  login(email: string, role: "PATIENT" | "STAFF" | "DOCTOR" | "ADMIN") {
    const sessionId = `sess-${role.toLowerCase()}-${Date.now()}`;
    const now = Date.now();
    let state: "ACTIVE" | "PENDING_MFA" = role === "STAFF" || role === "ADMIN" ? "PENDING_MFA" : "ACTIVE";

    let sessionMetadata: any = {
      sessionId,
      state,
      startedAt: new Date(now).toISOString()
    };

    if (role === "PATIENT") {
      sessionMetadata.idleTimeoutSeconds = 2592000; // 30 days
      sessionMetadata.idleExpiresAt = new Date(now + 2592000 * 1000).toISOString();
    } else if (role === "DOCTOR") {
      sessionMetadata.idleTimeoutSeconds = 1296000; // 15 days
      sessionMetadata.idleExpiresAt = new Date(now + 1296000 * 1000).toISOString();
    } else {
      sessionMetadata.absoluteTimeoutSeconds = 28800; // 8 hours
      sessionMetadata.absoluteExpiresAt = new Date(now + 28800 * 1000).toISOString();
      sessionMetadata.idleLockTimeoutSeconds = 900; // 15 minutes
      sessionMetadata.lockAt = null; // null until MFA complete
    }

    const sessionRecord = {
      token: `token-${sessionId}`,
      session: sessionMetadata,
      role,
      user: { id: `usr-${role.toLowerCase()}`, role }
    };
    this.sessions.set(sessionId, sessionRecord);
    return sessionRecord;
  }

  // [MOCK POINT 2: User Service Foreground Activity Reporting]
  reportActivity(sessionId: string) {
    const record = this.sessions.get(sessionId);
    if (!record) throw new Error("AUTH_SESSION_EXPIRED");
    if (record.session.state !== "ACTIVE") throw new Error("AUTH_SESSION_LOCKED");

    const now = Date.now();
    record.session.lastActiveAt = new Date(now).toISOString();
    if (record.role === "PATIENT") {
      record.session.idleExpiresAt = new Date(now + 2592000 * 1000).toISOString();
    } else if (record.role === "DOCTOR") {
      record.session.idleExpiresAt = new Date(now + 1296000 * 1000).toISOString();
    } else {
      record.session.lockAt = new Date(now + 900 * 1000).toISOString();
    }
    return record.session;
  }

  // [MOCK POINT 3: User Service MFA TOTP Challenge & Verification]
  createMfaChallenge(sessionId: string, purpose: string, context?: any) {
    const challengeId = `chlng-${Date.now()}`;
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
    if (sessionRecord && challenge.purpose === "STAFF_ADMIN_LOGIN") {
      sessionRecord.session.state = "ACTIVE";
      sessionRecord.session.lockAt = new Date(Date.now() + 900 * 1000).toISOString();
    }

    const proofId = `proof-${Date.now()}`;
    const proof = {
      proofId,
      purpose: challenge.purpose,
      sessionId: challenge.sessionId,
      context: challenge.context,
      verifiedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600 * 1000).toISOString()
    };
    this.mfaProofs.set(proofId, proof);
    return { verified: true, proofId, session: sessionRecord?.session };
  }

  // [MOCK POINT 4: Appointment Service State Machine & Idempotency]
  createAppointment(idempotencyKey: string, payload: any) {
    if (this.idempotencyKeys.has(idempotencyKey)) {
      const existing = this.idempotencyKeys.get(idempotencyKey);
      if (JSON.stringify(existing.payload) !== JSON.stringify(payload)) {
        throw new Error("IDEMPOTENCY_KEY_REUSED");
      }
      return existing.response;
    }

    const appointmentId = `appt-${Date.now()}`;
    const appointment = {
      id: appointmentId,
      patientId: payload.patientId,
      doctorId: payload.doctorId,
      scheduledStartAt: payload.scheduledStartAt,
      scheduledEndAt: payload.scheduledEndAt,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.appointments.set(appointmentId, appointment);
    this.idempotencyKeys.set(idempotencyKey, { payload, response: appointment });
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
    return appointment;
  }

  // [MOCK POINT 5: Medical Record Service Clinical Grants & Contexts]
  createClinicalGrant(proofId: string, appointmentId: string, patientId: string) {
    const proof = this.mfaProofs.get(proofId);
    if (!proof || proof.purpose !== "OPEN_CLINICAL_RECORDS") {
      throw new Error("CLINICAL_VERIFICATION_REQUIRED");
    }

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

  createFinalizationContext(appointmentId: string, recordId: string, expectedVersion: number) {
    const contextId = `ctx-${Date.now()}`;
    const context = {
      contextId,
      appointmentId,
      recordId,
      expectedVersion,
      contentDigest: "sha256:d8e8fca2dc0f896fd7cb4cb0031ba249"
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
        const proof = this.mfaProofs.get(payload.verificationProofId);
        if (!proof || proof.purpose !== "FINALIZE_MEDICAL_RECORD") throw new Error("MFA_VERIFICATION_REQUIRED");

        record.status = "FINAL";
        record.version += 1;
        record.appointmentCompletion = "PENDING";

        // [MOCK POINT 6: Callback to complete appointment from record]
        this.transitionAppointment(record.appointmentId, "COMPLETED");
        record.appointmentCompletion = "COMPLETED";
      }
    }

    this.idempotencyKeys.set(idempotencyKey, { payload, response: record });
    return record;
  }
}

// ============================================================================
// Integration Flows Suite
// ============================================================================

describe("Integration Harness: Flow PATIENT (Step 6)", () => {
  it("executes PATIENT flow: login -> activity -> book appointment -> check status -> idempotent replay", () => {
    const harness = new MockServiceHarness();

    // 1. PATIENT login
    const loginRes = harness.login(SYNTHETIC_FIXTURES.users.patient.email, "PATIENT");
    expect(loginRes.session.state).toBe("ACTIVE");
    expect(loginRes.session.idleTimeoutSeconds).toBe(2592000); // 30 days
    expect(loginRes.token).toBeTruthy();

    const sessionId = loginRes.session.sessionId;

    // 2. Report foreground activity
    const activityRes = harness.reportActivity(sessionId);
    expect(activityRes.lastActiveAt).toBeTruthy();
    expect(activityRes.state).toBe("ACTIVE");

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

    // 4. Check appointment status
    const fetchedAppointment = harness.appointments.get(appointment.id);
    expect(fetchedAppointment.status).toBe("PENDING");

    // 5. Idempotent replay returns same appointment
    const replayAppointment = harness.createAppointment(idempotencyKey, bookingPayload);
    expect(replayAppointment.id).toBe(appointment.id);

    // Mismatched payload returns 409 conflict
    expect(() =>
      harness.createAppointment(idempotencyKey, { ...bookingPayload, doctorId: "doc-other" })
    ).toThrow("IDEMPOTENCY_KEY_REUSED");
  });
});

describe("Integration Harness: Flow STAFF (Step 6)", () => {
  it("executes STAFF flow: login MFA -> confirm appointment -> check-in", () => {
    const harness = new MockServiceHarness();

    // Setup an existing appointment in PENDING
    const appointment = harness.createAppointment("seed-key", {
      patientId: SYNTHETIC_FIXTURES.users.patient.patientId,
      doctorId: SYNTHETIC_FIXTURES.users.doctor.doctorId,
      scheduledStartAt: SYNTHETIC_FIXTURES.scheduleSlot.startAt,
      scheduledEndAt: SYNTHETIC_FIXTURES.scheduleSlot.endAt
    });
    expect(appointment.status).toBe("PENDING");

    // 1. STAFF login -> yields PENDING_MFA state
    const staffLogin = harness.login(SYNTHETIC_FIXTURES.users.staff.email, "STAFF");
    expect(staffLogin.session.state).toBe("PENDING_MFA");
    expect(staffLogin.session.absoluteTimeoutSeconds).toBe(28800); // 8 hours absolute

    // 2. Cannot report activity while PENDING_MFA
    expect(() => harness.reportActivity(staffLogin.session.sessionId)).toThrow();

    // 3. Initiate MFA challenge
    const challenge = harness.createMfaChallenge(staffLogin.session.sessionId, "STAFF_ADMIN_LOGIN");
    expect(challenge.purpose).toBe("STAFF_ADMIN_LOGIN");

    // 4. Verify MFA challenge with 6-digit TOTP
    const verifyRes = harness.verifyMfaChallenge(challenge.challengeId, "123456");
    expect(verifyRes.verified).toBe(true);
    expect(verifyRes.session.state).toBe("ACTIVE");
    expect(verifyRes.session.lockAt).toBeTruthy();

    // 5. Confirm appointment (transition PENDING -> CONFIRMED)
    const confirmedAppt = harness.transitionAppointment(appointment.id, "CONFIRMED");
    expect(confirmedAppt.status).toBe("CONFIRMED");

    // 6. Check-in appointment (transition CONFIRMED -> CHECKED_IN)
    const checkedInAppt = harness.transitionAppointment(appointment.id, "CHECKED_IN");
    expect(checkedInAppt.status).toBe("CHECKED_IN");
  });
});

describe("Integration Harness: Flow DOCTOR (Step 6)", () => {
  it("executes DOCTOR flow: login -> TOTP grant -> read history -> finalize record", () => {
    const harness = new MockServiceHarness();

    // Setup a checked-in appointment ready for clinical encounter
    const appointment = harness.createAppointment("seed-encounter", {
      patientId: SYNTHETIC_FIXTURES.users.patient.patientId,
      doctorId: SYNTHETIC_FIXTURES.users.doctor.doctorId,
      scheduledStartAt: SYNTHETIC_FIXTURES.scheduleSlot.startAt,
      scheduledEndAt: SYNTHETIC_FIXTURES.scheduleSlot.endAt
    });
    harness.transitionAppointment(appointment.id, "CONFIRMED");
    harness.transitionAppointment(appointment.id, "CHECKED_IN");
    expect(appointment.status).toBe("CHECKED_IN");

    // 1. DOCTOR login (15-day idle timeout)
    const doctorLogin = harness.login(SYNTHETIC_FIXTURES.users.doctor.email, "DOCTOR");
    expect(doctorLogin.session.state).toBe("ACTIVE");
    expect(doctorLogin.session.idleTimeoutSeconds).toBe(1296000); // 15 days

    // 2. Doctor requests TOTP challenge for opening clinical records
    const challenge = harness.createMfaChallenge(doctorLogin.session.sessionId, "OPEN_CLINICAL_RECORDS", {
      appointmentId: appointment.id,
      patientId: appointment.patientId
    });

    // 3. Verify TOTP -> yields single-use proof token
    const proofRes = harness.verifyMfaChallenge(challenge.challengeId, "654321");
    expect(proofRes.verified).toBe(true);
    expect(proofRes.proofId).toBeTruthy();

    // 4. Issue ClinicalGrant bound to this encounter
    const grant = harness.createClinicalGrant(proofRes.proofId, appointment.id, appointment.patientId);
    expect(grant.grantId).toBeTruthy();
    expect(grant.accessMode).toBe("CURRENT_ENCOUNTER");

    // 5. Create Draft Medical Record
    const draftPayload = {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      symptoms: "Chest tightness during exertion",
      diagnosis: "Mild angina",
      prescription: [
        { medicineName: "Aspirin", dosage: "81mg", frequency: "once daily", duration: "30 days" }
      ],
      status: "DRAFT"
    };
    const draftRecord = harness.createOrFinalizeMedicalRecord("idemp-rec-draft-001", draftPayload);
    expect(draftRecord.status).toBe("DRAFT");
    expect(draftRecord.version).toBe(1);
    expect(draftRecord.appointmentCompletion).toBe("NOT_REQUESTED");

    // 6. Create Finalization Context
    const context = harness.createFinalizationContext(appointment.id, draftRecord.id, 1);
    expect(context.contextId).toBeTruthy();
    expect(context.contentDigest).toBeTruthy();

    // 7. Verify TOTP for finalization
    const finalizeChallenge = harness.createMfaChallenge(doctorLogin.session.sessionId, "FINALIZE_MEDICAL_RECORD", {
      contextId: context.contextId
    });
    const finalizeProof = harness.verifyMfaChallenge(finalizeChallenge.challengeId, "987654");
    expect(finalizeProof.proofId).toBeTruthy();

    // 8. Finalize Record (status: FINAL)
    const finalRecord = harness.createOrFinalizeMedicalRecord("idemp-rec-final-001", {
      id: draftRecord.id,
      status: "FINAL",
      expectedVersion: 1,
      verificationProofId: finalizeProof.proofId
    });
    expect(finalRecord.status).toBe("FINAL");
    expect(finalRecord.version).toBe(2);
    // Completion callback automatically transitioned appointment
    expect(finalRecord.appointmentCompletion).toBe("COMPLETED");

    // 9. Appointment is now COMPLETED
    const completedAppt = harness.appointments.get(appointment.id);
    expect(completedAppt.status).toBe("COMPLETED");
  });
});
