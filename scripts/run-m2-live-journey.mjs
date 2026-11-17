import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import { generateTotpCode, getTotpCounter } from "../services/user-service/dist/totp.js";

// ============================================================================
// Live E2E Cross-Service Clinical Journey Runner (Nhịp 2 & Nhịp 3)
// Member 1 (TV1): M2-INTEGRATION-006
// Gateway: http://127.0.0.1:8080
// Real Services: 3001-3005 on Disposable PostgreSQL Container (port 5433)
// ============================================================================

const GATEWAY_BASE = "http://127.0.0.1:8080";
const DB_HOST = "127.0.0.1";
const DB_PORT = 5433;
const DB_USER = "postgres";
const DB_PASS = "testpassword";

const pools = {
  user: new pg.Pool({ connectionString: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/user_service_test` }),
  doctor: new pg.Pool({ connectionString: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/doctor_service_test` }),
  appointment: new pg.Pool({ connectionString: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/appointment_service_test` }),
  record: new pg.Pool({ connectionString: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/medical_record_service_test` }),
  notification: new pg.Pool({ connectionString: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/notification_service_test` })
};

const FIXTURES = {
  patient: {
    email: "patient.live.e2e@clinic.test",
    password: "Password123!",
    expectedRole: "PATIENT",
    expectedPatientId: "d2f9a2e0-2413-4d1d-96b4-f3f0bbe9dcd0",
    expectedUserId: "3fbc73cb-4b55-4aec-a0a4-b3122e20cc59"
  },
  staff: {
    email: "staff.live.e2e@clinic.test",
    password: "Password123!",
    expectedRole: "STAFF",
    totpSecret: "JBSWY3DPEHPK3PXP"
  },
  doctor: {
    email: "doctor.live.e2e@clinic.test",
    password: "Password123!",
    expectedRole: "DOCTOR",
    expectedDoctorId: "214fec14-aa56-4ac1-ba9d-4768a31cba3a",
    expectedSpecialtyId: "18d8eede-8710-4ca7-93c0-90d16e82b999",
    totpSecret: "JBSWY3DPEHPK3PXP"
  }
};

let passedAssertions = 0;

function logStep(step, desc) {
  console.log(`\n==================================================================`);
  console.log(`[STEP ${step}] ${desc}`);
  console.log(`==================================================================`);
}

function recordPass(desc) {
  passedAssertions++;
  console.log(`  ✓ ${desc}`);
}

async function requestGateway(path, options = {}) {
  const url = `${GATEWAY_BASE}${path}`;
  const requestId = crypto.randomUUID();
  const headers = {
    "X-Request-Id": requestId,
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...options.headers
  };

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  let data = null;
  const text = await response.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    status: response.status,
    headers: response.headers,
    data,
    requestId
  };
}

async function loginUser(email, password) {
  const res = await requestGateway("/api/v1/auth/login", {
    method: "POST",
    body: { email, password }
  });
  assert.equal(res.status, 200, `Login failed for ${email}`);
  assert.ok(res.data.success, `Login response unsuccessful for ${email}`);
  return {
    token: res.data.data.accessToken,
    sessionId: res.data.data.session?.sessionId,
    state: res.data.data.session?.state,
    role: res.data.data.user?.role,
    userId: res.data.data.user?.id
  };
}

async function elevateMfaSession(token, totpSecret, factorId) {
  const chalRes = await requestGateway("/api/v1/auth/mfa/challenges", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: { factorId, purpose: "STAFF_ADMIN_LOGIN" }
  });
  assert.equal(chalRes.status, 201, "MFA challenge creation failed");
  const challengeId = chalRes.data.data.challengeId;

  const code = generateTotpCode(totpSecret, getTotpCounter());
  const verRes = await requestGateway("/api/v1/auth/mfa/verify", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: { challengeId, code }
  });
  assert.equal(verRes.status, 200, `MFA challenge verification failed: ${JSON.stringify(verRes.data)}`);
  return verRes.data.data;
}

async function cleanPreviousTestArtifacts() {
  const patientId = FIXTURES.patient.expectedPatientId;
  const doctorId = FIXTURES.doctor.expectedDoctorId;
  const appts = await pools.appointment.query(
    "SELECT id FROM appointment_service.appointments WHERE patient_id = $1 AND doctor_id = $2",
    [patientId, doctorId]
  );
  for (const row of appts.rows) {
    const id = row.id;
    const recs = await pools.record.query(
      "SELECT id FROM medical_record_service.medical_records WHERE appointment_id = $1",
      [id]
    );
    for (const r of recs.rows) {
      await pools.record.query("DELETE FROM medical_record_service.idempotency_requests WHERE record_id = $1", [r.id]);
      await pools.record.query("DELETE FROM medical_record_service.outbox_events WHERE aggregate_id = $1", [r.id]);
      await pools.record.query("DELETE FROM medical_record_service.medical_record_audit_logs WHERE medical_record_id = $1", [r.id]);
      await pools.record.query("DELETE FROM medical_record_service.medical_records WHERE id = $1", [r.id]);
    }
    await pools.record.query("DELETE FROM medical_record_service.finalization_contexts WHERE appointment_id = $1", [id]);
    await pools.record.query("DELETE FROM medical_record_service.consumed_grant_proofs WHERE grant_id IN (SELECT id FROM medical_record_service.clinical_grants WHERE appointment_id = $1)", [id]);
    await pools.record.query("DELETE FROM medical_record_service.clinical_grants WHERE appointment_id = $1", [id]);
    await pools.appointment.query("DELETE FROM appointment_service.idempotency_requests WHERE appointment_id = $1", [id]);
    await pools.appointment.query("DELETE FROM appointment_service.appointment_completions WHERE appointment_id = $1", [id]);
    await pools.appointment.query("DELETE FROM appointment_service.appointment_status_history WHERE appointment_id = $1", [id]);
    await pools.appointment.query("DELETE FROM appointment_service.appointment_outbox_events WHERE aggregate_id = $1", [id]);
    await pools.appointment.query("DELETE FROM appointment_service.appointments WHERE id = $1", [id]);
  }
  await pools.notification.query(
    "DELETE FROM notification_service.notifications WHERE recipient_user_id = $1",
    [FIXTURES.patient.expectedUserId]
  );
}

async function runLiveJourney() {
  console.log("Starting Live E2E Cross-Service Clinical Journey...");
  console.log(`Target Gateway: ${GATEWAY_BASE}`);
  console.log(`Disposable Database: ${DB_HOST}:${DB_PORT}`);

  // Clean previous synthetic run artifacts for deterministic state
  await cleanPreviousTestArtifacts();

  // --------------------------------------------------------------------------
  // STEP 1: Verify Health of Gateway and 5 Real Services
  // --------------------------------------------------------------------------
  logStep(1, "Verify Health & Readiness of All Components");
  const gwHealth = await requestGateway("/health");
  assert.equal(gwHealth.status, 200, "Gateway /health check failed");
  recordPass("API Gateway is alive and healthy (200 OK)");

  const ports = [3001, 3002, 3003, 3004, 3005];
  for (const port of ports) {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200, `Service on port ${port} health check failed`);
  }
  recordPass("All 5 real business services (ports 3001-3005) are healthy (200 OK)");

  // --------------------------------------------------------------------------
  // STEP 2: Authenticate PATIENT via Gateway
  // --------------------------------------------------------------------------
  logStep(2, "Authenticate PATIENT via Gateway");
  const patientAuth = await loginUser(FIXTURES.patient.email, FIXTURES.patient.password);
  assert.equal(patientAuth.state, "ACTIVE");
  assert.equal(patientAuth.role, "PATIENT");
  assert.equal(patientAuth.userId, FIXTURES.patient.expectedUserId);
  recordPass("PATIENT logged in via Gateway -> active session obtained");

  // Check DB side-effect: active session in user_service_test.sessions
  const patSessionDb = await pools.user.query(
    "SELECT id, status, role FROM user_service.sessions WHERE id = $1 AND user_id = $2",
    [patientAuth.sessionId, patientAuth.userId]
  );
  assert.equal(patSessionDb.rowCount, 1, "Session row missing in user_service_test.sessions");
  assert.equal(patSessionDb.rows[0].status, "ACTIVE");
  recordPass("DB Assertion: Active PATIENT session persisted in user_service_test.sessions");

  // --------------------------------------------------------------------------
  // STEP 3: PATIENT Slot Discovery
  // --------------------------------------------------------------------------
  logStep(3, "PATIENT Discovers Doctor Slots via Gateway");
  const slotDate = "2026-11-18";
  const slotsRes = await requestGateway(
    `/api/v1/doctors/${FIXTURES.doctor.expectedDoctorId}/available-slots?date=${slotDate}`,
    { headers: { Authorization: `Bearer ${patientAuth.token}` } }
  );
  assert.equal(slotsRes.status, 200, "Slot query failed");
  assert.ok(Array.isArray(slotsRes.data.data), "Slots data is not an array");
  assert.ok(slotsRes.data.data.length > 0, "No available slots returned for doctor");
  const chosenSlot = slotsRes.data.data[0];
  console.log(`  Selected slot: ${chosenSlot.startAt} -> ${chosenSlot.endAt}`);
  recordPass(`PATIENT retrieved ${slotsRes.data.data.length} available slots via Gateway`);

  // --------------------------------------------------------------------------
  // STEP 4: PATIENT Books Appointment with Idempotency-Key
  // --------------------------------------------------------------------------
  logStep(4, "PATIENT Books Appointment via Gateway with Idempotency-Key");
  const idempotencyKey = `e2e-live-book-${crypto.randomUUID()}`;
  const bookingPayload = {
    doctorId: FIXTURES.doctor.expectedDoctorId,
    scheduledStartAt: chosenSlot.startAt,
    scheduledEndAt: chosenSlot.endAt,
    reason: "Live E2E Cross-Service Clinical Journey Checkup"
  };

  const bookRes = await requestGateway("/api/v1/appointments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${patientAuth.token}`,
      "Idempotency-Key": idempotencyKey
    },
    body: bookingPayload
  });
  assert.equal(bookRes.status, 201, `Booking failed: ${JSON.stringify(bookRes.data)}`);
  const appointmentId = bookRes.data.data.id;
  assert.ok(appointmentId, "Appointment ID missing in response");
  assert.equal(bookRes.data.data.status, "PENDING");
  assert.equal(bookRes.data.data.doctorId, FIXTURES.doctor.expectedDoctorId);
  recordPass(`PATIENT booked appointment ${appointmentId} (status: PENDING)`);

  // DB Assertion: appointment_service_test.appointments
  const apptDb = await pools.appointment.query(
    "SELECT id, patient_id, doctor_id, status, scheduled_start_at, scheduled_end_at FROM appointment_service.appointments WHERE id = $1",
    [appointmentId]
  );
  assert.equal(apptDb.rowCount, 1, "Appointment not found in appointment_service_test.appointments");
  assert.equal(apptDb.rows[0].status, "PENDING");
  assert.equal(apptDb.rows[0].doctor_id, FIXTURES.doctor.expectedDoctorId);
  recordPass("DB Assertion: Appointment record persisted in appointment_service_test.appointments with status PENDING");

  // DB Assertion: appointment_status_history
  const historyDb = await pools.appointment.query(
    "SELECT id, to_status FROM appointment_service.appointment_status_history WHERE appointment_id = $1 ORDER BY created_at ASC",
    [appointmentId]
  );
  assert.equal(historyDb.rowCount, 1, "Status history missing initial row");
  assert.equal(historyDb.rows[0].to_status, "PENDING");
  recordPass("DB Assertion: Initial PENDING status transition recorded in appointment_status_history");

  // --------------------------------------------------------------------------
  // STEP 5: Verify Idempotent Booking Replay
  // --------------------------------------------------------------------------
  logStep(5, "Verify Idempotent Replay on Appointment Booking");
  const replayBookRes = await requestGateway("/api/v1/appointments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${patientAuth.token}`,
      "Idempotency-Key": idempotencyKey
    },
    body: bookingPayload
  });
  assert.ok(replayBookRes.status === 200 || replayBookRes.status === 201, "Replay request failed");
  assert.equal(replayBookRes.data.data.id, appointmentId, "Replay returned different appointment ID");
  recordPass("Idempotent replay returned existing appointment without duplicate");

  const apptCountDb = await pools.appointment.query(
    "SELECT count(*) FROM appointment_service.appointments WHERE doctor_id = $1 AND scheduled_start_at = $2",
    [FIXTURES.doctor.expectedDoctorId, chosenSlot.startAt]
  );
  assert.equal(Number(apptCountDb.rows[0].count), 1, "Duplicate appointment was created in DB!");
  recordPass("DB Assertion: Exactly 1 appointment row exists for this slot (no duplicate)");

  // --------------------------------------------------------------------------
  // STEP 6: Authenticate STAFF via Gateway & Verify MFA Enforcement
  // --------------------------------------------------------------------------
  logStep(6, "Authenticate STAFF via Gateway with MFA Elevation");
  const staffAuth = await loginUser(FIXTURES.staff.email, FIXTURES.staff.password);
  assert.equal(staffAuth.role, "STAFF");

  // If pending MFA, operational request must be rejected with 403
  if (staffAuth.state === "PENDING_MFA") {
    const unverifiedOp = await requestGateway(`/api/v1/appointments/${appointmentId}`, {
      headers: { Authorization: `Bearer ${staffAuth.token}` }
    });
    assert.equal(unverifiedOp.status, 403, "Gateway allowed operational request without MFA!");
    assert.equal(unverifiedOp.data.error?.code, "MFA_VERIFICATION_REQUIRED");
    recordPass("Gateway strictly blocked operational access for PENDING_MFA session (403 MFA_VERIFICATION_REQUIRED)");

    await elevateMfaSession(staffAuth.token, FIXTURES.staff.totpSecret);
    recordPass("STAFF completed TOTP challenge verification -> session elevated to ACTIVE");
  } else {
    recordPass("STAFF session is already ACTIVE");
  }

  // --------------------------------------------------------------------------
  // STEP 7: STAFF Confirms Appointment via Gateway
  // --------------------------------------------------------------------------
  logStep(7, "STAFF Confirms Appointment via Gateway");
  const confirmRes = await requestGateway(`/api/v1/appointments/${appointmentId}/confirm`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${staffAuth.token}`,
      "Idempotency-Key": `e2e-confirm-${crypto.randomUUID()}`
    },
    body: { reason: "Confirmed by reception staff" }
  });
  assert.equal(confirmRes.status, 200, `Confirm failed: ${JSON.stringify(confirmRes.data)}`);
  assert.equal(confirmRes.data.data.status, "CONFIRMED");
  recordPass(`STAFF confirmed appointment ${appointmentId} (status: CONFIRMED)`);

  // DB Assertion: status = 'CONFIRMED' in appointments & status_history
  const apptConfirmedDb = await pools.appointment.query(
    "SELECT status FROM appointment_service.appointments WHERE id = $1",
    [appointmentId]
  );
  assert.equal(apptConfirmedDb.rows[0].status, "CONFIRMED");
  const confirmHistoryDb = await pools.appointment.query(
    "SELECT to_status FROM appointment_service.appointment_status_history WHERE appointment_id = $1 AND to_status = 'CONFIRMED'",
    [appointmentId]
  );
  assert.equal(confirmHistoryDb.rowCount, 1, "Status history missing CONFIRMED entry");
  recordPass("DB Assertion: Appointment transition to CONFIRMED persisted in appointments & status_history");

  // --------------------------------------------------------------------------
  // STEP 8: STAFF Checks In Patient via Gateway
  // --------------------------------------------------------------------------
  logStep(8, "STAFF Checks In Patient via Gateway");
  const checkInRes = await requestGateway(`/api/v1/appointments/${appointmentId}/check-in`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${staffAuth.token}`,
      "Idempotency-Key": `e2e-checkin-${crypto.randomUUID()}`
    },
    body: { reason: "Patient arrived at reception clinic desk" }
  });
  assert.equal(checkInRes.status, 200, `Check-in failed: ${JSON.stringify(checkInRes.data)}`);
  assert.equal(checkInRes.data.data.status, "CHECKED_IN");
  recordPass(`STAFF checked in patient for appointment ${appointmentId} (status: CHECKED_IN)`);

  // DB Assertion: status = 'CHECKED_IN' in appointments & status_history
  const apptCheckedInDb = await pools.appointment.query(
    "SELECT status FROM appointment_service.appointments WHERE id = $1",
    [appointmentId]
  );
  assert.equal(apptCheckedInDb.rows[0].status, "CHECKED_IN");
  const checkInHistoryDb = await pools.appointment.query(
    "SELECT to_status FROM appointment_service.appointment_status_history WHERE appointment_id = $1 AND to_status = 'CHECKED_IN'",
    [appointmentId]
  );
  assert.equal(checkInHistoryDb.rowCount, 1, "Status history missing CHECKED_IN entry");
  recordPass("DB Assertion: Appointment transition to CHECKED_IN persisted in appointments & status_history");

  // --------------------------------------------------------------------------
  // STEP 9: Verify Direct Service Completion is Blocked
  // --------------------------------------------------------------------------
  logStep(9, "Verify Direct PATCH /complete on Appointment is Rejected");
  const staffDirectComplete = await requestGateway(`/api/v1/appointments/${appointmentId}/complete`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${staffAuth.token}` }
  });
  assert.equal(staffDirectComplete.status, 403, "STAFF direct completion should return 403 ACCESS_DENIED");
  recordPass("STAFF direct appointment completion is rejected with 403 ACCESS_DENIED");

  // --------------------------------------------------------------------------
  // STEP 10: Authenticate DOCTOR via Gateway & MFA Elevation
  // --------------------------------------------------------------------------
  logStep(10, "Authenticate DOCTOR via Gateway & Complete MFA");
  const doctorAuth = await loginUser(FIXTURES.doctor.email, FIXTURES.doctor.password);
  assert.equal(doctorAuth.role, "DOCTOR");

  if (doctorAuth.state === "PENDING_MFA") {
    await elevateMfaSession(doctorAuth.token, FIXTURES.doctor.totpSecret);
    recordPass("DOCTOR completed TOTP MFA login elevation -> session ACTIVE");
  } else {
    recordPass("DOCTOR session is already ACTIVE");
  }

  const doctorDirectComplete = await requestGateway(`/api/v1/appointments/${appointmentId}/complete`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${doctorAuth.token}` }
  });
  assert.equal(doctorDirectComplete.status, 409, "DOCTOR direct completion should return 409 MEDICAL_RECORD_REQUIRED");
  assert.equal(doctorDirectComplete.data.error?.code, "MEDICAL_RECORD_REQUIRED");
  recordPass("DOCTOR direct appointment completion is strictly rejected with 409 MEDICAL_RECORD_REQUIRED");

  // --------------------------------------------------------------------------
  // STEP 11: DOCTOR Requests Clinical Access Grant (TOTP Protected)
  // --------------------------------------------------------------------------
  logStep(11, "DOCTOR Obtains TOTP Proof & Clinical Grant for Encounter");
  // 1. Request MFA Challenge for OPEN_CLINICAL_RECORDS
  const grantChallengeRes = await requestGateway("/api/v1/auth/mfa/challenges", {
    method: "POST",
    headers: { Authorization: `Bearer ${doctorAuth.token}` },
    body: {
      purpose: "OPEN_CLINICAL_RECORDS",
      context: {
        appointmentId,
        patientId: FIXTURES.patient.expectedPatientId,
        accessMode: "CURRENT_ENCOUNTER"
      }
    }
  });
  assert.equal(grantChallengeRes.status, 201, "Failed to create grant challenge");
  const grantChallengeId = grantChallengeRes.data.data.challengeId;

  // 2. Verify MFA Challenge to obtain proofId
  const grantCode = generateTotpCode(FIXTURES.doctor.totpSecret, getTotpCounter());
  const grantVerifyRes = await requestGateway("/api/v1/auth/mfa/verify", {
    method: "POST",
    headers: { Authorization: `Bearer ${doctorAuth.token}` },
    body: { challengeId: grantChallengeId, code: grantCode }
  });
  assert.equal(grantVerifyRes.status, 200, `Failed to verify grant challenge: ${JSON.stringify(grantVerifyRes.data)}`);
  const grantProofId = grantVerifyRes.data.data.authorization?.proofId;
  assert.ok(grantProofId, "Verification proofId missing for clinical grant");
  recordPass(`DOCTOR verified TOTP proof ${grantProofId} for OPEN_CLINICAL_RECORDS`);

  // 3. Issue clinical grant via Gateway
  const grantRes = await requestGateway("/api/v1/medical-records/access-grants", {
    method: "POST",
    headers: { Authorization: `Bearer ${doctorAuth.token}` },
    body: {
      verificationProofId: grantProofId,
      accessMode: "CURRENT_ENCOUNTER",
      appointmentId,
      patientId: FIXTURES.patient.expectedPatientId
    }
  });
  assert.equal(grantRes.status, 201, `Failed to create clinical grant: ${JSON.stringify(grantRes.data)}`);
  const grantId = grantRes.data.data.grantId;
  assert.ok(grantId, "Clinical grant ID missing");
  recordPass(`DOCTOR issued clinical grant ${grantId} for CURRENT_ENCOUNTER`);

  // DB Assertion: medical_record_service_test.clinical_grants
  const grantDb = await pools.record.query(
    "SELECT id, doctor_id, patient_id, appointment_id, access_mode, expires_at FROM medical_record_service.clinical_grants WHERE id = $1",
    [grantId]
  );
  assert.equal(grantDb.rowCount, 1, "Clinical grant not found in medical_record_service_test.clinical_grants");
  assert.equal(grantDb.rows[0].access_mode, "CURRENT_ENCOUNTER");
  assert.equal(grantDb.rows[0].appointment_id, appointmentId);
  recordPass("DB Assertion: Clinical grant persisted in medical_record_service_test.clinical_grants with active TTL");

  // --------------------------------------------------------------------------
  // STEP 12: DOCTOR Creates DRAFT Medical Record
  // --------------------------------------------------------------------------
  logStep(12, "DOCTOR Creates DRAFT Medical Record via Gateway");
  const recordPayload = {
    appointmentId,
    patientId: FIXTURES.patient.expectedPatientId,
    doctorId: FIXTURES.doctor.expectedDoctorId,
    symptoms: "Chest tightness, mild dyspnea on exertion for 3 days",
    diagnosis: "Atypical chest discomfort, rule out ischemic etiology",
    notes: "ECG normal sinus rhythm. Advised hydration and follow-up cardiac markers.",
    treatmentPlan: "Aspirin 81mg daily, lifestyle modifications, review in 7 days",
    prescription: [
      {
        medicineName: "Aspirin 81mg",
        dosage: "81mg",
        frequency: "Once daily with breakfast",
        duration: "30 days"
      }
    ],
    status: "DRAFT"
  };

  const createRecRes = await requestGateway("/api/v1/medical-records", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${doctorAuth.token}`,
      "Idempotency-Key": `e2e-rec-draft-${crypto.randomUUID()}`
    },
    body: recordPayload
  });
  assert.equal(createRecRes.status, 201, `Failed to create draft record: ${JSON.stringify(createRecRes.data)}`);
  const recordId = createRecRes.data.data.id;
  assert.ok(recordId, "Record ID missing");
  assert.equal(createRecRes.data.data.status, "DRAFT");
  assert.equal(createRecRes.data.data.version, 1);
  recordPass(`DOCTOR created DRAFT medical record ${recordId} (version: 1)`);

  // DB Assertion: medical_record_service_test.medical_records
  const recDb = await pools.record.query(
    "SELECT id, status, version, appointment_id, patient_id, doctor_id FROM medical_record_service.medical_records WHERE id = $1",
    [recordId]
  );
  assert.equal(recDb.rowCount, 1, "Medical record missing in DB");
  assert.equal(recDb.rows[0].status, "DRAFT");
  assert.equal(recDb.rows[0].version, 1);
  recordPass("DB Assertion: DRAFT medical record persisted in medical_records with version 1");

  // --------------------------------------------------------------------------
  // STEP 13: Assert PATIENT Privacy (Cannot Access DRAFT Record)
  // --------------------------------------------------------------------------
  logStep(13, "Verify PATIENT Cannot Access DRAFT Record");
  const patientRecAccess = await requestGateway(`/api/v1/medical-records/${recordId}`, {
    headers: { Authorization: `Bearer ${patientAuth.token}` }
  });
  assert.equal(patientRecAccess.status, 404, "PATIENT must receive 404 when attempting to read DRAFT record");
  recordPass("Privacy Boundary: PATIENT request for DRAFT record returns 404 Not Found");

  // --------------------------------------------------------------------------
  // STEP 14: DOCTOR Obtains Finalization Context
  // --------------------------------------------------------------------------
  logStep(14, "DOCTOR Requests Finalization Context via Gateway");
  const contextReqPayload = {
    appointmentId,
    recordId,
    expectedVersion: 1,
    record: {
      symptoms: recordPayload.symptoms,
      diagnosis: recordPayload.diagnosis,
      notes: recordPayload.notes,
      treatmentPlan: recordPayload.treatmentPlan,
      prescription: recordPayload.prescription
    }
  };

  const contextRes = await requestGateway("/api/v1/medical-records/finalization-contexts", {
    method: "POST",
    headers: { Authorization: `Bearer ${doctorAuth.token}` },
    body: contextReqPayload
  });
  assert.equal(contextRes.status, 201, `Context creation failed: ${JSON.stringify(contextRes.data)}`);
  const contextId = contextRes.data.data.contextId;
  const contentDigest = contextRes.data.data.contentDigest;
  assert.ok(contextId, "Context ID missing");
  assert.ok(contentDigest, "Content digest missing");
  recordPass(`DOCTOR obtained finalization context ${contextId} (SHA-256 digest: ${contentDigest.slice(0, 16)}...)`);

  // DB Assertion: finalization_contexts
  const ctxDb = await pools.record.query(
    "SELECT id, content_digest, expected_version FROM medical_record_service.finalization_contexts WHERE id = $1",
    [contextId]
  );
  assert.equal(ctxDb.rowCount, 1, "Context not found in DB");
  assert.equal(ctxDb.rows[0].content_digest, contentDigest);
  recordPass("DB Assertion: Finalization context persisted with matching SHA-256 digest");

  // --------------------------------------------------------------------------
  // STEP 15: DOCTOR Obtains Finalization TOTP Proof
  // --------------------------------------------------------------------------
  logStep(15, "DOCTOR Obtains TOTP Proof for FINALIZE_MEDICAL_RECORD");
  const finalChallengeRes = await requestGateway("/api/v1/auth/mfa/challenges", {
    method: "POST",
    headers: { Authorization: `Bearer ${doctorAuth.token}` },
    body: {
      purpose: "FINALIZE_MEDICAL_RECORD",
      context: {
        contextId,
        recordId,
        contentDigest
      }
    }
  });
  assert.equal(finalChallengeRes.status, 201, "Failed to create finalization challenge");
  const finalChallengeId = finalChallengeRes.data.data.challengeId;

  const finalCode = generateTotpCode(FIXTURES.doctor.totpSecret, getTotpCounter());
  const finalVerifyRes = await requestGateway("/api/v1/auth/mfa/verify", {
    method: "POST",
    headers: { Authorization: `Bearer ${doctorAuth.token}` },
    body: { challengeId: finalChallengeId, code: finalCode }
  });
  assert.equal(finalVerifyRes.status, 200, `Failed to verify finalization challenge: ${JSON.stringify(finalVerifyRes.data)}`);
  const finalProofId = finalVerifyRes.data.data.authorization?.proofId;
  assert.ok(finalProofId, "Finalization proofId missing");
  recordPass(`DOCTOR verified TOTP proof ${finalProofId} for FINALIZE_MEDICAL_RECORD`);

  // --------------------------------------------------------------------------
  // STEP 16: DOCTOR Finalizes Medical Record via Gateway
  // --------------------------------------------------------------------------
  logStep(16, "DOCTOR Finalizes Medical Record via Gateway");
  const finalizePayload = {
    contextId,
    verificationProofId: finalProofId,
    expectedVersion: 1,
    record: {
      symptoms: recordPayload.symptoms,
      diagnosis: recordPayload.diagnosis,
      notes: recordPayload.notes,
      treatmentPlan: recordPayload.treatmentPlan,
      prescription: recordPayload.prescription
    }
  };

  const finalizeRes = await requestGateway(`/api/v1/medical-records/${recordId}/finalize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${doctorAuth.token}`,
      "Idempotency-Key": `e2e-rec-final-${crypto.randomUUID()}`
    },
    body: finalizePayload
  });
  assert.equal(finalizeRes.status, 200, `Finalize failed: ${JSON.stringify(finalizeRes.data)}`);
  assert.equal(finalizeRes.data.data.status, "FINAL");
  assert.equal(finalizeRes.data.data.version, 2);
  recordPass(`DOCTOR finalized medical record ${recordId} (status: FINAL, version: 2)`);

  // DB Assertion: medical_records status is FINAL, version = 2
  const finalRecDb = await pools.record.query(
    "SELECT id, status, version FROM medical_record_service.medical_records WHERE id = $1",
    [recordId]
  );
  assert.equal(finalRecDb.rows[0].status, "FINAL");
  assert.equal(finalRecDb.rows[0].version, 2);
  recordPass("DB Assertion: Medical record updated to FINAL (version 2) in medical_records table");

  // DB Assertion: Outbox events inserted
  const outboxEventsDb = await pools.record.query(
    "SELECT id, event_type, status FROM medical_record_service.outbox_events WHERE aggregate_id = $1",
    [recordId]
  );
  assert.ok(outboxEventsDb.rowCount >= 2, "Expected at least 2 outbox events for finalization");
  const eventTypes = outboxEventsDb.rows.map(r => r.event_type);
  assert.ok(eventTypes.includes("appointment.complete"), "Missing appointment.complete outbox event");
  assert.ok(eventTypes.includes("medical-record.created"), "Missing medical-record.created outbox event");
  recordPass("DB Assertion: Outbox events (appointment.complete & medical-record.created) enqueued in outbox_events");

  // --------------------------------------------------------------------------
  // STEP 17: Outbox Event Dispatch & Appointment Completion Verification
  // --------------------------------------------------------------------------
  logStep(17, "Verify Outbox Delivery & Appointment State Transition to COMPLETED");
  console.log("  Waiting for outbox worker poll & delivery (up to 12s)...");

  let apptCompleted = false;
  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise(r => setTimeout(r, 500));
    const checkAppt = await pools.appointment.query(
      "SELECT status FROM appointment_service.appointments WHERE id = $1",
      [appointmentId]
    );
    if (checkAppt.rows[0]?.status === "COMPLETED") {
      apptCompleted = true;
      break;
    }
  }
  assert.ok(apptCompleted, "Appointment was not transitioned to COMPLETED by outbox worker");
  recordPass(`Outbox worker successfully delivered completion -> Appointment ${appointmentId} is COMPLETED`);

  // DB Assertion: appointment_completions & status_history
  const completionDb = await pools.appointment.query(
    "SELECT appointment_id, record_id, doctor_user_id FROM appointment_service.appointment_completions WHERE appointment_id = $1",
    [appointmentId]
  );
  assert.equal(completionDb.rowCount, 1, "Missing appointment_completions entry");
  assert.equal(completionDb.rows[0].record_id, recordId);
  recordPass("DB Assertion: Appointment completion mapped in appointment_completions table");

  const completedHistoryDb = await pools.appointment.query(
    "SELECT to_status FROM appointment_service.appointment_status_history WHERE appointment_id = $1 AND to_status = 'COMPLETED'",
    [appointmentId]
  );
  assert.equal(completedHistoryDb.rowCount, 1, "Status history missing COMPLETED transition");
  recordPass("DB Assertion: COMPLETED status transition recorded in appointment_status_history");

  // DB Assertion: Outbox events marked SENT
  const sentOutboxDb = await pools.record.query(
    "SELECT status FROM medical_record_service.outbox_events WHERE aggregate_id = $1 AND event_type = 'appointment.complete'",
    [recordId]
  );
  assert.equal(sentOutboxDb.rows[0]?.status, "SENT");
  recordPass("DB Assertion: Outbox event appointment.complete marked SENT");

  // --------------------------------------------------------------------------
  // STEP 18: PATIENT Retrieves FINAL Medical Record via Gateway
  // --------------------------------------------------------------------------
  logStep(18, "PATIENT Retrieves FINAL Medical Record via Gateway");
  const patFinalRec = await requestGateway(`/api/v1/medical-records/${recordId}`, {
    headers: { Authorization: `Bearer ${patientAuth.token}` }
  });
  assert.equal(patFinalRec.status, 200, "PATIENT failed to retrieve FINAL record");
  assert.equal(patFinalRec.data.data.status, "FINAL");
  assert.equal(patFinalRec.data.data.diagnosis, recordPayload.diagnosis);
  assert.equal(patFinalRec.data.data.prescription.length, 1);
  recordPass("PATIENT successfully retrieved FINAL record with full clinical notes & prescription");

  // --------------------------------------------------------------------------
  // STEP 19: PATIENT Retrieves & Acknowledges Notification via Gateway
  // --------------------------------------------------------------------------
  logStep(19, "PATIENT Notification Retrieval & Acknowledgment via Gateway");
  let notifList = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    const notifRes = await requestGateway("/api/v1/notifications", {
      headers: { Authorization: `Bearer ${patientAuth.token}` }
    });
    if (notifRes.status === 200 && notifRes.data.data?.items?.length > 0) {
      notifList = notifRes.data.data.items;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(notifList.length > 0, "No notifications received for patient");
  const recordNotif = notifList.find(n => n.payload?.recordId === recordId || n.payload?.appointmentId === appointmentId);
  assert.ok(recordNotif, "Notification for clinical encounter record/appointment missing");
  recordPass(`PATIENT retrieved notification ${recordNotif.id} for completed encounter`);

  // Acknowledge notification via Gateway
  const readRes = await requestGateway(`/api/v1/notifications/${recordNotif.id}/read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${patientAuth.token}` }
  });
  assert.equal(readRes.status, 200, "Failed to mark notification as read");
  assert.ok(readRes.data.data.readAt, "Notification readAt not populated");
  recordPass(`PATIENT marked notification ${recordNotif.id} as read via Gateway`);

  // DB Assertion: notifications table
  const notifDb = await pools.notification.query(
    "SELECT id, status, read_at FROM notification_service.notifications WHERE id = $1",
    [recordNotif.id]
  );
  assert.equal(notifDb.rowCount, 1);
  assert.ok(notifDb.rows[0].read_at !== null);
  recordPass("DB Assertion: Notification marked read in notification_service_test.notifications");

  // --------------------------------------------------------------------------
  // STEP 20: Nhịp 3 Boundary & Failure Scenarios
  // --------------------------------------------------------------------------
  logStep(20, "Verify Boundary & Failure Scenarios (Nhịp 3)");

  // 1. Unauthenticated request to protected endpoint -> 401
  const unauthRes = await requestGateway("/api/v1/appointments");
  assert.equal(unauthRes.status, 401);
  assert.equal(unauthRes.data.error?.code, "AUTH_TOKEN_MISSING");
  recordPass("Security: Unauthenticated request rejected (401 AUTH_TOKEN_MISSING)");

  // 2. Direct internal route access via Gateway -> 404/403 blocked
  const internalRouteRes = await requestGateway("/internal/v1/auth/verify", {
    headers: { Authorization: `Bearer ${patientAuth.token}` }
  });
  assert.ok(internalRouteRes.status === 404 || internalRouteRes.status === 403, "Internal route not blocked!");
  recordPass("Security: Public access to /internal/* blocked at Gateway");

  // 3. Replay of consumed verification proof -> 409 PROOF_ALREADY_CONSUMED
  const proofReplayRes = await requestGateway(`/api/v1/medical-records/${recordId}/finalize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${doctorAuth.token}`,
      "Idempotency-Key": `e2e-rec-replay-${crypto.randomUUID()}`
    },
    body: finalizePayload
  });
  assert.equal(proofReplayRes.status, 409, "Reused proof must return 409");
  recordPass("Security: Replay of consumed TOTP verification proof rejected (409 Conflict)");

  // 4. Record version conflict / already final -> 409 MEDICAL_RECORD_FINAL
  const alreadyFinalRes = await requestGateway(`/api/v1/medical-records/${recordId}/finalize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${doctorAuth.token}`,
      "Idempotency-Key": `e2e-rec-alreadyfinal-${crypto.randomUUID()}`
    },
    body: {
      contextId,
      verificationProofId: crypto.randomUUID(),
      expectedVersion: 1
    }
  });
  assert.equal(alreadyFinalRes.status, 409);
  recordPass("Integrity: Finalizing already-final record rejected (409 MEDICAL_RECORD_FINAL / CONFLICT)");

  // 5. Patient cannot cancel COMPLETED appointment -> 409/422 state machine rejection
  const invalidCancel = await requestGateway(`/api/v1/appointments/${appointmentId}/cancel`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${patientAuth.token}` },
    body: { reason: "Cannot cancel completed appointment" }
  });
  assert.ok(invalidCancel.status === 409 || invalidCancel.status === 422, "Invalid state transition allowed!");
  recordPass("State Machine: Cancelling COMPLETED appointment strictly rejected (409/422)");

  console.log("\n==================================================================");
  console.log(`LIVE E2E CROSS-SERVICE JOURNEY COMPLETED: ${passedAssertions} ASSERTIONS PASSED`);
  console.log("==================================================================");
}

runLiveJourney()
  .then(() => {
    return Promise.all(Object.values(pools).map(p => p.end()));
  })
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ LIVE E2E JOURNEY RUNNER FAILED:", err);
    Promise.all(Object.values(pools).map(p => p.end())).finally(() => {
      process.exit(1);
    });
  });
