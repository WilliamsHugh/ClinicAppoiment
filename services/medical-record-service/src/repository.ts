import type { Pool, PoolClient } from "pg";

export type PrescriptionItem = { medicineName: string; dosage: string; frequency: string; duration: string };
export type MedicalRecord = {
  id: string; appointmentId: string; patientId: string; doctorId: string;
  symptoms?: string; diagnosis?: string; notes?: string; treatmentPlan?: string;
  prescription: PrescriptionItem[]; status: "DRAFT" | "FINAL";
  createdBy: string; updatedBy?: string; createdAt: string; updatedAt: string;
};
export type RecordInput = Omit<MedicalRecord, "id" | "createdAt" | "updatedAt" | "updatedBy">;
export type RecordChanges = Partial<Pick<MedicalRecord, "symptoms" | "diagnosis" | "notes" | "treatmentPlan" | "prescription" | "status">>;
export type OutboxEvent = { id: string; eventType: string; payload: Record<string, unknown>; retryCount: number };

const select = `id, appointment_id AS "appointmentId", patient_id AS "patientId", doctor_id AS "doctorId",
  symptoms, diagnosis, notes, treatment_plan AS "treatmentPlan", prescription, status,
  created_by AS "createdBy", updated_by AS "updatedBy", created_at AS "createdAt", updated_at AS "updatedAt"`;

export class MedicalRecordRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(filters: { patientId?: string; doctorId?: string; appointmentId?: string; status?: "FINAL" }, page: number, limit: number) {
    const values: unknown[] = [];
    const clauses = ["deleted_at IS NULL"];
    for (const [column, value] of [["patient_id", filters.patientId], ["doctor_id", filters.doctorId], ["appointment_id", filters.appointmentId], ["status", filters.status]]) {
      if (value) { values.push(value); clauses.push(`${column} = $${values.length}`); }
    }
    const where = clauses.join(" AND ");
    const total = await this.pool.query<{ count: string }>(`SELECT count(*) FROM medical_record_service.medical_records WHERE ${where}`, values);
    const items = await this.pool.query<MedicalRecord>(
      `SELECT ${select} FROM medical_record_service.medical_records WHERE ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit]
    );
    return { items: items.rows, page, limit, total: Number(total.rows[0].count) };
  }

  async findById(id: string) {
    const result = await this.pool.query<MedicalRecord>(`SELECT ${select} FROM medical_record_service.medical_records WHERE id = $1 AND deleted_at IS NULL`, [id]);
    return result.rows[0] ?? null;
  }

  async findByAppointmentId(appointmentId: string) {
    const result = await this.pool.query<MedicalRecord>(`SELECT ${select} FROM medical_record_service.medical_records WHERE appointment_id = $1 AND deleted_at IS NULL`, [appointmentId]);
    return result.rows[0] ?? null;
  }

  private async enqueue(client: PoolClient, record: MedicalRecord, recipientUserId: string) {
    const payload = { recordId: record.id, appointmentId: record.appointmentId, patientId: record.patientId, recipientUserId };
    await client.query(
      "INSERT INTO medical_record_service.outbox_events (event_type, aggregate_id, payload) VALUES ($1,$2,$3),($4,$5,$6)",
      ["medical-record.created", record.id, JSON.stringify(payload), "appointment.complete", record.id, JSON.stringify({ appointmentId: record.appointmentId, doctorId: record.doctorId, doctorUserId: record.createdBy })]
    );
  }

  private async enqueueUpdate(client: PoolClient, record: MedicalRecord, recipientUserId: string) {
    await client.query(
      "INSERT INTO medical_record_service.outbox_events (event_type, aggregate_id, payload) VALUES ($1,$2,$3)",
      ["medical-record.updated", record.id, JSON.stringify({ recordId: record.id, appointmentId: record.appointmentId, patientId: record.patientId, recipientUserId })]
    );
  }

  async create(input: RecordInput, recipientUserId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<MedicalRecord>(
        `INSERT INTO medical_record_service.medical_records
        (appointment_id, patient_id, doctor_id, symptoms, diagnosis, notes, treatment_plan, prescription, status, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${select}`,
        [input.appointmentId, input.patientId, input.doctorId, input.symptoms ?? null, input.diagnosis ?? null, input.notes ?? null, input.treatmentPlan ?? null, JSON.stringify(input.prescription), input.status, input.createdBy]
      );
      const record = result.rows[0];
      await client.query(
        "INSERT INTO medical_record_service.medical_record_audit_logs (medical_record_id, actor_id, action, changes) VALUES ($1,$2,'CREATE',$3)",
        [record.id, input.createdBy, JSON.stringify(input)]
      );
      if (record.status === "FINAL") await this.enqueue(client, record, recipientUserId);
      await client.query("COMMIT");
      return record;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async update(id: string, changes: RecordChanges, actorId: string, recipientUserId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<MedicalRecord>(`SELECT ${select} FROM medical_record_service.medical_records WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
      const before = locked.rows[0];
      if (!before) { await client.query("ROLLBACK"); return null; }
      if (before.status === "FINAL" && changes.status === "DRAFT") { await client.query("ROLLBACK"); return { conflict: true as const }; }
      const columns: Record<keyof RecordChanges, string> = { symptoms: "symptoms", diagnosis: "diagnosis", notes: "notes", treatmentPlan: "treatment_plan", prescription: "prescription", status: "status" };
      const entries = Object.entries(changes) as [keyof RecordChanges, unknown][];
      if (entries.length === 0) { await client.query("ROLLBACK"); return { record: before }; }
      const values = entries.map(([key, value]) => key === "prescription" ? JSON.stringify(value) : value);
      const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 1}`).join(", ");
      const result = await client.query<MedicalRecord>(
        `UPDATE medical_record_service.medical_records SET ${assignments}, updated_by = $${values.length + 1}, updated_at = now() WHERE id = $${values.length + 2} RETURNING ${select}`,
        [...values, actorId, id]
      );
      const record = result.rows[0];
      await client.query(
        "INSERT INTO medical_record_service.medical_record_audit_logs (medical_record_id, actor_id, action, changes) VALUES ($1,$2,'UPDATE',$3)",
        [id, actorId, JSON.stringify({ before: Object.fromEntries(entries.map(([key]) => [key, before[key]])), after: changes })]
      );
      if (before.status !== "FINAL" && record.status === "FINAL") await this.enqueue(client, record, recipientUserId);
      else if (before.status === "FINAL") await this.enqueueUpdate(client, record, recipientUserId);
      await client.query("COMMIT");
      return { record };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async pendingOutbox(limit = 20) {
    const result = await this.pool.query<OutboxEvent>(
      `SELECT id, event_type AS "eventType", payload, retry_count AS "retryCount"
       FROM medical_record_service.outbox_events WHERE status = 'PENDING' AND next_attempt_at <= now()
       ORDER BY created_at LIMIT $1`, [limit]
    );
    return result.rows;
  }

  async markOutboxSent(id: string) {
    await this.pool.query("UPDATE medical_record_service.outbox_events SET status = 'SENT' WHERE id = $1", [id]);
  }

  async deferOutbox(id: string, retryCount: number) {
    const delaySeconds = Math.min(3600, 2 ** Math.min(retryCount, 10));
    await this.pool.query(
      "UPDATE medical_record_service.outbox_events SET retry_count = retry_count + 1, next_attempt_at = now() + ($2 * interval '1 second') WHERE id = $1",
      [id, delaySeconds]
    );
  }
}
