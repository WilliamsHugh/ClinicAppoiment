import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createAuthRouter, createInternalVerifyHandler, type AuthProvider } from "../src/auth.js";
import type { UserProfile, UserRepository } from "../src/repository.js";

const profile: UserProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  supabaseAuthUserId: "22222222-2222-4222-8222-222222222222",
  email: "patient@example.com",
  fullName: "Patient One",
  role: "PATIENT",
  status: "ACTIVE"
};

function dependencies() {
  const provider: AuthProvider = {
    signIn: vi.fn(async () => ({
      authUserId: profile.supabaseAuthUserId,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600
    })),
    signUp: vi.fn(),
    refresh: vi.fn(),
    signOut: vi.fn(),
    verify: vi.fn(async (token) => token === "valid-token" ? profile.supabaseAuthUserId : null)
  };
  const repository = {
    findUserByAuthId: vi.fn(async (id: string) => id === profile.supabaseAuthUserId ? profile : null)
  } as unknown as UserRepository;
  const app = express();
  app.use(express.json());
  app.use("/api/v1/auth", createAuthRouter(provider, repository));
  app.get("/internal/v1/auth/verify", createInternalVerifyHandler(provider, repository));
  return { app, provider, repository };
}

describe("User Service authentication ownership", () => {
  it("registers a patient through the User Service auth provider", async () => {
    const { app, provider } = dependencies();
    vi.mocked(provider.signUp).mockResolvedValue({
      authUserId: profile.supabaseAuthUserId,
      tokens: null
    });
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ fullName: "Patient One", email: "patient@example.com", password: "secret12" });

    expect(response.status).toBe(201);
    expect(provider.signUp).toHaveBeenCalledWith("Patient One", "patient@example.com", "secret12");
    expect(response.body.data).toEqual({ requiresEmailConfirmation: true });
  });

  it("validates credentials and returns the application profile session", async () => {
    const { app, provider } = dependencies();
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "patient@example.com", password: "secret12" });

    expect(response.status).toBe(200);
    expect(provider.signIn).toHaveBeenCalledWith("patient@example.com", "secret12");
    expect(response.body.data).toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { id: profile.id, role: "PATIENT" }
    });
  });

  it("owns auth payload validation instead of relying on Gateway", async () => {
    const { app, provider } = dependencies();
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "invalid", password: "123" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(provider.signIn).not.toHaveBeenCalled();
  });

  it("verifies access tokens internally and resolves the trusted role", async () => {
    const { app } = dependencies();
    const response = await request(app)
      .get("/internal/v1/auth/verify")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: profile.id,
      authUserId: profile.supabaseAuthUserId,
      role: "PATIENT",
      status: "ACTIVE"
    });
  });
});
