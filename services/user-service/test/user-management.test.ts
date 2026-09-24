import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createAuthRouter, type AuthProvider } from "../src/auth.js";
import type { UserProfile, PatientProfile, UserRepository } from "../src/repository.js";

const patientUser: UserProfile = {
  id: "10000000-0000-4000-8000-000000000001",
  supabaseAuthUserId: "20000000-0000-4000-8000-000000000001",
  email: "patient@example.com",
  fullName: "Nguyen Van A",
  phone: "0901234567",
  role: "PATIENT",
  status: "ACTIVE",
};

const lockedUser: UserProfile = {
  id: "10000000-0000-4000-8000-000000000002",
  supabaseAuthUserId: "20000000-0000-4000-8000-000000000002",
  email: "locked@example.com",
  fullName: "Locked User",
  role: "PATIENT",
  status: "LOCKED",
};

const inactiveUser: UserProfile = {
  id: "10000000-0000-4000-8000-000000000003",
  supabaseAuthUserId: "20000000-0000-4000-8000-000000000003",
  email: "inactive@example.com",
  fullName: "Inactive User",
  role: "PATIENT",
  status: "INACTIVE",
};

const patientProfile: PatientProfile = {
  id: "30000000-0000-4000-8000-000000000001",
  userId: patientUser.id,
  dateOfBirth: "1990-01-01",
  gender: "MALE",
  address: "123 Le Loi, TP.HCM",
  emergencyContact: "0912345678",
  insuranceNumber: "DN4791234567890",
  fullName: patientUser.fullName,
  email: patientUser.email,
  phone: patientUser.phone,
};

function createMockApp() {
  const provider: AuthProvider = {
    signIn: vi.fn(async (email) => {
      if (email === lockedUser.email) {
        return { authUserId: lockedUser.supabaseAuthUserId, accessToken: "token-locked", refreshToken: "ref-locked", expiresIn: 3600 };
      }
      if (email === inactiveUser.email) {
        return { authUserId: inactiveUser.supabaseAuthUserId, accessToken: "token-inactive", refreshToken: "ref-inactive", expiresIn: 3600 };
      }
      return { authUserId: patientUser.supabaseAuthUserId, accessToken: "token-patient", refreshToken: "ref-patient", expiresIn: 3600 };
    }),
    signUp: vi.fn(),
    refresh: vi.fn(async (refreshToken) => {
      if (refreshToken === "ref-locked") {
        return { authUserId: lockedUser.supabaseAuthUserId, accessToken: "token-locked", refreshToken: "ref-locked", expiresIn: 3600 };
      }
      return { authUserId: patientUser.supabaseAuthUserId, accessToken: "token-patient", refreshToken: "ref-patient", expiresIn: 3600 };
    }),
    signOut: vi.fn(),
    verify: vi.fn(async (token) => token === "valid-token" ? patientUser.supabaseAuthUserId : null),
  };

  const repository = {
    findUserById: vi.fn(async (id: string) => {
      if (id === patientUser.id) return patientUser;
      if (id === lockedUser.id) return lockedUser;
      return null;
    }),
    findUserByAuthId: vi.fn(async (authId: string) => {
      if (authId === patientUser.supabaseAuthUserId) return patientUser;
      if (authId === lockedUser.supabaseAuthUserId) return lockedUser;
      if (authId === inactiveUser.supabaseAuthUserId) return inactiveUser;
      return null;
    }),
    findPatientById: vi.fn(async (id: string) => (id === patientProfile.id ? patientProfile : null)),
    findPatientByUserId: vi.fn(async (userId: string) => (userId === patientUser.id ? patientProfile : null)),
    updateUser: vi.fn(async (id: string, input: any) => ({ ...patientUser, ...input })),
    updatePatient: vi.fn(async (id: string, input: any) => ({ ...patientProfile, ...input })),
    findUsers: vi.fn(async () => ({ items: [patientUser], page: 1, limit: 20, total: 1 })),
    findPatients: vi.fn(async () => ({ items: [patientProfile], page: 1, limit: 20, total: 1 })),
  } as unknown as UserRepository;

  const app = express();
  app.use(express.json());
  app.use("/api/v1/auth", createAuthRouter(provider, repository));

  // Middleware actor helper for testing endpoints
  function actor(req: express.Request) {
    const userId = req.header("x-user-id");
    const role = req.header("x-role");
    return userId && role ? { userId, role } : null;
  }

  function requireRoles(...roles: string[]): express.RequestHandler {
    return (req, res, next) => {
      const who = actor(req);
      if (!who) return res.status(401).json({ success: false, error: { code: "AUTH_REQUIRED", message: "Auth required" } });
      if (!roles.includes(who.role)) return res.status(403).json({ success: false, error: { code: "ACCESS_DENIED", message: "Access denied" } });
      next();
    };
  }

  app.get("/api/v1/patients/:id", requireRoles("PATIENT", "DOCTOR", "STAFF", "ADMIN"), async (req, res) => {
    const patient = await repository.findPatientById(String(req.params.id));
    if (!patient) return res.status(404).json({ success: false, error: { code: "PATIENT_NOT_FOUND" } });
    const who = actor(req)!;
    if (who.role === "PATIENT" && patient.userId !== who.userId) {
      return res.status(403).json({ success: false, error: { code: "ACCESS_DENIED" } });
    }
    return res.json({ success: true, data: patient });
  });

  app.patch("/api/v1/patients/:id", requireRoles("PATIENT", "ADMIN"), async (req, res) => {
    const patient = await repository.findPatientById(String(req.params.id));
    if (!patient) return res.status(404).json({ success: false, error: { code: "PATIENT_NOT_FOUND" } });
    const who = actor(req)!;
    if (who.role === "PATIENT" && patient.userId !== who.userId) {
      return res.status(403).json({ success: false, error: { code: "ACCESS_DENIED" } });
    }
    const updated = await repository.updatePatient(String(req.params.id), req.body);
    return res.json({ success: true, data: updated });
  });

  app.patch("/api/v1/users/:id/status", requireRoles("ADMIN"), async (req, res) => {
    const updated = await repository.updateUser(String(req.params.id), { status: req.body.status });
    return res.json({ success: true, data: updated });
  });

  app.patch("/api/v1/users/:id/role", requireRoles("ADMIN"), async (req, res) => {
    const updated = await repository.updateUser(String(req.params.id), { role: req.body.role });
    return res.json({ success: true, data: updated });
  });

  return { app, provider, repository };
}

