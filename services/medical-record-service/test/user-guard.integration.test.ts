import { randomUUID } from "node:crypto";
import { type Server } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const providerRoot = process.env.TEST_USER_PROVIDER_ROOT;
const integration = providerRoot ? describe : describe.skip;
const ids = { user: randomUUID(), patient: randomUUID(), doctorUser: randomUUID(),
  doctor: randomUUID(), appointment: randomUUID(), record: randomUUID() };
const recordToken = "record-to-user-integration-credential-at-least-32-bytes";
const otherToken = "appointment-to-user-integration-credential-at-least-32-bytes";

const mocks = vi.hoisted(() => ({ findAll: vi.fn(), create: vi.fn() }));
vi.mock("pg", () => ({ Pool: class { query = vi.fn() } }));
vi.mock("../src/repository.js", () => ({ MedicalRecordRepository: class {
  findAll = mocks.findAll; create = mocks.create;
} }));

integration("Record Patient lookups through TV2's real User guard", () => {
  let userServer: Server;
  let recordApp: typeof import("../src/index.js")["app"];
  let userUrl: string;
  let lookupByUser: ReturnType<typeof vi.fn>;
  let lookupById: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    const authPath = pathToFileURL(join(providerRoot!, "services/user-service/src/internal-auth.ts")).href;
    const patientsPath = pathToFileURL(join(providerRoot!, "services/user-service/src/internal-patients.ts")).href;
    const { requireInternalCaller } = await import(/* @vite-ignore */ authPath) as {
      requireInternalCaller: (allowed: Array<"appointment" | "record">,
        credentials: Record<string, string>) => express.RequestHandler;
    };
    const { createPatientLookupHandler } = await import(/* @vite-ignore */ patientsPath) as {
      createPatientLookupHandler: (repository: unknown, key: "id" | "userId") => express.RequestHandler;
    };
    lookupByUser = vi.fn(async (id: string) => id === ids.user ? { id: ids.patient, userId: ids.user } : null);
    lookupById = vi.fn(async (id: string) => id === ids.patient ? { id: ids.patient, userId: ids.user } : null);
    const repository = { findPatientByUserId: lookupByUser, findPatientById: lookupById };
    const userApp = express();
    const credentials = { appointment: otherToken, record: recordToken };
    userApp.get("/internal/v1/patients/by-user/:userId",
      requireInternalCaller(["appointment", "record"], credentials),
      createPatientLookupHandler(repository, "userId"));
    userApp.get("/internal/v1/patients/:id",
      requireInternalCaller(["appointment", "record"], credentials),
      createPatientLookupHandler(repository, "id"));
    await new Promise<void>((resolve) => { userServer = userApp.listen(0, "127.0.0.1", resolve); });
    const address = userServer.address();
    if (!address || typeof address === "string") throw new Error("No User listener");
    userUrl = `http://127.0.0.1:${address.port}`;

    vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@localhost:5432/fixture");
    vi.stubEnv("USER_SERVICE_URL", userUrl);
    vi.stubEnv("USER_RECORD_INTERNAL_API_TOKEN", recordToken);
    vi.stubEnv("DOCTOR_INTERNAL_API_TOKEN", "record-doctor-integration-credential-at-least-32-bytes");
    vi.stubEnv("APPOINTMENT_RECORD_INTERNAL_API_TOKEN", "record-appointment-integration-credential-at-least-32-bytes");
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(userUrl)) return realFetch(input, init);
      if (url.includes("verify-for-medical-record")) return Promise.resolve(Response.json({ success: true,
        data: { valid: true, appointment: { id: ids.appointment, patientId: ids.patient,
          doctorId: ids.doctor, status: "CHECKED_IN" } } }));
      if (url.includes("doctors/by-user")) return Promise.resolve(Response.json({ success: true,
        data: { id: ids.doctor, userId: ids.doctorUser, isActive: true } }));
      throw new Error(`Unexpected test dependency: ${url}`);
    }));
    ({ app: recordApp } = await import("../src/index.js"));
  });

  afterAll(async () => {
    if (userServer) await new Promise<void>((resolve) => userServer.close(() => resolve()));
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the Record credential for by-user listing and by-id creation", async () => {
    mocks.findAll.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
    mocks.create.mockResolvedValue({ id: ids.record });
    const list = await request(recordApp).get("/api/v1/medical-records")
      .set("X-User-Id", ids.user).set("X-Role", "PATIENT");
    const create = await request(recordApp).post("/api/v1/medical-records")
      .set("X-User-Id", ids.doctorUser).set("X-Role", "DOCTOR")
      .send({ appointmentId: ids.appointment, patientId: ids.patient, doctorId: ids.doctor });
    expect(list.status).toBe(200);
    expect(create.status).toBe(201);
    expect(lookupByUser).toHaveBeenCalledWith(ids.user);
    expect(lookupById).toHaveBeenCalledWith(ids.patient);
  });

  it("fails closed when User rejects the Record caller credential", async () => {
    const calls = lookupByUser.mock.calls.length;
    vi.stubEnv("USER_RECORD_INTERNAL_API_TOKEN", "wrong-record-integration-credential-at-least-32-bytes");
    const denied = await request(recordApp).get("/api/v1/medical-records")
      .set("X-User-Id", ids.user).set("X-Role", "PATIENT");
    expect(denied.status).toBe(503);
    expect(lookupByUser.mock.calls.length).toBe(calls);
    vi.stubEnv("USER_RECORD_INTERNAL_API_TOKEN", recordToken);
  });
});
