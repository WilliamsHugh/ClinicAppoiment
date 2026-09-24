import type { Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

let app: Express;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:1/postgres";
  process.env.NODE_ENV = "test";
  ({ app } = await import("../src/index.js"));
});

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
});
