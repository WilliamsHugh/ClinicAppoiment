import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { MedicalRecordRepository } from "../src/repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("Medical Record real PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new MedicalRecordRepository(pool);
  const appointmentId = randomUUID();
  const patientId = randomUUID();
  const doctorId = randomUUID();
  const doctorUserId = randomUUID();

  afterAll(async () => {
    const ids = await pool.query<{ id: string }>(
      "SELECT id FROM medical_record_service.medical_records WHERE appointment_id = $1", [appointmentId]);
    for (const { id } of ids.rows) {
      await pool.query("DELETE FROM medical_record_service.outbox_events WHERE aggregate_id = $1", [id]);
      await pool.query("DELETE FROM medical_record_service.medical_record_audit_logs WHERE medical_record_id = $1", [id]);
      await pool.query("DELETE FROM medical_record_service.medical_records WHERE id = $1", [id]);
    }
    await pool.end();
  });

  it("commits final record, audit and completion before its notification", async () => {
    const record = await repository.create({ appointmentId, patientId, doctorId, createdBy: doctorUserId,
      prescription: [], status: "FINAL" }, randomUUID());
    const audit = await pool.query("SELECT id FROM medical_record_service.medical_record_audit_logs WHERE medical_record_id = $1", [record.id]);
    expect(audit.rowCount).toBe(1);
    const first = await repository.claimOutbox();
    expect(first).toHaveLength(1);
    expect(first[0].eventType).toBe("appointment.complete");
    expect(first[0].payload).toMatchObject({ appointmentId, recordId: record.id });
    await repository.markOutboxSent(first[0].id);
    const second = await repository.claimOutbox();
    expect(second).toHaveLength(1);
    expect(second[0].eventType).toBe("medical-record.created");
    await repository.markOutboxSent(second[0].id);
    await expect(repository.create({ appointmentId, patientId, doctorId, createdBy: doctorUserId,
      prescription: [], status: "DRAFT" }, randomUUID())).rejects.toMatchObject({ code: "23505" });
  });
});
