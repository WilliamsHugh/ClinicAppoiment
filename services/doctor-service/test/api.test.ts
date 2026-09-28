import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createDoctorApp } from "../src/app.js";
import type { DoctorRepository } from "../src/repository.js";

const identity = { "X-User-Id": "patient-user", "X-Role": "PATIENT" };
const repository = {
  listDoctors: vi.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 }),
} as unknown as DoctorRepository;
const app = createDoctorApp(repository, { findDoctorAccount: vi.fn() });

describe("Doctor Service authorization", () => {
  it("requires a verified gateway identity for public APIs", async () => {
    const response = await request(app).get("/api/v1/doctors");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_TOKEN_MISSING");
  });

  it("allows authenticated actors to read doctors", async () => {
    const response = await request(app).get("/api/v1/doctors").set(identity);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("keeps doctor administration inside the service", async () => {
    const response = await request(app)
      .post("/api/v1/doctors")
      .set(identity)
      .send({
        userId: "doctor-user",
        specialtyId: "specialty-general",
        displayName: "Bác sĩ thử nghiệm"
      });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCESS_DENIED");
  });

  it("returns a standardized 404 for an unknown endpoint in its prefix", async () => {
    const response = await request(app)
      .get("/api/v1/doctors/doctor-1/not-implemented")
      .set(identity);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});
