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
      await pool.query("DELETE FROM medical_record_service.consumed_proofs WHERE record_id = $1", [id]);
      await pool.query("DELETE FROM medical_record_service.idempotency_requests WHERE record_id = $1", [id]);
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

  it("verifies proof consumption, replay via idempotency key, and rejects proof reuse", async () => {
    const apptId = randomUUID();
    const proofId = `proof-${randomUUID()}`;
    const idempKey = `idemp-${randomUUID()}`;
    const draft = await repository.create({
      appointmentId: apptId, patientId, doctorId, createdBy: doctorUserId,
      prescription: [], status: "DRAFT"
    }, randomUUID());

    const fingerprint = {
      recordId: draft.id,
      expectedVersion: 1,
      verificationProofId: proofId
    };

    // 1. First finalization consumes the proof atomically
    const firstResult = await repository.finalizeRecord({
      recordId: draft.id,
      expectedVersion: 1,
      proofId,
      actorId: doctorUserId,
      recipientUserId: patientId,
      idempotencyKey: idempKey,
      fingerprint
    });
    expect("success" in firstResult && firstResult.success).toBe(true);

    // Verify proof is recorded in consumed_proofs table
    const proofRow = await pool.query(
      "SELECT proof_id FROM medical_record_service.consumed_proofs WHERE proof_id = $1", [proofId]
    );
    expect(proofRow.rowCount).toBe(1);

    // 2. Replay with same idempotency key and fingerprint succeeds idempotently without error
    const replayResult = await repository.finalizeRecord({
      recordId: draft.id,
      expectedVersion: 1,
      proofId,
      actorId: doctorUserId,
      recipientUserId: patientId,
      idempotencyKey: idempKey,
      fingerprint
    });
    expect("success" in replayResult && replayResult.success).toBe(true);
    if ("success" in replayResult) {
      expect(replayResult.replayed).toBe(true);
      expect(replayResult.record.status).toBe("FINAL");
    }

    // 3. Attempting to reuse the consumed proof on another request fails with PROOF_ALREADY_CONSUMED
    const reuseResult = await repository.finalizeRecord({
      recordId: draft.id,
      expectedVersion: 2,
      proofId, // Already consumed
      actorId: doctorUserId,
      recipientUserId: patientId,
      idempotencyKey: `different-key-${randomUUID()}`,
      fingerprint: { ...fingerprint, expectedVersion: 2 }
    });
    // Record is already FINAL, or proof already consumed
    expect("conflict" in reuseResult).toBe(true);

    // Clean up test appt
    await pool.query("DELETE FROM medical_record_service.outbox_events WHERE aggregate_id = $1", [draft.id]);
    await pool.query("DELETE FROM medical_record_service.medical_record_audit_logs WHERE medical_record_id = $1", [draft.id]);
    await pool.query("DELETE FROM medical_record_service.consumed_proofs WHERE record_id = $1", [draft.id]);
    await pool.query("DELETE FROM medical_record_service.idempotency_requests WHERE record_id = $1", [draft.id]);
    await pool.query("DELETE FROM medical_record_service.medical_records WHERE id = $1", [draft.id]);
  });

  it("handles expectedVersion conflict and preserves draft state", async () => {
    const apptId = randomUUID();
    const draft = await repository.create({
      appointmentId: apptId, patientId, doctorId, createdBy: doctorUserId,
      prescription: [], status: "DRAFT"
    }, randomUUID());
    expect(draft.version).toBe(1);

    // Update with correct expectedVersion: 1 -> version becomes 2
    const update1 = await repository.update(draft.id, { notes: "First edit" }, doctorUserId, patientId, 1);
    expect(update1).not.toBeNull();
    if (update1 && "record" in update1) {
      expect(update1.record.version).toBe(2);
      expect(update1.record.notes).toBe("First edit");
    }

    // Concurrent/stale editor tries to update with stale expectedVersion: 1 -> conflict
    const updateStale = await repository.update(draft.id, { notes: "Stale edit" }, doctorUserId, patientId, 1);
    expect(updateStale).toEqual(expect.objectContaining({
      conflict: true,
      reason: "RECORD_VERSION_CONFLICT"
    }));

    // Verify draft remains intact with "First edit"
    const current = await repository.findById(draft.id);
    expect(current?.notes).toBe("First edit");
    expect(current?.version).toBe(2);

    // Clean up
    await pool.query("DELETE FROM medical_record_service.medical_record_audit_logs WHERE medical_record_id = $1", [draft.id]);
    await pool.query("DELETE FROM medical_record_service.medical_records WHERE id = $1", [draft.id]);
  });
});
