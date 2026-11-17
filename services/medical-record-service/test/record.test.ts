import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { MedicalRecordRepository, type MedicalRecord } from "../src/repository.js";

const record: MedicalRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  appointmentId: "00000000-0000-4000-8000-000000000002",
  patientId: "00000000-0000-4000-8000-000000000003",
  doctorId: "00000000-0000-4000-8000-000000000004",
  prescription: [], status: "FINAL", createdBy: "00000000-0000-4000-8000-000000000005",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"
};

function database(failAudit = false, proofConflict = false, currentRecord: MedicalRecord = record) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (failAudit && sql.includes("medical_record_audit_logs")) throw new Error("audit failed");
    if (sql.includes("INSERT INTO medical_record_service.clinical_grants"))
      return { rows: [{ id: "grant-1", sessionId: "sess-1", doctorId: currentRecord.doctorId, patientId: currentRecord.patientId, appointmentId: currentRecord.appointmentId, recordId: null, accessMode: "CURRENT_ENCOUNTER", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T00:15:00Z" }] };
    if (sql.includes("SELECT") && sql.includes("clinical_grants"))
      return { rows: [{ id: "grant-1", sessionId: "sess-1", doctorId: currentRecord.doctorId, patientId: currentRecord.patientId, appointmentId: currentRecord.appointmentId, recordId: null, accessMode: "CURRENT_ENCOUNTER", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T00:15:00Z" }] };
    if (sql.includes("INSERT INTO medical_record_service.finalization_contexts"))
      return { rows: [{ id: "ctx-1", appointmentId: currentRecord.appointmentId, recordId: currentRecord.id, doctorId: currentRecord.doctorId, patientId: currentRecord.patientId, sessionId: "sess-1", expectedVersion: 1, contentDigest: "dig-1", expiresAt: "2026-01-01T00:05:00Z", createdAt: "2026-01-01T00:00:00Z" }] };
    if (sql.includes("SELECT") && sql.includes("finalization_contexts"))
      return { rows: [{ id: "ctx-1", appointmentId: currentRecord.appointmentId, recordId: currentRecord.id, doctorId: currentRecord.doctorId, patientId: currentRecord.patientId, sessionId: "sess-1", expectedVersion: 1, contentDigest: "dig-1", expiresAt: "2026-01-01T00:05:00Z", createdAt: "2026-01-01T00:00:00Z" }] };
    if (sql.includes("INSERT INTO medical_record_service.consumed_proofs"))
      return { rows: proofConflict ? [] : [{ proof_id: values?.[0] }] };
    if (sql.includes("INSERT INTO medical_record_service.consumed_grant_proofs"))
      return { rows: proofConflict ? [] : [{ proof_id: values?.[0] }] };
    if (sql.includes("INSERT INTO medical_record_service.medical_records")) return { rows: [currentRecord] };
    if (sql.includes("UPDATE medical_record_service.medical_records")) return { rows: [{ ...currentRecord, version: (currentRecord.version ?? 1) + 1, status: "FINAL", appointmentCompletion: "PENDING" }] };
    if (sql.includes("count(*)")) return { rows: [{ count: "1" }] };
    if (sql.includes("SELECT") && sql.includes("medical_records")) return { rows: [currentRecord] };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pool = { query, connect: vi.fn(async () => client) } as unknown as Pool;
  return { repo: new MedicalRecordRepository(pool), queries, client };
}

describe("Medical Record PostgreSQL repository", () => {
  it("commits record, audit and minimal outbox payload atomically", async () => {
    const db = database();
    await db.repo.create({ appointmentId: record.appointmentId, patientId: record.patientId, doctorId: record.doctorId, prescription: [], status: "FINAL", createdBy: record.createdBy }, "00000000-0000-4000-8000-000000000006");
    expect(db.queries.map((item) => item.sql)).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));
    const outbox = db.queries.find((item) => item.sql.includes("outbox_events"));
    expect(outbox).toBeDefined();
    expect(outbox?.values?.[0]).toBe("appointment.complete");
    expect(outbox?.values?.[2]).toContain(`"recordId":"${record.id}"`);
    expect(outbox?.values?.[3]).toBe("medical-record.created");
    expect(outbox?.values?.[5]).toContain("recipientUserId");
    expect(outbox?.values?.[5]).not.toContain("diagnosis");
    expect(db.client.release).toHaveBeenCalledOnce();
  });

  it("consumes proof in the same transaction when creating a FINAL record", async () => {
    const input = { appointmentId: record.appointmentId, patientId: record.patientId,
      doctorId: record.doctorId, prescription: [], status: "FINAL" as const, createdBy: record.createdBy };
    const db = database();
    await db.repo.create(input, "recipient", { proofId: "proof-1", contextId: "context-1" });
    expect(db.queries.find((item) => item.sql.includes("INSERT INTO medical_record_service.consumed_proofs"))?.values)
      .toEqual(["proof-1", record.id, "context-1"]);
    expect(db.queries.some((item) => item.sql === "COMMIT")).toBe(true);

    const replay = database(false, true);
    await expect(replay.repo.create(input, "recipient", { proofId: "proof-1", contextId: "context-1" }))
      .rejects.toThrow("PROOF_ALREADY_CONSUMED");
    expect(replay.queries.some((item) => item.sql === "ROLLBACK")).toBe(true);
    expect(replay.queries.some((item) => item.sql === "COMMIT")).toBe(false);
  });

  it("rolls back if audit insert fails", async () => {
    const db = database(true);
    await expect(db.repo.create({ appointmentId: record.appointmentId, patientId: record.patientId, doctorId: record.doctorId, prescription: [], status: "DRAFT", createdBy: record.createdBy }, "recipient")).rejects.toThrow("audit failed");
    expect(db.queries.some((item) => item.sql === "ROLLBACK")).toBe(true);
    expect(db.queries.some((item) => item.sql === "COMMIT")).toBe(false);
  });

  it("scopes the list query to patient and applies pagination", async () => {
    const db = database();
    const page = await db.repo.findAll({ patientId: record.patientId }, 2, 10);
    expect(page.total).toBe(1);
    const list = db.queries.find((item) => item.sql.includes("ORDER BY created_at"));
    expect(list?.sql).toContain("patient_id = $1");
    expect(list?.values).toEqual([record.patientId, 10, 10]);
  });

  it("limits current-encounter draft history to the checked-in appointment", async () => {
    const db = database();
    await db.repo.findAll({ patientId: record.patientId, currentDoctorId: record.doctorId,
      currentAppointmentId: record.appointmentId, includeOtherDoctorsFinalForPatient: true }, 1, 20);
    const list = db.queries.find((item) => item.sql.includes("ORDER BY created_at"));
    expect(list?.sql).toContain("status = 'FINAL' OR (doctor_id = $2 AND appointment_id = $3)");
    expect(list?.values?.slice(0, 3)).toEqual([record.patientId, record.doctorId, record.appointmentId]);
  });

  it("does not reopen a finalized record as draft", async () => {
    const db = database();
    const result = await db.repo.update(record.id, { status: "DRAFT" }, record.createdBy, "recipient");
    expect(result).toEqual({ conflict: true });
    expect(db.queries.some((item) => item.sql.includes("UPDATE medical_record_service.medical_records"))).toBe(false);
  });

  it("audits corrections to a final result and emits an update event", async () => {
    const db = database();
    await db.repo.update(record.id, { diagnosis: "changed" }, record.createdBy, "recipient");
    const audit = db.queries.find((item) => item.sql.includes("medical_record_audit_logs"));
    expect(audit?.values?.[2]).toContain('"before"');
    expect(audit?.values?.[2]).toContain('"after"');
    expect(db.queries.find((item) => item.sql.includes("outbox_events"))?.values?.[0]).toBe("medical-record.updated");
  });

  it("leases completion events before record notifications and recovers expired claims", async () => {
    const db = database();
    await db.repo.claimOutbox();
    const sql = db.queries[0].sql;
    expect(sql).toContain("completion.status <> 'SENT'");
    expect(sql).toContain("FOR UPDATE OF event SKIP LOCKED");
    expect(sql).toContain("lease_expires_at <= now()");
  });

  it("caps failed completion retries", async () => {
    const db = database();
    await db.repo.deferOutbox(record.id, 7);
    expect(db.queries[0].sql).toContain("retry_count + 1 >= 8 THEN 'FAILED'");
  });

  it("stores and retrieves clinical grants with TTL and session bound", async () => {
    const db = database();
    const expiresAt = new Date(Date.now() + 900000);
    const grant = await db.repo.createGrant({
      sessionId: "sess-1",
      doctorId: record.doctorId,
      patientId: record.patientId,
      appointmentId: record.appointmentId,
      accessMode: "CURRENT_ENCOUNTER",
      expiresAt
    }, "proof-grant-1");
    expect(grant.id).toBe("grant-1");
    expect(grant.accessMode).toBe("CURRENT_ENCOUNTER");
    const found = await db.repo.findGrantById("grant-1");
    expect(found?.id).toBe("grant-1");
    expect(db.queries.some((q) => q.sql.includes("FROM medical_record_service.clinical_grants"))).toBe(true);
  });

  it("rejects replay of a clinical grant proof and rolls back the new grant", async () => {
    const db = database(false, true);
    await expect(db.repo.createGrant({ sessionId: "sess-1", doctorId: record.doctorId,
      patientId: record.patientId, appointmentId: record.appointmentId,
      accessMode: "CURRENT_ENCOUNTER", expiresAt: new Date(Date.now() + 900000) }, "proof-used"))
      .rejects.toThrow("PROOF_ALREADY_CONSUMED");
    expect(db.queries.some((item) => item.sql === "ROLLBACK")).toBe(true);
    expect(db.queries.some((item) => item.sql === "COMMIT")).toBe(false);
  });

  it("stores and retrieves finalization context", async () => {
    const db = database();
    const context = await db.repo.createFinalizationContext({
      appointmentId: record.appointmentId,
      recordId: record.id,
      doctorId: record.doctorId,
      patientId: record.patientId,
      sessionId: "sess-1",
      expectedVersion: 1,
      contentDigest: "dig-1",
      expiresAt: new Date(Date.now() + 300000)
    });
    expect(context.id).toBe("ctx-1");
    expect(context.contentDigest).toBe("dig-1");
    const found = await db.repo.findFinalizationContext("ctx-1");
    expect(found?.id).toBe("ctx-1");
  });

  it("finalizes draft record atomically, consumes proof and bumps version", async () => {
    const db = database(false, false, { ...record, status: "DRAFT", version: 1 });
    const result = await db.repo.finalizeRecord({
      recordId: record.id,
      expectedVersion: 1,
      proofId: "proof-123",
      contextId: "ctx-1",
      actorId: record.createdBy,
      recipientUserId: "user-1"
    });
    expect("success" in result && result.success).toBe(true);
    if ("success" in result) {
      expect(result.record.status).toBe("FINAL");
      expect(result.record.version).toBe(2);
      expect(result.record.appointmentCompletion).toBe("PENDING");
    }
    expect(db.queries.some((q) => q.sql.includes("INSERT INTO medical_record_service.consumed_proofs"))).toBe(true);
    expect(db.queries.some((q) => q.sql.includes("SET status = 'FINAL'"))).toBe(true);
  });

  it("rejects proof replay when proof is already consumed", async () => {
    const db = database(false, true, { ...record, status: "DRAFT", version: 1 }); // proofConflict = true
    const result = await db.repo.finalizeRecord({
      recordId: record.id,
      expectedVersion: 1,
      proofId: "proof-already-consumed",
      contextId: "ctx-1",
      actorId: record.createdBy,
      recipientUserId: "user-1"
    });
    expect("conflict" in result && result.conflict).toBe("PROOF_ALREADY_CONSUMED");
  });

  it("updates appointment completion to COMPLETED", async () => {
    const db = database();
    await db.repo.markAppointmentCompletion(record.id, "COMPLETED");
    expect(db.queries.some((q) => q.sql.includes("appointment_completion = $1"))).toBe(true);
  });
});
