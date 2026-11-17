import type { PoolClient } from "pg";

type Pool = InstanceType<typeof import("pg").Pool>;

export class IdempotencyMismatchError extends Error {
  constructor(message = "Idempotency key was used for another request") {
    super(message);
    this.name = "IdempotencyMismatchError";
  }
}

export type PrescriptionItem = { medicineName: string; dosage: string; frequency: string; duration: string };

export type MedicalRecord = {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  symptoms?: string;
  diagnosis?: string;
  notes?: string;
  treatmentPlan?: string;
  prescription: PrescriptionItem[];
  status: "DRAFT" | "FINAL";
  version: number;
  appointmentCompletion: "NOT_REQUESTED" | "PENDING" | "COMPLETED";
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type ClinicalGrant = {
  id: string;
  sessionId: string;
  doctorId: string;
  patientId: string;
  appointmentId: string;
  recordId: string | null;
  accessMode: "CURRENT_ENCOUNTER" | "AUTHORED_HISTORY";
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string | null;
};

export type FinalizationContext = {
  id: string;
  appointmentId: string;
  recordId: string | null;
  doctorId: string;
  patientId: string;
  sessionId: string;
  expectedVersion: number;
  contentDigest: string;
  expiresAt: string;
  createdAt: string;
};

export type RecordInput = Omit<MedicalRecord, "id" | "createdAt" | "updatedAt" | "updatedBy" | "version" | "appointmentCompletion"> & {
  version?: number;
  appointmentCompletion?: "NOT_REQUESTED" | "PENDING" | "COMPLETED";
};

export type RecordChanges = Partial<Pick<MedicalRecord, "symptoms" | "diagnosis" | "notes" | "treatmentPlan" | "prescription" | "status">>;
export type OutboxEvent = { id: string; aggregateId: string; eventType: string; payload: Record<string, unknown>; retryCount: number };

const select = `id, appointment_id AS "appointmentId", patient_id AS "patientId", doctor_id AS "doctorId",
  symptoms, diagnosis, notes, treatment_plan AS "treatmentPlan", prescription, status,
  COALESCE(version, 1) AS version,
  COALESCE(appointment_completion, CASE WHEN status = 'FINAL' THEN 'PENDING' ELSE 'NOT_REQUESTED' END) AS "appointmentCompletion",
  created_by AS "createdBy", updated_by AS "updatedBy", created_at AS "createdAt", updated_at AS "updatedAt"`;

export class MedicalRecordRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(filters: {
    patientId?: string;
    doctorId?: string;
    appointmentId?: string;
    status?: "FINAL" | "DRAFT";
    includeOtherDoctorsFinalForPatient?: boolean;
    currentDoctorId?: string;
    currentAppointmentId?: string;
    recordId?: string;
    createdAfter?: Date;
  }, page: number, limit: number, view: "summary" | "detail" = "detail") {
    const values: unknown[] = [];
    const clauses = ["deleted_at IS NULL"];
    if (filters.createdAfter) {
      values.push(filters.createdAfter);
      clauses.push(`created_at >= $${values.length}`);
    }
    if (filters.recordId) {
      values.push(filters.recordId);
      clauses.push(`id = $${values.length}`);
    }

    if (filters.includeOtherDoctorsFinalForPatient && filters.patientId && filters.currentDoctorId) {
      values.push(filters.patientId);
      const pIdx = values.length;
      values.push(filters.currentDoctorId);
      const dIdx = values.length;
      values.push(filters.currentAppointmentId ?? "");
      const aIdx = values.length;
      clauses.push(`patient_id = $${pIdx} AND (status = 'FINAL' OR (doctor_id = $${dIdx} AND appointment_id = $${aIdx}))`);
      if (filters.appointmentId) {
        values.push(filters.appointmentId);
        clauses.push(`appointment_id = $${values.length}`);
      }
    } else {
      for (const [column, value] of [["patient_id", filters.patientId], ["doctor_id", filters.doctorId], ["appointment_id", filters.appointmentId], ["status", filters.status]]) {
        if (value) { values.push(value); clauses.push(`${column} = $${values.length}`); }
      }
    }

    const where = clauses.join(" AND ");
    const total = await this.pool.query<{ count: string }>(`SELECT count(*) FROM medical_record_service.medical_records WHERE ${where}`, values);
    const querySelect = view === "summary"
      ? `id, appointment_id AS "appointmentId", patient_id AS "patientId", doctor_id AS "doctorId", status,
         COALESCE(version, 1) AS version,
         COALESCE(appointment_completion, CASE WHEN status = 'FINAL' THEN 'PENDING' ELSE 'NOT_REQUESTED' END) AS "appointmentCompletion",
         created_by AS "createdBy", updated_by AS "updatedBy", created_at AS "createdAt", updated_at AS "updatedAt"`
      : select;

    const items = await this.pool.query<MedicalRecord>(
      `SELECT ${querySelect} FROM medical_record_service.medical_records WHERE ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
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
      ["appointment.complete", record.id, JSON.stringify({ appointmentId: record.appointmentId, recordId: record.id, doctorId: record.doctorId }),
        "medical-record.created", record.id, JSON.stringify(payload)]
    );
  }

  private async enqueueUpdate(client: PoolClient, record: MedicalRecord, recipientUserId: string) {
    await client.query(
      "INSERT INTO medical_record_service.outbox_events (event_type, aggregate_id, payload) VALUES ($1,$2,$3)",
      ["medical-record.updated", record.id, JSON.stringify({ recordId: record.id, appointmentId: record.appointmentId, patientId: record.patientId, recipientUserId })]
    );
  }

  async findReplay(actorId: string, operation: string, idempotencyKey: string, fingerprint: Record<string, unknown>) {
    const result = await this.pool.query<{ record_id: string | null; fingerprintMatches: boolean } & MedicalRecord>(
      `SELECT r.record_id, (r.request_fingerprint = $4::jsonb) AS "fingerprintMatches", ${select}
       FROM medical_record_service.idempotency_requests r
       LEFT JOIN medical_record_service.medical_records ON medical_record_service.medical_records.id = r.record_id
       WHERE r.actor_id = $1 AND r.operation = $2 AND r.idempotency_key = $3`,
      [actorId, operation, idempotencyKey, JSON.stringify(fingerprint)]
    );
    if (!result.rows[0]) return null;
    if (!result.rows[0].fingerprintMatches) throw new IdempotencyMismatchError();
    if (!result.rows[0].id) return null;
    return result.rows[0] as MedicalRecord;
  }

  async create(input: RecordInput, recipientUserId: string, idempotencyKey?: string, fingerprint?: Record<string, unknown>, finalization?: { proofId: string; contextId: string }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (idempotencyKey && fingerprint) {
        const claim = await client.query(
          `INSERT INTO medical_record_service.idempotency_requests
             (actor_id, operation, idempotency_key, request_fingerprint)
           VALUES ($1, 'CREATE', $2, $3::jsonb)
           ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING
           RETURNING actor_id`,
          [input.createdBy, idempotencyKey, JSON.stringify(fingerprint)]
        );
        if (claim.rowCount === 0) {
          const existing = await client.query<{ fingerprintMatches: boolean } & MedicalRecord>(
            `SELECT (r.request_fingerprint = $3::jsonb) AS "fingerprintMatches", ${select}
             FROM medical_record_service.idempotency_requests r
             JOIN medical_record_service.medical_records ON medical_record_service.medical_records.id = r.record_id
             WHERE r.actor_id = $1 AND r.operation = 'CREATE' AND r.idempotency_key = $2`,
            [input.createdBy, idempotencyKey, JSON.stringify(fingerprint)]
          );
          if (existing.rows[0]) {
            if (!existing.rows[0].fingerprintMatches) {
              await client.query("ROLLBACK");
              throw new IdempotencyMismatchError();
            }
            await client.query("ROLLBACK");
            return existing.rows[0];
          }
        }
      }
      const appointmentCompletion = input.status === "FINAL" ? "PENDING" : (input.appointmentCompletion ?? "NOT_REQUESTED");
      const result = await client.query<MedicalRecord>(
        `INSERT INTO medical_record_service.medical_records
        (appointment_id, patient_id, doctor_id, symptoms, diagnosis, notes, treatment_plan, prescription, status, version, appointment_completion, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${select}`,
        [input.appointmentId, input.patientId, input.doctorId, input.symptoms ?? null, input.diagnosis ?? null, input.notes ?? null, input.treatmentPlan ?? null, JSON.stringify(input.prescription), input.status, input.version ?? 1, appointmentCompletion, input.createdBy]
      );
      const record = result.rows[0];
      if (finalization) {
        const consumed = await client.query(
          `INSERT INTO medical_record_service.consumed_proofs (proof_id, purpose, record_id, context_id)
           VALUES ($1, 'FINALIZE_MEDICAL_RECORD', $2, $3)
           ON CONFLICT (proof_id) DO NOTHING RETURNING proof_id`,
          [finalization.proofId, record.id, finalization.contextId]
        );
        if (!consumed.rows[0]) throw new Error("PROOF_ALREADY_CONSUMED");
      }
      if (idempotencyKey && fingerprint) {
        await client.query(
          `UPDATE medical_record_service.idempotency_requests
           SET record_id = $3
           WHERE actor_id = $1 AND operation = 'CREATE' AND idempotency_key = $2`,
          [input.createdBy, idempotencyKey, record.id]
        );
      }
      // Logging safety: metadata only, no PHI or drug names
      await client.query(
        "INSERT INTO medical_record_service.medical_record_audit_logs (medical_record_id, actor_id, action, changes) VALUES ($1,$2,'CREATE',$3)",
        [record.id, input.createdBy, JSON.stringify({
          appointmentId: input.appointmentId,
          patientId: input.patientId,
          doctorId: input.doctorId,
          status: input.status,
          hasPrescription: (input.prescription?.length ?? 0) > 0
        })]
      );
      if (record.status === "FINAL") await this.enqueue(client, record, recipientUserId);
      await client.query("COMMIT");
      return record;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async update(id: string, changes: RecordChanges, actorId: string, recipientUserId: string, expectedVersion?: number, idempotencyKey?: string, fingerprint?: Record<string, unknown>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (idempotencyKey && fingerprint) {
        const claim = await client.query(
          `INSERT INTO medical_record_service.idempotency_requests
             (actor_id, operation, idempotency_key, request_fingerprint)
           VALUES ($1, 'UPDATE', $2, $3::jsonb)
           ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING
           RETURNING actor_id`,
          [actorId, idempotencyKey, JSON.stringify(fingerprint)]
        );
        if (claim.rowCount === 0) {
          const existing = await client.query<{ fingerprintMatches: boolean } & MedicalRecord>(
            `SELECT (r.request_fingerprint = $3::jsonb) AS "fingerprintMatches", ${select}
             FROM medical_record_service.idempotency_requests r
             JOIN medical_record_service.medical_records ON medical_record_service.medical_records.id = r.record_id
             WHERE r.actor_id = $1 AND r.operation = 'UPDATE' AND r.idempotency_key = $2`,
            [actorId, idempotencyKey, JSON.stringify(fingerprint)]
          );
          if (existing.rows[0]) {
            if (!existing.rows[0].fingerprintMatches) {
              await client.query("ROLLBACK");
              throw new IdempotencyMismatchError();
            }
            await client.query("ROLLBACK");
            return { record: existing.rows[0], replayed: true };
          }
        }
      }
      const locked = await client.query<MedicalRecord>(`SELECT ${select} FROM medical_record_service.medical_records WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
      const before = locked.rows[0];
      if (!before) { await client.query("ROLLBACK"); return null; }
      if (before.status === "FINAL" && changes.status === "DRAFT") { await client.query("ROLLBACK"); return { conflict: true as const }; }
      if (expectedVersion !== undefined && before.version !== expectedVersion) {
        await client.query("ROLLBACK");
        return { conflict: true as const, reason: "RECORD_VERSION_CONFLICT", record: before };
      }
      const columns: Record<keyof RecordChanges, string> = { symptoms: "symptoms", diagnosis: "diagnosis", notes: "notes", treatmentPlan: "treatment_plan", prescription: "prescription", status: "status" };
      const entries = Object.entries(changes) as [keyof RecordChanges, unknown][];
      if (entries.length === 0) { await client.query("ROLLBACK"); return { record: before }; }
      const values = entries.map(([key, value]) => key === "prescription" ? JSON.stringify(value) : value);
      const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 1}`).join(", ");
      const result = await client.query<MedicalRecord>(
        `UPDATE medical_record_service.medical_records
         SET ${assignments}, version = version + 1, updated_by = $${values.length + 1}, updated_at = now()
         WHERE id = $${values.length + 2} RETURNING ${select}`,
        [...values, actorId, id]
      );
      const record = result.rows[0];
      if (idempotencyKey && fingerprint) {
        await client.query(
          `UPDATE medical_record_service.idempotency_requests
           SET record_id = $3
           WHERE actor_id = $1 AND operation = 'UPDATE' AND idempotency_key = $2`,
          [actorId, idempotencyKey, record.id]
        );
      }
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

  async finalizeRecord(params: {
    recordId: string;
    expectedVersion: number;
    proofId: string;
    contextId?: string;
    actorId: string;
    recipientUserId: string;
    updates?: RecordChanges;
    idempotencyKey?: string;
    fingerprint?: Record<string, unknown>;
  }): Promise<
    | { success: true; record: MedicalRecord; replayed?: boolean }
    | { notFound: true }
    | { conflict: "ALREADY_FINAL" | "VERSION_CONFLICT" | "PROOF_ALREADY_CONSUMED" | "IDEMPOTENCY_MISMATCH"; record?: MedicalRecord }
  > {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (params.idempotencyKey && params.fingerprint) {
        const claim = await client.query(
          `INSERT INTO medical_record_service.idempotency_requests
             (actor_id, operation, idempotency_key, request_fingerprint)
           VALUES ($1, 'FINALIZE', $2, $3::jsonb)
           ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING
           RETURNING actor_id`,
          [params.actorId, params.idempotencyKey, JSON.stringify(params.fingerprint)]
        );
        if (claim.rowCount === 0) {
          const existing = await client.query<{ fingerprintMatches: boolean } & MedicalRecord>(
            `SELECT (r.request_fingerprint = $3::jsonb) AS "fingerprintMatches", ${select}
             FROM medical_record_service.idempotency_requests r
             JOIN medical_record_service.medical_records ON medical_record_service.medical_records.id = r.record_id
             WHERE r.actor_id = $1 AND r.operation = 'FINALIZE' AND r.idempotency_key = $2`,
            [params.actorId, params.idempotencyKey, JSON.stringify(params.fingerprint)]
          );
          if (existing.rows[0]) {
            if (!existing.rows[0].fingerprintMatches) {
              await client.query("ROLLBACK");
              throw new IdempotencyMismatchError();
            }
            await client.query("ROLLBACK");
            return { success: true, record: existing.rows[0], replayed: true };
          }
        }
      }
      const locked = await client.query<MedicalRecord>(
        `SELECT ${select} FROM medical_record_service.medical_records WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [params.recordId]
      );
      const before = locked.rows[0];
      if (!before) {
        await client.query("ROLLBACK");
        return { notFound: true };
      }
      if (before.status === "FINAL") {
        await client.query("ROLLBACK");
        return { conflict: "ALREADY_FINAL", record: before };
      }
      if (before.version !== params.expectedVersion) {
        await client.query("ROLLBACK");
        return { conflict: "VERSION_CONFLICT", record: before };
      }

      // Consume proof atomically to prevent race/replay
      const proofInsert = await client.query(
        `INSERT INTO medical_record_service.consumed_proofs (proof_id, purpose, record_id, context_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (proof_id) DO NOTHING
         RETURNING proof_id`,
        [params.proofId, "FINALIZE_MEDICAL_RECORD", params.recordId, params.contextId ?? null]
      );
      if (!proofInsert.rows[0]) {
        await client.query("ROLLBACK");
        return { conflict: "PROOF_ALREADY_CONSUMED" };
      }

      const symptoms = params.updates?.symptoms !== undefined ? params.updates.symptoms : before.symptoms;
      const diagnosis = params.updates?.diagnosis !== undefined ? params.updates.diagnosis : before.diagnosis;
      const notes = params.updates?.notes !== undefined ? params.updates.notes : before.notes;
      const treatmentPlan = params.updates?.treatmentPlan !== undefined ? params.updates.treatmentPlan : before.treatmentPlan;
      const prescription = params.updates?.prescription !== undefined ? params.updates.prescription : before.prescription;

      const result = await client.query<MedicalRecord>(
        `UPDATE medical_record_service.medical_records
         SET status = 'FINAL',
             version = version + 1,
             appointment_completion = 'PENDING',
             symptoms = $1,
             diagnosis = $2,
             notes = $3,
             treatment_plan = $4,
             prescription = $5,
             updated_by = $6,
             updated_at = now()
         WHERE id = $7
         RETURNING ${select}`,
        [symptoms ?? null, diagnosis ?? null, notes ?? null, treatmentPlan ?? null,
         JSON.stringify(prescription), params.actorId, params.recordId]
      );
      const record = result.rows[0];

      if (params.idempotencyKey && params.fingerprint) {
        await client.query(
          `UPDATE medical_record_service.idempotency_requests
           SET record_id = $3
           WHERE actor_id = $1 AND operation = 'FINALIZE' AND idempotency_key = $2`,
          [params.actorId, params.idempotencyKey, record.id]
        );
      }

      // Audit log: metadata only (safe logging)
      await client.query(
        "INSERT INTO medical_record_service.medical_record_audit_logs (medical_record_id, actor_id, action, changes) VALUES ($1,$2,'FINALIZE',$3)",
        [params.recordId, params.actorId, JSON.stringify({
          proofId: params.proofId,
          contextId: params.contextId,
          expectedVersion: params.expectedVersion,
          newVersion: record.version,
          outcome: "FINALIZED"
        })]
      );

      // Enqueue appointment.complete & medical-record.created
      await this.enqueue(client, record, params.recipientUserId);

      await client.query("COMMIT");
      return { success: true, record };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async markAppointmentCompletion(recordId: string, status: "COMPLETED") {
    await this.pool.query(
      `UPDATE medical_record_service.medical_records
       SET appointment_completion = $1, updated_at = now()
       WHERE id = $2`,
      [status, recordId]
    );
  }

  async createGrant(grant: {
    sessionId: string;
    doctorId: string;
    patientId: string;
    appointmentId: string;
    recordId?: string | null;
    accessMode: "CURRENT_ENCOUNTER" | "AUTHORED_HISTORY";
    expiresAt: Date;
  }, proofId: string): Promise<ClinicalGrant> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ClinicalGrant>(
      `INSERT INTO medical_record_service.clinical_grants
       (session_id, doctor_id, patient_id, appointment_id, record_id, access_mode, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, session_id AS "sessionId", doctor_id AS "doctorId", patient_id AS "patientId",
         appointment_id AS "appointmentId", record_id AS "recordId", access_mode AS "accessMode",
         issued_at AS "issuedAt", expires_at AS "expiresAt", revoked_at AS "revokedAt"`,
      [grant.sessionId, grant.doctorId, grant.patientId, grant.appointmentId, grant.recordId ?? null, grant.accessMode, grant.expiresAt]
      );
      const consumed = await client.query(
        `INSERT INTO medical_record_service.consumed_grant_proofs (proof_id, grant_id)
         VALUES ($1, $2) ON CONFLICT (proof_id) DO NOTHING RETURNING proof_id`,
        [proofId, result.rows[0].id]
      );
      if (!consumed.rows[0]) throw new Error("PROOF_ALREADY_CONSUMED");
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findGrantById(grantId: string): Promise<ClinicalGrant | null> {
    const result = await this.pool.query<ClinicalGrant>(
      `SELECT id, session_id AS "sessionId", doctor_id AS "doctorId", patient_id AS "patientId",
         appointment_id AS "appointmentId", record_id AS "recordId", access_mode AS "accessMode",
         issued_at AS "issuedAt", expires_at AS "expiresAt", revoked_at AS "revokedAt"
       FROM medical_record_service.clinical_grants
       WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [grantId]
    );
    return result.rows[0] ?? null;
  }

  async createFinalizationContext(context: {
    appointmentId: string;
    recordId?: string | null;
    doctorId: string;
    patientId: string;
    sessionId: string;
    expectedVersion: number;
    contentDigest: string;
    expiresAt: Date;
  }): Promise<FinalizationContext> {
    const result = await this.pool.query<FinalizationContext>(
      `INSERT INTO medical_record_service.finalization_contexts
       (appointment_id, record_id, doctor_id, patient_id, session_id, expected_version, content_digest, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, appointment_id AS "appointmentId", record_id AS "recordId", doctor_id AS "doctorId",
         patient_id AS "patientId", session_id AS "sessionId", expected_version AS "expectedVersion",
         content_digest AS "contentDigest", expires_at AS "expiresAt", created_at AS "createdAt"`,
      [context.appointmentId, context.recordId ?? null, context.doctorId, context.patientId, context.sessionId,
       context.expectedVersion, context.contentDigest, context.expiresAt]
    );
    return result.rows[0];
  }

  async findFinalizationContext(id: string): Promise<FinalizationContext | null> {
    const result = await this.pool.query<FinalizationContext>(
      `SELECT id, appointment_id AS "appointmentId", record_id AS "recordId", doctor_id AS "doctorId",
         patient_id AS "patientId", session_id AS "sessionId", expected_version AS "expectedVersion",
         content_digest AS "contentDigest", expires_at AS "expiresAt", created_at AS "createdAt"
       FROM medical_record_service.finalization_contexts
       WHERE id = $1 AND expires_at > now()`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async claimOutbox(limit = 20) {
    const result = await this.pool.query<OutboxEvent>(
      `WITH due AS (
         SELECT event.id FROM medical_record_service.outbox_events AS event
         WHERE ((event.status = 'PENDING' AND event.next_attempt_at <= now()) OR
                (event.status = 'PROCESSING' AND event.lease_expires_at <= now()))
           AND (event.event_type = 'appointment.complete' OR NOT EXISTS (
             SELECT 1 FROM medical_record_service.outbox_events AS completion
             WHERE completion.aggregate_id = event.aggregate_id AND completion.event_type = 'appointment.complete'
               AND completion.status <> 'SENT'))
         ORDER BY event.created_at FOR UPDATE OF event SKIP LOCKED LIMIT $1
       )
       UPDATE medical_record_service.outbox_events AS event
       SET status = 'PROCESSING', lease_expires_at = now() + interval '90 seconds'
       FROM due WHERE event.id = due.id
       RETURNING event.id, event.aggregate_id AS "aggregateId", event.event_type AS "eventType",
         event.payload, event.retry_count AS "retryCount"`, [limit]
    );
    return result.rows;
  }

  async markOutboxSent(id: string) {
    await this.pool.query("UPDATE medical_record_service.outbox_events SET status = 'SENT', lease_expires_at = NULL WHERE id = $1 AND status = 'PROCESSING'", [id]);
  }

  async deferOutbox(id: string, retryCount: number) {
    const delaySeconds = Math.min(3600, 2 ** Math.min(retryCount, 10));
    await this.pool.query(
      `UPDATE medical_record_service.outbox_events
       SET retry_count = retry_count + 1, status = CASE WHEN retry_count + 1 >= 8 THEN 'FAILED' ELSE 'PENDING' END,
         next_attempt_at = now() + ($2 * interval '1 second'), lease_expires_at = NULL
       WHERE id = $1 AND status = 'PROCESSING'`,
      [id, delaySeconds]
    );
  }

  async outboxStatusCounts() {
    const result = await this.pool.query<{ status: string; count: string }>(
      "SELECT status, count(*)::text AS count FROM medical_record_service.outbox_events GROUP BY status");
    return Object.fromEntries(result.rows.map(({ status, count }) => [status, Number(count)]));
  }
}
