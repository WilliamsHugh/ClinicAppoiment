import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createDoctorEligibilityHandler } from "../src/doctor-eligibility.js";
import { requireInternalCaller, type InternalCredentials } from "../src/internal-auth.js";
import { createPatientLookupHandler } from "../src/internal-patients.js";
import type { PatientProfile, UserProfile, UserRepository } from "../src/repository.js";

const userId = "10000000-0000-4000-8000-000000000001";
const patientId = "30000000-0000-4000-8000-000000000001";
const doctorToken = "doctor-to-user-secret-at-least-32-bytes";
const appointmentToken = "appointment-to-user-secret-at-least-32-bytes";
const recordToken = "record-to-user-secret-at-least-32-bytes";
const gatewayToken = "gateway-to-user-secret-at-least-32-bytes";
const credentials: InternalCredentials = {
  gateway: gatewayToken, doctor: doctorToken, appointment: appointmentToken, record: recordToken,
};

function fixture(config: InternalCredentials = credentials) {
  const user: UserProfile = {
    id: userId, supabaseAuthUserId: "20000000-0000-4000-8000-000000000001",
    email: "private@example.com", fullName: "Private Name", role: "DOCTOR", status: "ACTIVE",
  };
  const patient: PatientProfile = {
    id: patientId, userId, address: "Private address", insuranceNumber: "Private insurance",
  };
  const repository = {
    findUserById: vi.fn(async (id: string) => id === userId ? user : null),
    findPatientById: vi.fn(async (id: string) => id === patientId ? patient : null),
    findPatientByUserId: vi.fn(async (id: string) => id === userId ? patient : null),
  } as unknown as UserRepository;
  const app = express();
  app.get("/internal/v1/auth/verify", requireInternalCaller(["gateway"], config),
    (_req, res) => res.json({ success: true }));
  app.get("/internal/v1/users/:userId/doctor-eligibility",
    requireInternalCaller(["doctor"], config), createDoctorEligibilityHandler(repository));
  app.get("/internal/v1/patients/by-user/:userId",
    requireInternalCaller(["appointment", "record"], config),
    createPatientLookupHandler(repository, "userId"));
  app.get("/internal/v1/patients/:id",
    requireInternalCaller(["appointment", "record"], config),
    createPatientLookupHandler(repository, "id"));
  return { app, repository };
}

describe("M2-USER-001 internal lookup boundaries", () => {
  it("reserves token verification for the Gateway credential", async () => {
    const { app } = fixture();
    const denied = await request(app).get("/internal/v1/auth/verify")
      .set("X-Internal-Token", doctorToken);
    const allowed = await request(app).get("/internal/v1/auth/verify")
      .set("X-Internal-Token", gatewayToken);
    expect(denied.status).toBe(401);
    expect(allowed.status).toBe(200);
  });

  it("requires the Doctor caller credential before querying eligibility", async () => {
    const { app, repository } = fixture();
    for (const token of [undefined, "wrong", appointmentToken, gatewayToken]) {
      const call = request(app).get(`/internal/v1/users/${userId}/doctor-eligibility`);
      const response = await (token ? call.set("X-Internal-Token", token) : call);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INTERNAL_AUTH_REQUIRED");
    }
    expect(repository.findUserById).not.toHaveBeenCalled();
  });

  it("returns only application user ID, role and status for Doctor", async () => {
    const { app, repository } = fixture();
    const response = await request(app).get(`/internal/v1/users/${userId}/doctor-eligibility`)
      .set("X-Internal-Token", doctorToken);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { id: userId, role: "DOCTOR", status: "ACTIVE" } });
    expect(repository.findUserById).toHaveBeenCalledWith(userId);
  });

  it("exposes non-eligible role and locked status so Doctor can reject the link", async () => {
    const { app, repository } = fixture();
    vi.mocked(repository.findUserById).mockResolvedValueOnce({
      id: userId, role: "PATIENT", status: "LOCKED",
    } as UserProfile);
    const response = await request(app).get(`/internal/v1/users/${userId}/doctor-eligibility`)
      .set("X-Internal-Token", doctorToken);
    expect(response.body.data).toEqual({ id: userId, role: "PATIENT", status: "LOCKED" });
  });

  it("rejects invalid and unknown User IDs", async () => {
    const { app, repository } = fixture();
    const invalid = await request(app).get("/internal/v1/users/not-a-uuid/doctor-eligibility")
      .set("X-Internal-Token", doctorToken);
    const missing = await request(app).get("/internal/v1/users/10000000-0000-4000-8000-000000000002/doctor-eligibility")
      .set("X-Internal-Token", doctorToken);
    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
    expect(repository.findUserById).toHaveBeenCalledTimes(1);
  });

  it("limits patient mapping to Appointment and Record and returns no profile fields", async () => {
    const { app, repository } = fixture();
    for (const path of [`/internal/v1/patients/${patientId}`, `/internal/v1/patients/by-user/${userId}`]) {
      for (const token of [undefined, doctorToken, gatewayToken]) {
        const call = request(app).get(path);
        const response = await (token ? call.set("X-Internal-Token", token) : call);
        expect(response.status).toBe(401);
      }
      for (const token of [appointmentToken, recordToken]) {
        const response = await request(app).get(path).set("X-Internal-Token", token);
        expect(response.body).toEqual({ success: true, data: { id: patientId, userId } });
      }
    }
    expect(repository.findPatientById).toHaveBeenCalledTimes(2);
    expect(repository.findPatientByUserId).toHaveBeenCalledTimes(2);
  });

  it("does not query patients for invalid IDs and returns 404 for unknown mapping", async () => {
    const { app, repository } = fixture();
    const invalid = await request(app).get("/internal/v1/patients/not-a-uuid")
      .set("X-Internal-Token", appointmentToken);
    const missing = await request(app).get("/internal/v1/patients/by-user/10000000-0000-4000-8000-000000000002")
      .set("X-Internal-Token", recordToken);
    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
    expect(repository.findPatientById).not.toHaveBeenCalled();
  });

  it("fails closed for weak or duplicate configured credentials", async () => {
    const weak = fixture({ ...credentials, doctor: "short" });
    const duplicate = fixture({ ...credentials, record: doctorToken });
    const weakResponse = await request(weak.app).get(`/internal/v1/users/${userId}/doctor-eligibility`)
      .set("X-Internal-Token", "short");
    const duplicateResponse = await request(duplicate.app).get(`/internal/v1/patients/${patientId}`)
      .set("X-Internal-Token", recordToken);
    expect(weakResponse.status).toBe(503);
    expect(duplicateResponse.status).toBe(503);
    expect(weak.repository.findUserById).not.toHaveBeenCalled();
    expect(duplicate.repository.findPatientById).not.toHaveBeenCalled();
  });
});
