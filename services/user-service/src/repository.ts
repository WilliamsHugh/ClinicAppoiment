import type { Pool } from "pg";
import type { Role } from "@clinic/shared-types";

export type UserProfile = {
  id: string;
  supabaseAuthUserId: string;
  email: string;
  fullName: string;
  phone?: string;
  role: Role;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
  createdAt?: string;
  updatedAt?: string;
};

export type PatientProfile = {
  id: string;
  userId: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContact?: string;
  insuranceNumber?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};

export type FindUsersFilter = {
  role?: Role;
  status?: "ACTIVE" | "INACTIVE" | "LOCKED";
  q?: string;
  page?: number;
  limit?: number;
};

export type FindPatientsFilter = {
  q?: string;
  page?: number;
  limit?: number;
};

const userSelect = `id, supabase_auth_user_id AS "supabaseAuthUserId", email,
  full_name AS "fullName", phone, role, status, created_at AS "createdAt", updated_at AS "updatedAt"`;

export class UserRepository {
  constructor(private readonly pool: Pool) {}

  async findUsers(filter: FindUsersFilter = {}): Promise<PaginatedResult<UserProfile>> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filter.role) {
      values.push(filter.role);
      conditions.push(`role = $${values.length}`);
    }

    if (filter.status) {
      values.push(filter.status);
      conditions.push(`status = $${values.length}`);
    }

    if (filter.q) {
      values.push(`%${filter.q.trim()}%`);
      const qIndex = values.length;
      conditions.push(`(full_name ILIKE $${qIndex} OR email ILIKE $${qIndex} OR phone ILIKE $${qIndex})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM user_service.users ${whereClause}`,
      values,
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    const dataValues = [...values, limit, offset];
    const dataResult = await this.pool.query<UserProfile>(
      `SELECT ${userSelect} FROM user_service.users ${whereClause} ORDER BY created_at DESC LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
      dataValues,
    );

    return {
      items: dataResult.rows,
      page,
      limit,
      total,
    };
  }

  async findUserById(id: string): Promise<UserProfile | null> {
    const result = await this.pool.query<UserProfile>(
      `SELECT ${userSelect} FROM user_service.users WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findUserByAuthId(supabaseAuthUserId: string): Promise<UserProfile | null> {
    const result = await this.pool.query<UserProfile>(
      `SELECT ${userSelect} FROM user_service.users WHERE supabase_auth_user_id = $1`,
      [supabaseAuthUserId],
    );
    return result.rows[0] ?? null;
  }

  async findUserByEmail(email: string): Promise<UserProfile | null> {
    const result = await this.pool.query<UserProfile>(
      `SELECT ${userSelect} FROM user_service.users WHERE email = $1`,
      [email],
    );
    return result.rows[0] ?? null;
  }

  async createUser(input: {
    supabaseAuthUserId: string;
    email: string;
    fullName: string;
    phone?: string;
    role?: Role;
    status?: "ACTIVE" | "INACTIVE" | "LOCKED";
  }): Promise<UserProfile> {
    const role = input.role ?? "PATIENT";
    const status = input.status ?? "ACTIVE";
    const result = await this.pool.query<UserProfile>(
      `INSERT INTO user_service.users (supabase_auth_user_id, email, full_name, phone, role, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (supabase_auth_user_id) DO UPDATE
       SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, updated_at = now()
       RETURNING ${userSelect}`,
      [input.supabaseAuthUserId, input.email, input.fullName, input.phone ?? null, role, status],
    );
    const user = result.rows[0];
    if (user && user.role === "PATIENT") {
      await this.pool.query(
        `INSERT INTO user_service.patient_profiles (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id],
      );
    }
    return user;
  }

  async updateUser(
    id: string,
    input: Partial<Pick<UserProfile, "fullName" | "phone" | "status" | "role">>,
  ): Promise<UserProfile | null> {
    const columns = {
      fullName: "full_name",
      phone: "phone",
      status: "status",
      role: "role",
    } as const;
    const entries = (Object.entries(input) as Array<[keyof typeof columns, string | undefined]>)
      .filter(([, v]) => v !== undefined);
    if (entries.length === 0) return this.findUserById(id);
    const assignments = entries
      .map(([key], index) => `${columns[key]} = $${index + 1}`)
      .join(", ");
    const result = await this.pool.query<UserProfile>(
      `UPDATE user_service.users SET ${assignments}, updated_at = now()
       WHERE id = $${entries.length + 1} RETURNING ${userSelect}`,
      [...entries.map(([, value]) => value ?? null), id],
    );
    return result.rows[0] ?? null;
  }

  async findPatients(filter: FindPatientsFilter = {}): Promise<PaginatedResult<PatientProfile>> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filter.q) {
      values.push(`%${filter.q.trim()}%`);
      const qIndex = values.length;
      conditions.push(
        `(u.full_name ILIKE $${qIndex} OR u.email ILIKE $${qIndex} OR u.phone ILIKE $${qIndex} OR p.insurance_number ILIKE $${qIndex})`,
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM user_service.patient_profiles p
       LEFT JOIN user_service.users u ON p.user_id = u.id
       ${whereClause}`,
      values,
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    const dataValues = [...values, limit, offset];
    const dataResult = await this.pool.query<PatientProfile>(
      `SELECT p.id, p.user_id AS "userId", p.date_of_birth AS "dateOfBirth",
              p.gender, p.address, p.emergency_contact AS "emergencyContact",
              p.insurance_number AS "insuranceNumber", p.created_at AS "createdAt",
              p.updated_at AS "updatedAt", u.full_name AS "fullName", u.email, u.phone
       FROM user_service.patient_profiles p
       LEFT JOIN user_service.users u ON p.user_id = u.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
      dataValues,
    );

    return {
      items: dataResult.rows,
      page,
      limit,
      total,
    };
  }

  async findPatientById(id: string): Promise<PatientProfile | null> {
    const result = await this.pool.query<PatientProfile>(
      `SELECT p.id, p.user_id AS "userId", p.date_of_birth AS "dateOfBirth",
              p.gender, p.address, p.emergency_contact AS "emergencyContact",
              p.insurance_number AS "insuranceNumber", p.created_at AS "createdAt",
              p.updated_at AS "updatedAt", u.full_name AS "fullName", u.email, u.phone
       FROM user_service.patient_profiles p
       LEFT JOIN user_service.users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findPatientByUserId(userId: string): Promise<PatientProfile | null> {
    const result = await this.pool.query<PatientProfile>(
      `SELECT p.id, p.user_id AS "userId", p.date_of_birth AS "dateOfBirth",
              p.gender, p.address, p.emergency_contact AS "emergencyContact",
              p.insurance_number AS "insuranceNumber", p.created_at AS "createdAt",
              p.updated_at AS "updatedAt", u.full_name AS "fullName", u.email, u.phone
       FROM user_service.patient_profiles p
       LEFT JOIN user_service.users u ON p.user_id = u.id
       WHERE p.user_id = $1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async updatePatient(
    id: string,
    input: Partial<Pick<PatientProfile, "dateOfBirth" | "gender" | "address" | "emergencyContact" | "insuranceNumber">>,
  ): Promise<PatientProfile | null> {
    const columns = {
      dateOfBirth: "date_of_birth",
      gender: "gender",
      address: "address",
      emergencyContact: "emergency_contact",
      insuranceNumber: "insurance_number",
    } as const;
    const entries = (Object.entries(input) as Array<[keyof typeof columns, string | undefined]>)
      .filter(([, v]) => v !== undefined);
    if (entries.length === 0) return this.findPatientById(id);
    const assignments = entries
      .map(([key], index) => `${columns[key]} = $${index + 1}`)
      .join(", ");
    await this.pool.query(
      `UPDATE user_service.patient_profiles SET ${assignments}, updated_at = now()
       WHERE id = $${entries.length + 1}`,
      [...entries.map(([, value]) => value ?? null), id],
    );
    return this.findPatientById(id);
  }
}
