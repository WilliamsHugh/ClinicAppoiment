import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:net";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MedicalRecordRepository } from "../src/repository.js";

const recordDatabaseUrl = process.env.TEST_DATABASE_URL;
const appointmentDatabaseUrl = process.env.TEST_APPOINTMENT_DATABASE_URL;
const doctorDatabaseUrl = process.env.TEST_DOCTOR_DATABASE_URL;
const integration = recordDatabaseUrl && appointmentDatabaseUrl && doctorDatabaseUrl ? describe : describe.skip;

integration("Record completion through real Appointment and Doctor HTTP with separate databases", () => {
  const recordPool = new Pool({ connectionString: recordDatabaseUrl });
  const appointmentPool = new Pool({ connectionString: appointmentDatabaseUrl });
  const doctorPool = new Pool({ connectionString: doctorDatabaseUrl });
  const repository = new MedicalRecordRepository(recordPool);
  const appointmentId = randomUUID();
  const pendingAppointmentId = randomUUID();
  const patientId = randomUUID();
  const doctorId = randomUUID();
  const doctorUserId = randomUUID();
  const specialtyId = randomUUID();
  const recordToken = randomBytes(32).toString("hex");
  const doctorToken = randomBytes(32).toString("hex");
  const start = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  let appointmentUrl: string;
  let recordUrl: string;
  let recordServer: Server;
  let doctorChild: ChildProcess;
  let appointmentChild: ChildProcess;
  let recordApp: typeof import("../src/index.js");

  async function freePort() {
    return new Promise<number>((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") return reject(new Error("No test port"));
        server.close(() => resolve(address.port));
      });
    });
  }

  async function ready(child: ChildProcess, url: string) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`${url} exited during startup`);
      try { if ((await fetch(`${url}/health`)).ok) return; } catch { /* waiting for listener */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`${url} did not become ready`);
  }

  beforeAll(async () => {
    const [doctorPort, appointmentPort] = await Promise.all([freePort(), freePort()]);
    const doctorUrl = `http://127.0.0.1:${doctorPort}`;
    appointmentUrl = `http://127.0.0.1:${appointmentPort}`;
    const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
    doctorChild = spawn(process.execPath, ["--import", "tsx", "services/doctor-service/src/index.ts"], {
      cwd: repoRoot, stdio: "ignore", env: { ...process.env, NODE_ENV: "integration",
        DATABASE_URL: doctorDatabaseUrl, DATABASE_SSL: "false", DOCTOR_SERVICE_PORT: String(doctorPort),
        DOCTOR_INTERNAL_API_TOKEN: doctorToken }
    });
    await ready(doctorChild, doctorUrl);
    await doctorPool.query("INSERT INTO doctor_service.specialties (id, name) VALUES ($1,$2)",
      [specialtyId, `TV4-${specialtyId}`]);
    await doctorPool.query("INSERT INTO doctor_service.doctors (id, user_id, specialty_id, display_name) VALUES ($1,$2,$3,$4)",
      [doctorId, doctorUserId, specialtyId, "TV4 Test Doctor"]);

    vi.stubEnv("DATABASE_URL", recordDatabaseUrl!);
    vi.stubEnv("DATABASE_SSL", "false");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APPOINTMENT_RECORD_INTERNAL_API_TOKEN", recordToken);
    vi.stubEnv("DOCTOR_INTERNAL_API_TOKEN", doctorToken);
    vi.stubEnv("APPOINTMENT_SERVICE_URL", appointmentUrl);
    recordApp = await import("../src/index.js");
    await new Promise<void>((resolve) => {
      recordServer = recordApp.app.listen(0, "127.0.0.1", resolve);
    });
    const address = recordServer.address();
    if (!address || typeof address === "string") throw new Error("No Record listener");
    recordUrl = `http://127.0.0.1:${address.port}`;

    appointmentChild = spawn(process.execPath, ["--import", "tsx", "services/appointment-service/src/index.ts"], {
      cwd: repoRoot, stdio: "ignore", env: { ...process.env, NODE_ENV: "integration",
        DATABASE_URL: appointmentDatabaseUrl, DATABASE_SSL: "false", APPOINTMENT_SERVICE_PORT: String(appointmentPort),
        APPOINTMENT_RECORD_INTERNAL_API_TOKEN: recordToken, DOCTOR_INTERNAL_API_TOKEN: doctorToken,
        DOCTOR_SERVICE_URL: doctorUrl, MEDICAL_RECORD_SERVICE_URL: recordUrl,
        APPOINTMENT_OUTBOX_POLL_MS: "60000" }
    });
    await ready(appointmentChild, appointmentUrl);
    for (const [id, status, offsetHours] of [[appointmentId, "CHECKED_IN", 0], [pendingAppointmentId, "PENDING", 1]] as const) {
      const scheduledStart = new Date(Date.parse(start) + offsetHours * 60 * 60 * 1000).toISOString();
      await appointmentPool.query(
        `INSERT INTO appointment_service.appointments
         (id, patient_id, doctor_id, scheduled_start_at, scheduled_end_at, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$2)`,
        [id, patientId, doctorId, scheduledStart, new Date(Date.parse(scheduledStart) + 30 * 60 * 1000).toISOString(), status]);
    }
  }, 20_000);

  afterAll(async () => {
    if (appointmentChild?.exitCode === null) appointmentChild.kill("SIGTERM");
    if (doctorChild?.exitCode === null) doctorChild.kill("SIGTERM");
    if (recordServer) await new Promise<void>((resolve) => recordServer.close(() => resolve()));
    for (const id of [appointmentId, pendingAppointmentId]) {
      const records = await recordPool.query<{ id: string }>(
        "SELECT id FROM medical_record_service.medical_records WHERE appointment_id = $1", [id]);
      for (const record of records.rows) {
        await recordPool.query("DELETE FROM medical_record_service.outbox_events WHERE aggregate_id = $1", [record.id]);
        await recordPool.query("DELETE FROM medical_record_service.medical_record_audit_logs WHERE medical_record_id = $1", [record.id]);
        await recordPool.query("DELETE FROM medical_record_service.medical_records WHERE id = $1", [record.id]);
      }
      await appointmentPool.query("DELETE FROM appointment_service.appointment_outbox_events WHERE aggregate_id = $1", [id]);
      await appointmentPool.query("DELETE FROM appointment_service.appointment_status_history WHERE appointment_id = $1", [id]);
      await appointmentPool.query("DELETE FROM appointment_service.appointment_completions WHERE appointment_id = $1", [id]);
      await appointmentPool.query("DELETE FROM appointment_service.appointments WHERE id = $1", [id]);
    }
    await doctorPool.query("DELETE FROM doctor_service.doctors WHERE id = $1", [doctorId]);
    await doctorPool.query("DELETE FROM doctor_service.specialties WHERE id = $1", [specialtyId]);
    await Promise.all([recordPool.end(), appointmentPool.end(), doctorPool.end()]);
    vi.unstubAllEnvs();
  });

  it("completes a checked-in appointment once after final record commit and protects the callback", async () => {
    const endpoint = `${appointmentUrl}/internal/v1/appointments/${appointmentId}/complete-from-record`;
    const post = (token: string | null, recordId: string) => fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "X-Internal-Token": token } : {}) },
      body: JSON.stringify({ recordId })
    });
    const final = await repository.create({ appointmentId, patientId, doctorId, createdBy: doctorUserId,
      prescription: [], status: "FINAL" }, randomUUID());
    expect((await post(null, final.id)).status).toBe(401);
    expect((await post(randomBytes(32).toString("hex"), final.id)).status).toBe(401);
    const publicResponse = await fetch(`${appointmentUrl}/api/v1/appointments/${appointmentId}/complete`, {
      method: "PATCH", headers: { "x-user-id": doctorUserId, "x-role": "DOCTOR" }
    });
    expect(publicResponse.status).toBe(409);
    const lookup = await fetch(`${recordUrl}/internal/v1/medical-records/by-appointment/${appointmentId}`);
    expect(lookup.status).toBe(401);
    const callbackRecord = await fetch(`${recordUrl}/internal/v1/medical-records/by-appointment/${appointmentId}`,
      { headers: { "X-Internal-Token": recordToken } });
    expect((await callbackRecord.json()).data).toEqual({ id: final.id, appointmentId, patientId, doctorId,
      status: "FINAL", createdBy: doctorUserId, updatedBy: null });

    await recordApp.sendOutbox();
    const result = await appointmentPool.query<{ status: string }>(
      "SELECT status FROM appointment_service.appointments WHERE id = $1", [appointmentId]);
    expect(result.rows[0].status).toBe("COMPLETED");
    const completion = await appointmentPool.query<{ record_id: string; doctor_user_id: string }>(
      "SELECT record_id, doctor_user_id FROM appointment_service.appointment_completions WHERE appointment_id = $1", [appointmentId]);
    expect(completion.rows).toEqual([{ record_id: final.id, doctor_user_id: doctorUserId }]);
    expect((await post(recordToken, final.id)).status).toBe(200);
    expect((await post(recordToken, randomUUID())).status).toBe(409);
    const history = await appointmentPool.query(
      "SELECT id FROM appointment_service.appointment_status_history WHERE appointment_id = $1 AND to_status = 'COMPLETED'", [appointmentId]);
    const outbox = await appointmentPool.query(
      "SELECT id FROM appointment_service.appointment_outbox_events WHERE aggregate_id = $1 AND event_type = 'appointment.completed'", [appointmentId]);
    expect(history.rowCount).toBe(1);
    expect(outbox.rowCount).toBe(1);
  }, 15_000);

  it("rejects completion before check-in without changing appointment state", async () => {
    const response = await fetch(`${appointmentUrl}/internal/v1/appointments/${pendingAppointmentId}/complete-from-record`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Internal-Token": recordToken },
      body: JSON.stringify({ recordId: randomUUID() })
    });
    expect(response.status).toBe(409);
    const appointment = await appointmentPool.query<{ status: string }>(
      "SELECT status FROM appointment_service.appointments WHERE id = $1", [pendingAppointmentId]);
    expect(appointment.rows[0].status).toBe("PENDING");
  });
});
