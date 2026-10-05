import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { UserRepository, type UserProfile } from "../src/repository.js";

let app: Express;
const user: UserProfile = {
  id: "10000000-0000-4000-8000-000000000001",
  supabaseAuthUserId: "20000000-0000-4000-8000-000000000001",
  email: "patient@example.com",
  fullName: "Patient One",
  role: "PATIENT",
  status: "ACTIVE",
};

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:1/postgres";
  process.env.NODE_ENV = "test";
  process.env.DOCTOR_USER_INTERNAL_API_TOKEN = "";
  process.env.APPOINTMENT_USER_INTERNAL_API_TOKEN = "";
  ({ app } = await import("../src/index.js"));
});

afterEach(() => vi.restoreAllMocks());

describe("User Service authorization", () => {
  it("requires trusted identity headers for a public API", async () => {
    const response = await request(app).get("/api/v1/users/me");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("keeps user enumeration restricted to administrators", async () => {
    const response = await request(app)
      .get("/api/v1/users")
      .set("X-User-Id", "patient-user")
      .set("X-Role", "PATIENT");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCESS_DENIED");
  });

  it("does not allow self-profile updates to include a role", async () => {
    const response = await request(app)
      .patch("/api/v1/users/me")
      .set("X-User-Id", "patient-user")
      .set("X-Role", "PATIENT")
      .send({ role: "ADMIN" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("never exposes the Supabase Auth ID through public profile APIs", async () => {
    vi.spyOn(UserRepository.prototype, "findUserById").mockResolvedValue(user);
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("X-User-Id", user.id)
      .set("X-Role", "PATIENT");

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: user.id, role: "PATIENT" });
    expect(response.body.data).not.toHaveProperty("supabaseAuthUserId");
  });

  it("validates patient profile fields before reaching the repository", async () => {
    const response = await request(app)
      .patch("/api/v1/patients/30000000-0000-4000-8000-000000000001")
      .set("X-User-Id", user.id)
      .set("X-Role", "PATIENT")
      .send({ dateOfBirth: "not-a-date", gender: "UNKNOWN" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns a dependency error when doctor patient scope cannot be verified", async () => {
    const response = await request(app)
      .get("/api/v1/patients?appointmentId=30000000-0000-4000-8000-000000000001")
      .set("X-User-Id", "50000000-0000-4000-8000-000000000001")
      .set("X-Role", "DOCTOR");

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("PATIENT_SCOPE_UNAVAILABLE");
  });
});
