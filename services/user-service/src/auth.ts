import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import { z } from "zod";
import { logServiceEvent } from "@clinic/request-logging";
import type { UserProfile, UserRepository, SessionRecord } from "./repository.js";
import {
  evaluateSessionStatus,
  formatSessionMetadata,
  SessionService,
  PATIENT_IDLE_TIMEOUT_SECONDS,
  DOCTOR_IDLE_TIMEOUT_SECONDS,
  STAFF_ADMIN_ABSOLUTE_TIMEOUT_SECONDS,
  STAFF_ADMIN_IDLE_LOCK_SECONDS,
} from "./session-service.js";
import { MfaService } from "./mfa-service.js";
import type { MfaPurpose } from "./types/internal-proof-verify.js";

export {
  evaluateSessionStatus,
  formatSessionMetadata,
  PATIENT_IDLE_TIMEOUT_SECONDS,
  DOCTOR_IDLE_TIMEOUT_SECONDS,
  STAFF_ADMIN_ABSOLUTE_TIMEOUT_SECONDS,
  STAFF_ADMIN_IDLE_LOCK_SECONDS,
};

type AuthTokens = {
  authUserId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type SignUpResult = { authUserId: string; tokens: AuthTokens | null };

export class AuthProviderError extends Error {
  constructor(
    message: string,
    readonly providerCode?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AuthProviderError";
  }
}

export type AuthProvider = {
  signIn(email: string, password: string): Promise<AuthTokens>;
  signUp(fullName: string, email: string, password: string): Promise<SignUpResult>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  signOut(accessToken: string, refreshToken: string): Promise<void>;
  verify(accessToken: string): Promise<string | null>;
};

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(6).max(128) }).strict();
const registerSchema = loginSchema.extend({ fullName: z.string().trim().min(2).max(120) }).strict();
const refreshSchema = z.object({ refreshToken: z.string().min(1) }).strict();
const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
  scope: z.enum(["current", "all"]).optional(),
}).strict();

const challengeCreateSchema = z.object({
  factorId: z.string().uuid(),
  purpose: z.enum([
    "ENROLL_TOTP",
    "OPEN_CLINICAL_RECORDS",
    "FINALIZE_MEDICAL_RECORD",
    "STAFF_ADMIN_LOGIN",
    "UNLOCK_SESSION",
    "AUTHORIZE_SENSITIVE_OPERATION",
  ]),
  context: z.record(z.string(), z.unknown()).optional(),
}).strict();

const challengeVerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^[0-9]{6}$/, "TOTP code must be 6 digits"),
  sessionId: z.string().uuid().optional(),
}).strict();

function toTokens(data: {
  session: { access_token: string; refresh_token: string; expires_in: number; user: { id: string } } | null;
}): AuthTokens | null {
  if (!data.session) return null;
  return {
    authUserId: data.session.user.id,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in,
  };
}

function providerError(defaultCode: string, error: unknown): AuthProviderError {
  const providerCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;
  return new AuthProviderError(defaultCode, providerCode, status);
}

export function createSupabaseAuthProvider(url?: string, anonKey?: string, timeoutMs = 15_000): AuthProvider | null {
  if (!url || !anonKey) return null;
  const timedFetch: typeof fetch = (input, init) => fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
  });
  const client = () => createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: timedFetch },
  });
  return {
    async signIn(email, password) {
      const { data, error } = await client().auth.signInWithPassword({ email, password });
      const tokens = toTokens(data);
      if (error) throw providerError("AUTH_LOGIN_FAILED", error);
      if (!tokens) throw new AuthProviderError("AUTH_LOGIN_FAILED");
      return tokens;
    },
    async signUp(fullName, email, password) {
      const { data, error } = await client().auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw providerError("AUTH_REGISTRATION_FAILED", error);
      if (!data.user) throw new AuthProviderError("AUTH_REGISTRATION_FAILED");
      return { authUserId: data.user.id, tokens: toTokens(data) };
    },
    async refresh(refreshToken) {
      const { data, error } = await client().auth.refreshSession({ refresh_token: refreshToken });
      const tokens = toTokens(data);
      if (error) throw providerError("AUTH_REFRESH_INVALID", error);
      if (!tokens) throw new AuthProviderError("AUTH_REFRESH_INVALID");
      return tokens;
    },
    async signOut(accessToken, refreshToken) {
      const auth = client().auth;
      const { error: sessionError } = await auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (sessionError) throw new Error("AUTH_SESSION_INVALID");
      const { error } = await auth.signOut({ scope: "global" });
      if (error) throw new Error("AUTH_SIGN_OUT_FAILED");
    },
    async verify(accessToken) {
      const { data, error } = await client().auth.getUser(accessToken);
      return error || !data.user ? null : data.user.id;
    },
  };
}

