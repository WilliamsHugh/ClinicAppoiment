type Pool = InstanceType<typeof import("pg").Pool>;
import type { Role } from "@clinic/shared-types";

export type SessionState = "ACTIVE" | "PENDING_MFA" | "LOCKED" | "EXPIRED" | "REVOKED";

export type UserProfile = {
  id: string;
  supabaseAuthUserId: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: Role;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
  createdAt?: string;
  updatedAt?: string;
};

export type PatientProfile = {
  id: string;
  userId: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  insuranceNumber?: string | null;
  fullName?: string;
  email?: string;
  phone?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  role: Role;
  status: SessionState;
  startedAt: string;
  lastActiveAt: string;
  idleExpiresAt: string | null;
  absoluteExpiresAt: string | null;
  lockAt: string | null;
  mfaState: "NONE" | "PENDING" | "VERIFIED";
  sessionVersion: number;
  refreshTokenHash: string | null;
  deviceInfo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MfaFactorRecord = {
  id: string;
  userId: string;
  type: "totp";
  status: "unverified" | "verified";
  secretEncrypted: string;
  createdAt: string;
  updatedAt: string;
};

export type MfaChallengeRecord = {
  id: string;
  factorId: string;
  userId: string;
  sessionId: string | null;
  purpose: string;
  context: Record<string, unknown>;
  expiresAt: string;
  verifiedAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
};

export type MfaProofRecord = {
  id: string;
  userId: string;
  sessionId: string;
  challengeId: string;
  purpose: string;
  context: Record<string, unknown>;
  expiresAt: string;
  consumedAt: string | null;
  consumedBy: string | null;
  createdAt: string;
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
  patientId?: string;
  q?: string;
  page?: number;
  limit?: number;
};

const userSelect = `id, supabase_auth_user_id AS "supabaseAuthUserId", email,
  full_name AS "fullName", phone, role, status, created_at AS "createdAt", updated_at AS "updatedAt"`;

const sessionSelect = `id, user_id AS "userId", role, status, started_at AS "startedAt",
  last_active_at AS "lastActiveAt", idle_expires_at AS "idleExpiresAt",
  absolute_expires_at AS "absoluteExpiresAt", lock_at AS "lockAt",
  mfa_state AS "mfaState", session_version AS "sessionVersion",
  refresh_token_hash AS "refreshTokenHash", device_info AS "deviceInfo",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const mfaFactorSelect = `id, user_id AS "userId", type, status, secret_encrypted AS "secretEncrypted",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const mfaChallengeSelect = `id, factor_id AS "factorId", user_id AS "userId", session_id AS "sessionId",
  purpose, context, expires_at AS "expiresAt", verified_at AS "verifiedAt",
  attempt_count AS "attemptCount", max_attempts AS "maxAttempts",
  last_attempt_at AS "lastAttemptAt",
  created_at AS "createdAt"`;

const mfaProofSelect = `id, user_id AS "userId", session_id AS "sessionId", challenge_id AS "challengeId",
  purpose, context, expires_at AS "expiresAt", consumed_at AS "consumedAt",
  consumed_by AS "consumedBy", created_at AS "createdAt"`;

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
    const entries = (Object.entries(input) as Array<[keyof typeof columns, string | null | undefined]>)
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
    const user = result.rows[0] ?? null;
    if (user?.role === "PATIENT") {
      await this.pool.query(
        `INSERT INTO user_service.patient_profiles (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id],
      );
    }
    return user;
  }

  async findPatients(filter: FindPatientsFilter = {}): Promise<PaginatedResult<PatientProfile>> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = ["u.role = 'PATIENT'"];
    const values: unknown[] = [];

    if (filter.patientId) {
      values.push(filter.patientId);
      conditions.push(`p.id = $${values.length}`);
    }

    if (filter.q) {
      values.push(`%${filter.q.trim()}%`);
      const qIndex = values.length;
      conditions.push(
        `(u.full_name ILIKE $${qIndex} OR u.email ILIKE $${qIndex} OR u.phone ILIKE $${qIndex} OR p.insurance_number ILIKE $${qIndex})`,
      );
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

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
       WHERE p.user_id = $1 AND u.role = 'PATIENT'`,
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
    const entries = (Object.entries(input) as Array<[keyof typeof columns, string | null | undefined]>)
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

  async createSession(input: {
    userId: string;
    role: Role;
    status: SessionState;
    startedAt?: Date;
    lastActiveAt?: Date;
    idleExpiresAt?: Date | null;
    absoluteExpiresAt?: Date | null;
    lockAt?: Date | null;
    mfaState?: "NONE" | "PENDING" | "VERIFIED";
    sessionVersion?: number;
    refreshTokenHash?: string | null;
    deviceInfo?: string | null;
  }): Promise<SessionRecord> {
    const startedAt = input.startedAt ?? new Date();
    const lastActiveAt = input.lastActiveAt ?? startedAt;
    const mfaState = input.mfaState ?? "NONE";
    const sessionVersion = input.sessionVersion ?? 1;

    const result = await this.pool.query<SessionRecord>(
      `INSERT INTO user_service.sessions (
        user_id, role, status, started_at, last_active_at,
        idle_expires_at, absolute_expires_at, lock_at,
        mfa_state, session_version, refresh_token_hash, device_info
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING ${sessionSelect}`,
      [
        input.userId,
        input.role,
        input.status,
        startedAt,
        lastActiveAt,
        input.idleExpiresAt ?? null,
        input.absoluteExpiresAt ?? null,
        input.lockAt ?? null,
        mfaState,
        sessionVersion,
        input.refreshTokenHash ?? null,
        input.deviceInfo ?? null,
      ],
    );
    return result.rows[0];
  }

  async findSessionById(id: string): Promise<SessionRecord | null> {
    const result = await this.pool.query<SessionRecord>(
      `SELECT ${sessionSelect} FROM user_service.sessions WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findSessionByRefreshTokenHash(hash: string): Promise<SessionRecord | null> {
    const result = await this.pool.query<SessionRecord>(
      `SELECT ${sessionSelect} FROM user_service.sessions WHERE refresh_token_hash = $1`,
      [hash],
    );
    return result.rows[0] ?? null;
  }

  async updateSession(
    id: string,
    updates: Partial<Pick<SessionRecord, "status" | "lastActiveAt" | "idleExpiresAt" | "lockAt" | "mfaState" | "sessionVersion" | "refreshTokenHash">>,
  ): Promise<SessionRecord | null> {
    const columns: Record<string, string> = {
      status: "status",
      lastActiveAt: "last_active_at",
      idleExpiresAt: "idle_expires_at",
      lockAt: "lock_at",
      mfaState: "mfa_state",
      sessionVersion: "session_version",
      refreshTokenHash: "refresh_token_hash",
    };
    const entries = (Object.entries(updates) as Array<[keyof typeof columns, unknown]>)
      .filter(([, v]) => v !== undefined);
    if (entries.length === 0) return this.findSessionById(id);

    const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 1}`).join(", ");
    const result = await this.pool.query<SessionRecord>(
      `UPDATE user_service.sessions SET ${assignments}, updated_at = now()
       WHERE id = $${entries.length + 1} RETURNING ${sessionSelect}`,
      [...entries.map(([, val]) => val ?? null), id],
    );
    return result.rows[0] ?? null;
  }

  async touchSessionActivity(
    id: string,
    now: Date,
    idleExpiresAt?: Date | null,
    lockAt?: Date | null,
  ): Promise<SessionRecord | null> {
    const values: unknown[] = [now];
    let query = `UPDATE user_service.sessions SET last_active_at = $1, updated_at = now()`;
    if (idleExpiresAt !== undefined) {
      values.push(idleExpiresAt);
      query += `, idle_expires_at = $${values.length}`;
    }
    if (lockAt !== undefined) {
      values.push(lockAt);
      query += `, lock_at = $${values.length}`;
    }
    values.push(id);
    query += ` WHERE id = $${values.length} AND status = 'ACTIVE' RETURNING ${sessionSelect}`;

    const result = await this.pool.query<SessionRecord>(query, values);
    return result.rows[0] ?? null;
  }

  async rotateSessionRefreshToken(id: string, oldHash: string, newHash: string): Promise<SessionRecord | null> {
    const result = await this.pool.query<SessionRecord>(
      `UPDATE user_service.sessions
       SET refresh_token_hash = $1, session_version = session_version + 1, updated_at = now()
       WHERE id = $2 AND refresh_token_hash = $3 AND status != 'REVOKED' AND status != 'EXPIRED'
       RETURNING ${sessionSelect}`,
      [newHash, id, oldHash],
    );
    return result.rows[0] ?? null;
  }

  async revokeSession(id: string): Promise<SessionRecord | null> {
    const result = await this.pool.query<SessionRecord>(
      `UPDATE user_service.sessions
       SET status = 'REVOKED', refresh_token_hash = null, session_version = session_version + 1, updated_at = now()
       WHERE id = $1 RETURNING ${sessionSelect}`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE user_service.sessions
       SET status = 'REVOKED', refresh_token_hash = null, session_version = session_version + 1, updated_at = now()
       WHERE user_id = $1 AND status != 'REVOKED'`,
      [userId],
    );
    return result.rowCount ?? 0;
  }

  async listActiveSessions(userId: string): Promise<SessionRecord[]> {
    const result = await this.pool.query<SessionRecord>(
      `SELECT ${sessionSelect} FROM user_service.sessions
       WHERE user_id = $1 AND status IN ('ACTIVE', 'PENDING_MFA', 'LOCKED')
       ORDER BY last_active_at DESC`,
      [userId],
    );
    return result.rows;
  }

  async createMfaFactor(
    userId: string,
    secretEncrypted: string,
    type: "totp" = "totp",
    status: "unverified" | "verified" = "unverified",
  ): Promise<MfaFactorRecord> {
    const result = await this.pool.query<MfaFactorRecord>(
      `INSERT INTO user_service.mfa_factors (user_id, type, status, secret_encrypted)
       VALUES ($1, $2, $3, $4)
       RETURNING ${mfaFactorSelect}`,
      [userId, type, status, secretEncrypted],
    );
    return result.rows[0];
  }

  async findMfaFactorsByUserId(userId: string): Promise<MfaFactorRecord[]> {
    const result = await this.pool.query<MfaFactorRecord>(
      `SELECT ${mfaFactorSelect} FROM user_service.mfa_factors WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows;
  }

  async findMfaFactorById(factorId: string): Promise<MfaFactorRecord | null> {
    const result = await this.pool.query<MfaFactorRecord>(
      `SELECT ${mfaFactorSelect} FROM user_service.mfa_factors WHERE id = $1`,
      [factorId],
    );
    return result.rows[0] ?? null;
  }

  async updateMfaFactorStatus(factorId: string, status: "unverified" | "verified"): Promise<MfaFactorRecord | null> {
    const result = await this.pool.query<MfaFactorRecord>(
      `UPDATE user_service.mfa_factors SET status = $1, updated_at = now() WHERE id = $2 RETURNING ${mfaFactorSelect}`,
      [status, factorId],
    );
    return result.rows[0] ?? null;
  }

  async createMfaChallenge(input: {
    factorId: string;
    userId: string;
    sessionId?: string | null;
    purpose: string;
    context?: Record<string, unknown>;
    expiresAt: Date;
    maxAttempts?: number;
  }): Promise<MfaChallengeRecord> {
    const result = await this.pool.query<MfaChallengeRecord>(
      `INSERT INTO user_service.mfa_challenges (factor_id, user_id, session_id, purpose, context, expires_at, max_attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${mfaChallengeSelect}`,
      [
        input.factorId,
        input.userId,
        input.sessionId ?? null,
        input.purpose,
        JSON.stringify(input.context ?? {}),
        input.expiresAt,
        input.maxAttempts ?? 5,
      ],
    );
    return result.rows[0];
  }

  async findMfaChallengeById(challengeId: string): Promise<MfaChallengeRecord | null> {
    const result = await this.pool.query<MfaChallengeRecord>(
      `SELECT ${mfaChallengeSelect} FROM user_service.mfa_challenges WHERE id = $1`,
      [challengeId],
    );
    return result.rows[0] ?? null;
  }

  async incrementChallengeAttempt(challengeId: string): Promise<number> {
    const result = await this.pool.query<{ attemptCount: number }>(
      `UPDATE user_service.mfa_challenges
       SET attempt_count = attempt_count + 1, last_attempt_at = now()
       WHERE id = $1 AND verified_at IS NULL AND attempt_count < max_attempts
         AND (last_attempt_at IS NULL OR last_attempt_at <= now() - interval '30 seconds')
       RETURNING attempt_count AS "attemptCount"`,
      [challengeId],
    );
    return result.rows[0]?.attemptCount ?? 0;
  }

  async markChallengeVerified(challengeId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE user_service.mfa_challenges SET verified_at = now() WHERE id = $1 AND verified_at IS NULL RETURNING id`,
      [challengeId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async createMfaProof(input: {
    userId: string;
    sessionId: string;
    challengeId: string;
    purpose: string;
    context?: Record<string, unknown>;
    expiresAt: Date;
  }): Promise<MfaProofRecord> {
    const result = await this.pool.query<MfaProofRecord>(
      `INSERT INTO user_service.mfa_proofs (user_id, session_id, challenge_id, purpose, context, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${mfaProofSelect}`,
      [input.userId, input.sessionId, input.challengeId, input.purpose, JSON.stringify(input.context ?? {}), input.expiresAt],
    );
    return result.rows[0];
  }

  async findMfaProofById(proofId: string): Promise<MfaProofRecord | null> {
    const result = await this.pool.query<MfaProofRecord>(
      `SELECT ${mfaProofSelect} FROM user_service.mfa_proofs WHERE id = $1`,
      [proofId],
    );
    return result.rows[0] ?? null;
  }

  async consumeMfaProof(proofId: string, consumedBy?: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE user_service.mfa_proofs
       SET consumed_at = now(), consumed_by = $1
       WHERE id = $2 AND consumed_at IS NULL AND expires_at > now()`,
      [consumedBy ?? "internal-verifier", proofId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
