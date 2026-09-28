import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { UserRepository, type UserProfile, type PatientProfile } from "../src/repository.js";

const sampleUser: UserProfile = {
  id: "10000000-0000-4000-8000-000000000001",
  supabaseAuthUserId: "20000000-0000-4000-8000-000000000001",
  email: "test@example.com",
  fullName: "Nguyen Van A",
  phone: "0901234567",
  role: "PATIENT",
  status: "ACTIVE",
};

const samplePatient: PatientProfile = {
  id: "30000000-0000-4000-8000-000000000001",
  userId: sampleUser.id,
  dateOfBirth: "1995-05-15",
  gender: "MALE",
  address: "123 Pham Van Dong",
  emergencyContact: "0987654321",
  insuranceNumber: "HS4791234567890",
  fullName: sampleUser.fullName,
  email: sampleUser.email,
  phone: sampleUser.phone,
};

function createMockDb() {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.includes("count(*)")) {
      return { rows: [{ count: "1" }] };
    }
    if (sql.includes("user_service.users") && sql.includes("SELECT")) {
      return { rows: [sampleUser] };
    }
    if (sql.includes("user_service.patient_profiles") && sql.includes("SELECT")) {
      return { rows: [samplePatient] };
    }
    if (sql.includes("UPDATE user_service.users")) {
      return { rows: [sampleUser] };
    }
    if (sql.includes("INSERT INTO user_service.users")) {
      return { rows: [sampleUser] };
    }
    return { rows: [] };
  });

  const pool = { query } as unknown as Pool;
  return { repo: new UserRepository(pool), queries };
}

describe("USER-001 & USER-004: UserRepository tests", () => {
  it("finds users with pagination and search query filter", async () => {
    const { repo, queries } = createMockDb();
    const result = await repo.findUsers({ q: "Nguyen", role: "PATIENT", status: "ACTIVE", page: 2, limit: 10 });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);

    const countQuery = queries.find((q) => q.sql.includes("count(*)"));
    expect(countQuery?.sql).toContain("role = $1");
    expect(countQuery?.sql).toContain("status = $2");
    expect(countQuery?.sql).toContain("full_name ILIKE $3");

    const dataQuery = queries.find((q) => q.sql.includes("ORDER BY created_at"));
    expect(dataQuery?.sql).toContain("LIMIT $4 OFFSET $5");
    expect(dataQuery?.values).toEqual(["PATIENT", "ACTIVE", "%Nguyen%", 10, 10]);
  });

  it("finds patients joining user data with search query filter", async () => {
    const { repo, queries } = createMockDb();
    const result = await repo.findPatients({ q: "Van A", page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.items[0]?.fullName).toBe("Nguyen Van A");

    const dataQuery = queries.find((q) => q.sql.includes("ORDER BY p.created_at"));
    expect(dataQuery?.sql).toContain("LEFT JOIN user_service.users u ON p.user_id = u.id");
    expect(dataQuery?.sql).toContain("u.full_name ILIKE $1");
    expect(dataQuery?.values).toEqual(["%Van A%", 20, 0]);
  });

  it("creates user and automatically creates patient profile when role is PATIENT", async () => {
    const { repo, queries } = createMockDb();
    const created = await repo.createUser({
      supabaseAuthUserId: sampleUser.supabaseAuthUserId,
      email: sampleUser.email,
      fullName: sampleUser.fullName,
      role: "PATIENT",
    });

    expect(created.id).toBe(sampleUser.id);
    const insertPatient = queries.find((q) => q.sql.includes("INSERT INTO user_service.patient_profiles"));
    expect(insertPatient).toBeDefined();
    expect(insertPatient?.values).toEqual([sampleUser.id]);
  });

  it("updates user fields safely", async () => {
    const { repo, queries } = createMockDb();
    await repo.updateUser(sampleUser.id, { fullName: "New Name", phone: "0999999999" });

    const updateQuery = queries.find((q) => q.sql.includes("UPDATE user_service.users"));
    expect(updateQuery?.sql).toContain("full_name = $1");
    expect(updateQuery?.sql).toContain("phone = $2");
    expect(updateQuery?.values).toEqual(["New Name", "0999999999", sampleUser.id]);
  });

  it("updates patient fields safely", async () => {
    const { repo, queries } = createMockDb();
    await repo.updatePatient(samplePatient.id, {
      address: "456 Tran Hung Dao",
      insuranceNumber: "DN1234567890",
    });

    const updateQuery = queries.find((q) => q.sql.includes("UPDATE user_service.patient_profiles"));
    expect(updateQuery?.sql).toContain("address = $1");
    expect(updateQuery?.sql).toContain("insurance_number = $2");
    expect(updateQuery?.values).toEqual(["456 Tran Hung Dao", "DN1234567890", samplePatient.id]);
  });
});