function ok<T>(data: T) {
  return { success: true, data };
}

function fail(res: express.Response, status: number, code: string, message: string, details: unknown[] = []) {
  return res.status(status).json({ success: false, error: { code, message, details } });
}

async function profileWithRetry(repository: UserRepository, authUserId: string): Promise<UserProfile | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const profile = await repository.findUserByAuthId(authUserId);
    if (profile) return profile;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
  return null;
}

function sessionPayload(tokens: AuthTokens, profile: UserProfile, sessionRecord?: SessionRecord | null) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    user: { id: profile.id, role: profile.role },
    ...(sessionRecord ? { session: formatSessionMetadata(sessionRecord) } : {}),
  };
}

function authFailure(res: express.Response, cause: unknown) {
  const code = cause instanceof Error ? cause.message : "";
  const providerCode = cause instanceof AuthProviderError ? cause.providerCode : undefined;
  const status = cause instanceof AuthProviderError ? cause.status : undefined;
  logServiceEvent("user-service", "warn", "auth.provider_error", { code, providerCode, status });

  if (providerCode === "invalid_credentials") return fail(res, 401, "AUTH_INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng");
  if (providerCode === "email_not_confirmed") return fail(res, 403, "AUTH_EMAIL_NOT_CONFIRMED", "Email chưa được xác nhận");
  if (providerCode === "email_provider_disabled") {
    return fail(res, 503, "AUTH_EMAIL_PROVIDER_DISABLED", "Đăng ký và đăng nhập bằng email đang bị tắt");
  }
  if (providerCode === "email_address_invalid") return fail(res, 400, "AUTH_EMAIL_INVALID", "Địa chỉ email không hợp lệ");
  if (providerCode === "over_email_send_rate_limit" || status === 429) {
    return fail(res, 429, "AUTH_RATE_LIMITED", "Quá nhiều yêu cầu xác thực, vui lòng thử lại sau");
  }
  if (code === "AUTH_LOGIN_FAILED" && status === 400) return fail(res, 401, "AUTH_INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng");
  if (code === "AUTH_REFRESH_INVALID" || code === "AUTH_SESSION_INVALID") return fail(res, 401, code, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn");
  if (code === "AUTH_REGISTRATION_FAILED" && status !== undefined && status < 500) {
    return fail(res, 400, code, "Không thể đăng ký tài khoản");
  }
  return fail(res, 503, "AUTH_SERVICE_UNAVAILABLE", "Authentication service is unavailable");
}

export function createAuthRouter(
  provider: AuthProvider | null,
  repository: UserRepository,
  sessionService?: SessionService,
  mfaService?: MfaService,
) {
  const router = express.Router();
  const sessions = sessionService ?? (typeof (repository as unknown as Record<string, unknown>).createSession === "function" ? new SessionService(repository) : null);
  const mfas = mfaService ?? (typeof (repository as unknown as Record<string, unknown>).createMfaFactor === "function" ? new MfaService(repository) : null);

  async function resolveActor(req: express.Request): Promise<{ profile: UserProfile; authUserId: string } | null> {
    if (!provider) return null;
    const accessToken = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return null;
    try {
      const authUserId = await provider.verify(accessToken);
      if (!authUserId) return null;
      const profile = await repository.findUserByAuthId(authUserId);
      if (!profile) return null;
      return { profile, authUserId };
    } catch {
      return null;
    }
  }

  // POST /api/v1/auth/login
  router.post("/login", async (req, res) => {
    if (!provider) return fail(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured");
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request body", parsed.error.issues);
    try {
      const tokens = await provider.signIn(parsed.data.email, parsed.data.password);
      const profile = await profileWithRetry(repository, tokens.authUserId);
      if (!profile) return fail(res, 403, "USER_PROFILE_NOT_FOUND", "No application profile is linked to this account");
      if (profile.status === "LOCKED") return fail(res, 403, "ACCOUNT_LOCKED", "Tài khoản của bạn đã bị khóa");
      if (profile.status !== "ACTIVE") return fail(res, 403, "ACCOUNT_INACTIVE", "User account is not active");

      let sessionRecord: SessionRecord | null = null;
      if (sessions) {
        sessionRecord = await sessions.createSessionForUser(
          profile.id,
          profile.role,
          tokens.refreshToken,
          req.header("user-agent"),
        );
      }

      return res.json(ok(sessionPayload(tokens, profile, sessionRecord)));
    } catch (error) {
      return authFailure(res, error);
    }
  });

  // POST /api/v1/auth/register
  router.post("/register", async (req, res) => {
    if (!provider) return fail(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured");
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request body", parsed.error.issues);
    try {
      const result = await provider.signUp(parsed.data.fullName, parsed.data.email, parsed.data.password);
      if (!result.tokens) return res.status(201).json(ok({ requiresEmailConfirmation: true }));
      let profile = await profileWithRetry(repository, result.authUserId);
      if (!profile && typeof repository.createUser === "function") {
        try {
          profile = await repository.createUser({
            supabaseAuthUserId: result.authUserId,
            email: parsed.data.email,
            fullName: parsed.data.fullName,
            role: "PATIENT",
            status: "ACTIVE",
          });
        } catch {
          profile = await repository.findUserByAuthId(result.authUserId);
        }
      }
      if (!profile) return fail(res, 503, "USER_PROFILE_PROVISIONING_PENDING", "User profile is still being provisioned");

      let sessionRecord: SessionRecord | null = null;
      if (sessions && result.tokens) {
        sessionRecord = await sessions.createSessionForUser(
          profile.id,
          profile.role,
          result.tokens.refreshToken,
          req.header("user-agent"),
        );
      }

      return res.status(201).json(ok({
        ...sessionPayload(result.tokens, profile, sessionRecord),
        requiresEmailConfirmation: false,
      }));
    } catch (error) {
      return authFailure(res, error);
    }
  });

  // POST /api/v1/auth/refresh
  router.post("/refresh", async (req, res) => {
    if (!provider) return fail(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured");
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request body", parsed.error.issues);
    try {
      let existingSession: SessionRecord | null = null;
      if (sessions) {
        existingSession = await sessions.getSessionByRefreshToken(parsed.data.refreshToken);
        if (existingSession) {
          const evaluated = evaluateSessionStatus(existingSession);
          if (evaluated === "EXPIRED") {
            const code = existingSession.role === "PATIENT" || existingSession.role === "DOCTOR"
              ? "AUTH_SESSION_IDLE_EXPIRED"
              : "AUTH_SESSION_EXPIRED";
            return fail(res, 401, code, "Phiên đăng nhập đã hết hạn");
          }
          if (evaluated === "REVOKED") {
            return fail(res, 401, "AUTH_SESSION_REVOKED", "Phiên đăng nhập đã bị thu hồi");
          }
        }
      }

      const tokens = await provider.refresh(parsed.data.refreshToken);
      const profile = await profileWithRetry(repository, tokens.authUserId);
      if (!profile) return fail(res, 403, "USER_PROFILE_NOT_FOUND", "No application profile is linked to this account");
      if (profile.status === "LOCKED") return fail(res, 403, "ACCOUNT_LOCKED", "Tài khoản của bạn đã bị khóa");
      if (profile.status !== "ACTIVE") return fail(res, 403, "ACCOUNT_INACTIVE", "User account is not active");

      let sessionRecord = existingSession;
      if (sessions && existingSession) {
        const rotated = await sessions.rotateRefreshToken(
          existingSession.id,
          parsed.data.refreshToken,
          tokens.refreshToken,
        );
        if (rotated) sessionRecord = rotated;
      }

      return res.json(ok(sessionPayload(tokens, profile, sessionRecord)));
    } catch (error) {
      return authFailure(res, error);
    }
  });

  // POST /api/v1/auth/logout
  router.post("/logout", async (req, res) => {
    if (!provider) return fail(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured");
    const accessToken = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const parsed = logoutSchema.safeParse(req.body ?? {});
    const refreshToken = parsed.success ? parsed.data.refreshToken : undefined;
    const scope = (req.query.scope as string) ?? (parsed.success ? parsed.data.scope : undefined) ?? "current";

    if (!accessToken && !refreshToken) {
      return fail(res, 400, "VALIDATION_ERROR", "Access token or refresh token is required for logout");
    }

    try {
      if (sessions) {
        if (scope === "all" && accessToken) {
          const authUserId = await provider.verify(accessToken);
          if (authUserId) {
            const profile = await repository.findUserByAuthId(authUserId);
            if (profile) {
              await sessions.revokeAllUserSessions(profile.id);
            }
          }
        } else if (refreshToken) {
          const current = await sessions.getSessionByRefreshToken(refreshToken);
          if (current) {
            await sessions.revokeSession(current.id);
          }
        } else {
          const targetSessionId = (req.header("x-session-id") ?? req.body?.sessionId) as string | undefined;
          if (targetSessionId) {
            const current = await sessions.getSession(targetSessionId);
            if (current && (!accessToken || (await provider.verify(accessToken)) === current.userId)) {
              await sessions.revokeSession(current.id);
            }
          }
        }
      }

      if (accessToken && refreshToken) {
        await provider.signOut(accessToken, refreshToken);
      }
      return res.json(ok(null));
    } catch (error) {
      return authFailure(res, error);
    }
  });

  // GET /api/v1/auth/session
  router.get("/session", async (req, res) => {
    const actor = await resolveActor(req);
    if (!actor) return fail(res, 401, "AUTH_REQUIRED", "Valid authentication required");
    if (!sessions) return fail(res, 503, "SESSION_SERVICE_UNAVAILABLE", "Session service is unavailable");

    const headerSessionId = (req.header("x-session-id") ?? (req.query?.sessionId as string | undefined));
    let currentSession: SessionRecord | null = null;
    if (headerSessionId) {
      currentSession = await sessions.getSession(headerSessionId);
      if (currentSession && currentSession.userId !== actor.profile.id) {
        currentSession = null;
      }
    }

    if (!currentSession) {
      const activeSessions = await sessions.listActiveSessions(actor.profile.id);
      if (activeSessions.length === 0) return fail(res, 404, "SESSION_NOT_FOUND", "No active session found");
      currentSession = await sessions.getSession(activeSessions[0].sessionId);
    }
    if (!currentSession) return fail(res, 404, "SESSION_NOT_FOUND", "No active session found");

    return res.json(ok(formatSessionMetadata(currentSession)));
  });

  // POST /api/v1/auth/session/activity & POST /api/v1/auth/activity
  const handleActivity: express.RequestHandler = async (req, res) => {
    const actor = await resolveActor(req);
    if (!actor) return fail(res, 401, "AUTH_REQUIRED", "Valid authentication required");
    if (!sessions) return fail(res, 503, "SESSION_SERVICE_UNAVAILABLE", "Session service is unavailable");

    const targetSessionId = (req.header("x-session-id") ?? req.body?.sessionId) as string | undefined;
    let session: SessionRecord | null = null;
    if (targetSessionId) {
      session = await sessions.getSession(targetSessionId);
      if (session && session.userId !== actor.profile.id) {
        session = null;
      }
    }

    if (!session) {
      const activeList = await sessions.listActiveSessions(actor.profile.id);
      if (activeList.length === 0) return fail(res, 404, "SESSION_NOT_FOUND", "No active session found");
      session = await sessions.getSession(activeList[0].sessionId);
      if (!session) return fail(res, 404, "SESSION_NOT_FOUND", "No active session found");
    }

    const state = evaluateSessionStatus(session);
    if (state === "LOCKED") return fail(res, 403, "AUTH_SESSION_LOCKED", "Phiên đăng nhập đang bị khóa do không hoạt động");
    if (state === "EXPIRED") {
      const code = session.role === "PATIENT" || session.role === "DOCTOR"
        ? "AUTH_SESSION_IDLE_EXPIRED"
        : "AUTH_SESSION_EXPIRED";
      return fail(res, 401, code, "Phiên đăng nhập đã hết hạn");
    }
    if (state === "REVOKED") return fail(res, 401, "AUTH_SESSION_REVOKED", "Phiên đăng nhập đã bị thu hồi");

    const touched = await sessions.recordActivity(session.id);
    if (!touched) {
      return fail(res, 401, "AUTH_SESSION_IDLE_EXPIRED", "Phiên đăng nhập đã hết hạn");
    }

    return res.json(ok(formatSessionMetadata(touched)));
  };

  router.post("/session/activity", handleActivity);
  router.post("/activity", handleActivity);

  // GET /api/v1/auth/sessions
  router.get("/sessions", async (req, res) => {
    const actor = await resolveActor(req);
    if (!actor) return fail(res, 401, "AUTH_REQUIRED", "Valid authentication required");
    if (!sessions) return fail(res, 503, "SESSION_SERVICE_UNAVAILABLE", "Session service is unavailable");

    const items = await sessions.listActiveSessions(actor.profile.id);
    return res.json(ok({ items, page: 1, limit: items.length, total: items.length }));
  });

  // DELETE /api/v1/auth/sessions/:sessionId
  router.delete("/sessions/:sessionId", async (req, res) => {
    const actor = await resolveActor(req);
    if (!actor) return fail(res, 401, "AUTH_REQUIRED", "Valid authentication required");
    if (!sessions) return fail(res, 503, "SESSION_SERVICE_UNAVAILABLE", "Session service is unavailable");

    const sessionId = req.params.sessionId;
    const session = await sessions.getSession(sessionId);
    if (!session || session.userId !== actor.profile.id) {
      return fail(res, 404, "SESSION_NOT_FOUND", "Session not found or outside user ownership");
    }

    await sessions.revokeSession(sessionId);
    return res.json(ok({ sessionId, revoked: true }));
  });

  // GET /api/v1/auth/mfa/factors
  router.get("/mfa/factors", async (req, res) => {
    const actor = await resolveActor(req);
    if (!actor) return fail(res, 401, "AUTH_REQUIRED", "Valid authentication required");
    if (!mfas) return fail(res, 503, "MFA_SERVICE_UNAVAILABLE", "MFA service is unavailable");

    const items = await mfas.listFactors(actor.profile.id);
    return res.json(ok({ items }));
  });

  // POST /api/v1/auth/mfa/totp/enroll & POST /api/v1/auth/mfa/enroll
  const handleEnroll: express.RequestHandler = async (req, res) => {
    const actor = await resolveActor(req);
    if (!actor) return fail(res, 401, "AUTH_REQUIRED", "Valid authentication required");
    if (!mfas) return fail(res, 503, "MFA_SERVICE_UNAVAILABLE", "MFA service is unavailable");

    const enrolled = await mfas.enrollTotp(actor.profile.id, actor.profile.email);
    return res.status(201).json(ok(enrolled));
  };
  router.post("/mfa/totp/enroll", handleEnroll);
  router.post("/mfa/enroll", handleEnroll);

  // POST /api/v1/auth/mfa/challenges & POST /api/v1/auth/mfa/challenge
  const handleChallenge: express.RequestHandler = async (req, res) => {
    const actor = await resolveActor(req);
    if (!actor) return fail(res, 401, "AUTH_REQUIRED", "Valid authentication required");
    if (!mfas) return fail(res, 503, "MFA_SERVICE_UNAVAILABLE", "MFA service is unavailable");

    const parsed = challengeCreateSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request body", parsed.error.issues);

    let sessionId: string | undefined;
    if (sessions) {
      const active = await sessions.listActiveSessions(actor.profile.id);
      const gatewaySessionId = req.header("x-session-id");
      sessionId = gatewaySessionId ? active.find((item) => item.sessionId === gatewaySessionId)?.sessionId : active[0]?.sessionId;
      if (!sessionId) return fail(res, 401, "AUTH_SESSION_INVALID", "Active session required for MFA challenge");
    }

    try {
      const challenge = await mfas.createChallenge({
        factorId: parsed.data.factorId,
        userId: actor.profile.id,
        sessionId,
        purpose: parsed.data.purpose,
        context: parsed.data.context,
      });
      return res.status(201).json(ok(challenge));
    } catch (err) {
      if (err instanceof Error && err.message === "MFA_FACTOR_NOT_FOUND") {
        return fail(res, 404, "MFA_FACTOR_NOT_FOUND", "MFA factor not found");
      }
      if (err instanceof Error && err.message === "MFA_FACTOR_NOT_VERIFIED") {
        return fail(res, 403, "MFA_FACTOR_NOT_VERIFIED", "Verified TOTP factor required");
      }
      return fail(res, 500, "MFA_CHALLENGE_FAILED", "Failed to create MFA challenge");
    }
  };
  router.post("/mfa/challenges", handleChallenge);
  router.post("/mfa/challenge", handleChallenge);

  // POST /api/v1/auth/mfa/verify
  router.post("/mfa/verify", async (req, res) => {
    if (!mfas) return fail(res, 503, "MFA_SERVICE_UNAVAILABLE", "MFA service is unavailable");
    const parsed = challengeVerifySchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request body", parsed.error.issues);

    const actor = await resolveActor(req);
    if (!actor) return fail(res, 401, "AUTH_REQUIRED", "Valid authentication required");
    const active = sessions ? await sessions.listActiveSessions(actor.profile.id) : [];
    const gatewaySessionId = req.header("x-session-id");
    const sessionId = gatewaySessionId ?? parsed.data.sessionId ?? active[0]?.sessionId;
    if (!sessionId || !active.some((item) => item.sessionId === sessionId) ||
      (gatewaySessionId && parsed.data.sessionId && gatewaySessionId !== parsed.data.sessionId)) {
      return fail(res, 401, "AUTH_SESSION_INVALID", "Active session required for MFA verification");
    }

    const result = await mfas.verifyChallenge({
      challengeId: parsed.data.challengeId,
      code: parsed.data.code,
      sessionId,
    });

    if (!result.success) {
      if (result.error === "MFA_CODE_INVALID") return fail(res, 403, "MFA_CODE_INVALID", "Mã xác thực TOTP không chính xác");
      if (result.error === "MFA_CHALLENGE_EXPIRED") return fail(res, 403, "MFA_CHALLENGE_EXPIRED", "Yêu cầu xác thực đã hết hạn");
      if (result.error === "MFA_RATE_LIMITED") return fail(res, 429, "MFA_RATE_LIMITED", "Đã vượt quá số lần thử cho phép. Vui lòng thử lại sau.");
      if (result.error === "MFA_CHALLENGE_NOT_FOUND") return fail(res, 404, "MFA_CHALLENGE_NOT_FOUND", "MFA challenge not found");
      if (result.error === "MFA_SESSION_MISMATCH") return fail(res, 403, "MFA_SESSION_MISMATCH", "MFA challenge belongs to another session");
      if (result.error === "MFA_CHALLENGE_USED") return fail(res, 409, "MFA_CHALLENGE_USED", "MFA challenge already verified");
      return fail(res, 400, "MFA_VERIFY_FAILED", "MFA verification failed");
    }

    let sessionMeta: Record<string, unknown> | null = null;
    if (sessions && sessionId) {
      if (result.purpose === "STAFF_ADMIN_LOGIN") {
        const updated = await sessions.activateMfaLogin(sessionId);
        if (updated) sessionMeta = formatSessionMetadata(updated);
      } else if (result.purpose === "UNLOCK_SESSION") {
        const updated = await sessions.unlockSession(sessionId);
        if (updated) sessionMeta = formatSessionMetadata(updated);
      } else {
        const current = await sessions.getSession(sessionId);
        if (current) sessionMeta = formatSessionMetadata(current);
      }
    }

    return res.json(ok({
      purpose: result.purpose,
      verifiedAt: new Date().toISOString(),
      ...(sessionMeta ? { session: sessionMeta } : {}),
      ...(result.proofId ? {
        authorization: {
          proofId: result.proofId,
          proof_token: result.proofId,
          purpose: result.purpose,
          expiresAt: result.expiresAt,
          context: result.context,
        },
      } : {}),
    }));
  });

  // Password endpoints (Section 10.3)
  router.post("/password/forgot", (_req, res) => {
    return fail(
      res,
      503,
      "AUTH_PASSWORD_RECOVERY_NOT_CONFIGURED",
      "Chức năng khôi phục mật khẩu qua email chưa được cấu hình nhà cung cấp SMTP",
    );
  });

  router.post("/password/recovery/exchange", (_req, res) => {
    return fail(
      res,
      503,
      "AUTH_PASSWORD_RECOVERY_NOT_CONFIGURED",
      "Dịch vụ khôi phục mật khẩu chưa sẵn sàng",
    );
  });

  router.post("/password/reset", (_req, res) => {
    return fail(
      res,
      503,
      "AUTH_PASSWORD_RECOVERY_NOT_CONFIGURED",
      "Dịch vụ đặt lại mật khẩu chưa sẵn sàng",
    );
  });

  router.post("/password/change", (_req, res) => {
    return fail(
      res,
      503,
      "AUTH_PASSWORD_RECOVERY_NOT_CONFIGURED",
      "Dịch vụ đổi mật khẩu chưa sẵn sàng",
    );
  });

  return router;
}

export function createInternalVerifyHandler(
  provider: AuthProvider | null,
  repository: UserRepository,
  sessionService?: SessionService,
): express.RequestHandler {
  return async (req, res) => {
    if (!provider) return fail(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured");
    const accessToken = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return fail(res, 401, "AUTH_TOKEN_MISSING", "Access token is required");
    try {
      const authUserId = await provider.verify(accessToken);
      if (!authUserId) return fail(res, 401, "AUTH_TOKEN_INVALID", "Access token is invalid or expired");
      const profile = await repository.findUserByAuthId(authUserId);
      if (!profile) return fail(res, 404, "USER_PROFILE_NOT_FOUND", "No application profile is linked to this account");

      const sessions = sessionService ?? (typeof (repository as unknown as Record<string, unknown>).listActiveSessions === "function" ? new SessionService(repository) : null);

      if (sessions && typeof repository.listActiveSessions === "function") {
        const activeSessions = await repository.listActiveSessions(profile.id);
        const session = activeSessions[0];
        if (session) {
          const verifyData = sessions.buildVerifyResponse(profile, session);
          return res.json(ok(verifyData));
        }
      }

      return res.json(ok({ id: profile.id, authUserId, role: profile.role, status: profile.status }));
    } catch {
      return fail(res, 503, "AUTH_SERVICE_UNAVAILABLE", "Authentication service is unavailable");
    }
  };
}