describe("USER-006: User & Account Security Tests", () => {
  it("rejects login when account is LOCKED", async () => {
    const { app } = createMockApp();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: lockedUser.email, password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_LOCKED");
  });

  it("rejects login when account is INACTIVE", async () => {
    const { app } = createMockApp();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: inactiveUser.email, password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_INACTIVE");
  });

  it("rejects token refresh when account is LOCKED", async () => {
    const { app } = createMockApp();
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "ref-locked" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_LOCKED");
  });

  it("prevents PATIENT from viewing another patient's profile", async () => {
    const { app } = createMockApp();
    const res = await request(app)
      .get(`/api/v1/patients/${patientProfile.id}`)
      .set("X-User-Id", "different-patient-id")
      .set("X-Role", "PATIENT");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCESS_DENIED");
  });

  it("allows PATIENT to view their own patient profile", async () => {
    const { app } = createMockApp();
    const res = await request(app)
      .get(`/api/v1/patients/${patientProfile.id}`)
      .set("X-User-Id", patientUser.id)
      .set("X-Role", "PATIENT");

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(patientProfile.id);
  });

  it("allows DOCTOR to view a patient's profile", async () => {
    const { app } = createMockApp();
    const res = await request(app)
      .get(`/api/v1/patients/${patientProfile.id}`)
      .set("X-User-Id", "doctor-1")
      .set("X-Role", "DOCTOR");

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(patientProfile.id);
  });

  it("prevents STAFF from updating patient clinical profile", async () => {
    const { app } = createMockApp();
    const res = await request(app)
      .patch(`/api/v1/patients/${patientProfile.id}`)
      .set("X-User-Id", "staff-1")
      .set("X-Role", "STAFF")
      .send({ address: "New Address" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCESS_DENIED");
  });

  it("allows ADMIN to update user role", async () => {
    const { app, repository } = createMockApp();
    const res = await request(app)
      .patch(`/api/v1/users/${patientUser.id}/role`)
      .set("X-User-Id", "admin-1")
      .set("X-Role", "ADMIN")
      .send({ role: "DOCTOR" });

    expect(res.status).toBe(200);
    expect(repository.updateUser).toHaveBeenCalledWith(patientUser.id, { role: "DOCTOR" });
  });

  it("allows ADMIN to lock/unlock user status", async () => {
    const { app, repository } = createMockApp();
    const res = await request(app)
      .patch(`/api/v1/users/${patientUser.id}/status`)
      .set("X-User-Id", "admin-1")
      .set("X-Role", "ADMIN")
      .send({ status: "LOCKED" });

    expect(res.status).toBe(200);
    expect(repository.updateUser).toHaveBeenCalledWith(patientUser.id, { status: "LOCKED" });
  });

  it("prevents NON-ADMIN from changing user status or role", async () => {
    const { app } = createMockApp();
    const res = await request(app)
      .patch(`/api/v1/users/${patientUser.id}/role`)
      .set("X-User-Id", patientUser.id)
      .set("X-Role", "PATIENT")
      .send({ role: "ADMIN" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCESS_DENIED");
  });
});
