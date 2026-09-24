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
};

export type PatientProfile = {
  id: string;
  userId: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContact?: string;
  insuranceNumber?: string;
};

const userSelect = `id, supabase_auth_user_id AS "supabaseAuthUserId", email,
  full_name AS "fullName", phone, role, status`;
const patientSelect = `id, user_id AS "userId", date_of_birth AS "dateOfBirth",
  gender, address, emergency_contact AS "emergencyContact",
  insurance_number AS "insuranceNumber"`;

export class UserRepository {
  constructor(private readonly pool: Pool) {}

  async findUsers() {
    const result = await this.pool.query<UserProfile>(
      `SELECT ${userSelect} FROM user_service.users ORDER BY created_at DESC`,
    );
    return result.rows;
  }

  async findUserById(id: string) {
    const result = await this.pool.query<UserProfile>(
      `SELECT ${userSelect} FROM user_service.users WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findUserByAuthId(supabaseAuthUserId: string) {
    const result = await this.pool.query<UserProfile>(
      `SELECT ${userSelect} FROM user_service.users WHERE supabase_auth_user_id = $1`,
      [supabaseAuthUserId],
    );
    return result.rows[0] ?? null;
  }

  async updateUser(
    id: string,
    input: Partial<
      Pick<UserProfile, "fullName" | "phone" | "status" | "role">
    >,
  ) {
    const columns = {
      fullName: "full_name",
      phone: "phone",
      status: "status",
      role: "role",
    } as const;
    const entries = Object.entries(input) as Array<
      [keyof typeof columns, string | undefined]
    >;
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

  async findPatients() {
    const result = await this.pool.query<PatientProfile>(
      `SELECT ${patientSelect} FROM user_service.patient_profiles ORDER BY created_at DESC`,
    );
    return result.rows;
  }

  async findPatientById(id: string) {
    const result = await this.pool.query<PatientProfile>(
      `SELECT ${patientSelect} FROM user_service.patient_profiles WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findPatientByUserId(userId: string) {
    const result = await this.pool.query<PatientProfile>(
      `SELECT ${patientSelect} FROM user_service.patient_profiles WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async updatePatient(
    id: string,
    input: Partial<Omit<PatientProfile, "id" | "userId">>,
  ) {
    const columns = {
      dateOfBirth: "date_of_birth",
      gender: "gender",
      address: "address",
      emergencyContact: "emergency_contact",
      insuranceNumber: "insurance_number",
    } as const;
    const entries = Object.entries(input) as Array<
      [keyof typeof columns, string | undefined]
    >;
    if (entries.length === 0) return this.findPatientById(id);
    const assignments = entries
      .map(([key], index) => `${columns[key]} = $${index + 1}`)
      .join(", ");
    const result = await this.pool.query<PatientProfile>(
      `UPDATE user_service.patient_profiles SET ${assignments}, updated_at = now()
       WHERE id = $${entries.length + 1} RETURNING ${patientSelect}`,
      [...entries.map(([, value]) => value ?? null), id],
    );
    return result.rows[0] ?? null;
  }
}
