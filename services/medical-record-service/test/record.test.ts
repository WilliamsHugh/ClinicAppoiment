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

function database(failAudit = false) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (failAudit && sql.includes("medical_record_audit_logs")) throw new Error("audit failed");
    if (sql.includes("INSERT INTO medical_record_service.medical_records")) return { rows: [record] };
    if (sql.includes("UPDATE medical_record_service.medical_records")) return { rows: [record] };
    if (sql.includes("count(*)")) return { rows: [{ count: "1" }] };
    if (sql.includes("SELECT") && sql.includes("medical_records")) return { rows: [record] };
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
    expect(outbox?.values?.[2]).toContain("recipientUserId");
    expect(outbox?.values?.[2]).not.toContain("diagnosis");
    expect(db.client.release).toHaveBeenCalledOnce();
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
});
