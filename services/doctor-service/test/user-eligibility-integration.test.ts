import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDoctorApp } from "../src/app.js";
import { createUserDirectory } from "../src/dependencies.js";
import type { DoctorRepository } from "../src/repository.js";
import { createDoctorEligibilityHandler } from "../../user-service/src/doctor-eligibility.js";
import type { UserRepository } from "../../user-service/src/repository.js";

const userId = "00000000-0000-4000-8000-000000000002";
const specialtyId = "00000000-0000-4000-8000-000000000004";
const doctor = { id: "00000000-0000-4000-8000-000000000001", userId, specialtyId,
  displayName: "Dr A", bio: null, isActive: true, createdAt: "", updatedAt: "" };

afterEach(() => vi.unstubAllGlobals());

function fixture(role: "DOCTOR" | "PATIENT", status: "ACTIVE" | "INACTIVE" | "LOCKED", exists = true) {
  const userRepository = { findUserById: vi.fn().mockResolvedValue(exists ? {
    id: userId, role, status, email: "private@example.com", fullName: "Private Name",
    supabaseAuthUserId: "00000000-0000-4000-8000-000000000099"
  } : null) };
  const userApp = express();
  userApp.get("/internal/v1/users/:userId/doctor-eligibility",
    createDoctorEligibilityHandler(userRepository as unknown as UserRepository));
  const upstream = vi.fn(async (url: URL, options: RequestInit) => {
    const response = await request(userApp).get(url.pathname)
      .set(options.headers as Record<string, string>);
    return new Response(JSON.stringify(response.body), { status: response.status });
  });
  vi.stubGlobal("fetch", upstream);

  const repository = {
    findSpecialty: vi.fn().mockResolvedValue({ id: specialtyId, isActive: true }),
    createDoctor: vi.fn().mockResolvedValue(doctor)
  };
  const app = createDoctorApp(repository as unknown as DoctorRepository,
    createUserDirectory("http://user-service:3001"));
  return { app, repository, userRepository, upstream };
}

describe("admin links a doctor through the User Service internal contract", () => {
  it("creates a doctor from an active DOCTOR account", async () => {
    const { app, repository, userRepository, upstream } = fixture("DOCTOR", "ACTIVE");
    const response = await request(app).post("/api/v1/doctors")
      .set("X-User-Id", userId).set("X-Role", "ADMIN").set("X-Request-Id", "create-doctor-1")
      .send({ userId, specialtyId, displayName: "Dr A" });
    expect(response.status).toBe(201);
    expect(repository.createDoctor).toHaveBeenCalledOnce();
    expect(userRepository.findUserById).toHaveBeenCalledWith(userId);
    expect(upstream.mock.calls[0]?.[1].headers).toEqual({
      Accept: "application/json", "X-Request-Id": "create-doctor-1"
    });
    expect(response.body.data.id).toBe(doctor.id);
  });

  it.each([
    ["PATIENT", "ACTIVE"],
    ["DOCTOR", "LOCKED"],
    ["DOCTOR", "INACTIVE"]
  ] as const)("rejects an account with role %s and status %s", async (role, status) => {
    const { app, repository } = fixture(role, status);
    const response = await request(app).post("/api/v1/doctors")
      .set("X-User-Id", userId).set("X-Role", "ADMIN")
      .send({ userId, specialtyId, displayName: "Dr A" });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("DOCTOR_ACCOUNT_INVALID");
    expect(repository.createDoctor).not.toHaveBeenCalled();
  });

  it("rejects a missing account", async () => {
    const { app, repository } = fixture("DOCTOR", "ACTIVE", false);
    const response = await request(app).post("/api/v1/doctors")
      .set("X-User-Id", userId).set("X-Role", "ADMIN")
      .send({ userId, specialtyId, displayName: "Dr A" });
    expect(response.status).toBe(422);
    expect(repository.createDoctor).not.toHaveBeenCalled();
  });
});
