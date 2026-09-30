import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createDoctorEligibilityHandler } from "../src/doctor-eligibility.js";
import type { UserRepository } from "../src/repository.js";

const userId = "00000000-0000-4000-8000-000000000002";

function fixture(user: unknown) {
  const repository = { findUserById: vi.fn().mockResolvedValue(user) };
  const app = express();
  app.get("/internal/v1/users/:userId/doctor-eligibility",
    createDoctorEligibilityHandler(repository as unknown as UserRepository));
  return { app, repository };
}

describe("internal doctor eligibility", () => {
  it("returns only the account fields needed by Doctor Service", async () => {
    const { app, repository } = fixture({ id: userId, role: "DOCTOR", status: "ACTIVE",
      email: "private@example.com", supabaseAuthUserId: "auth-id", fullName: "Private Name" });
    const response = await request(app).get(`/internal/v1/users/${userId}/doctor-eligibility`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { id: userId, role: "DOCTOR", status: "ACTIVE" } });
    expect(repository.findUserById).toHaveBeenCalledWith(userId);
  });

  it("returns 404 for an unknown account", async () => {
    const { app } = fixture(null);
    const response = await request(app).get(`/internal/v1/users/${userId}/doctor-eligibility`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_FOUND");
  });

  it("rejects an invalid ID before querying the repository", async () => {
    const { app, repository } = fixture(null);
    const response = await request(app).get("/internal/v1/users/not-a-uuid/doctor-eligibility");
    expect(response.status).toBe(400);
    expect(repository.findUserById).not.toHaveBeenCalled();
  });
});
