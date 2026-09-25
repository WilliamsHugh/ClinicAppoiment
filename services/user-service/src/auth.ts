import { createClient } from "@supabase/supabase-js";
import express from "express";
import { z } from "zod";
import type { UserProfile, UserRepository } from "./repository.js";

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
    readonly status?: number
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

function toTokens(data: {
  session: { access_token: string; refresh_token: string; expires_in: number; user: { id: string } } | null;
}): AuthTokens | null {
  if (!data.session) return null;
  return {
    authUserId: data.session.user.id,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in
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
    signal: init?.signal ?? AbortSignal.timeout(timeoutMs)
  });
  const client = () => createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: timedFetch }
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
        options: { data: { full_name: fullName } }
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
    }
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

function session(tokens: AuthTokens, profile: UserProfile) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    user: { id: profile.id, role: profile.role }
  };
}

function authFailure(res: express.Response, cause: unknown) {
  const code = cause instanceof Error ? cause.message : "";
  const providerCode = cause instanceof AuthProviderError ? cause.providerCode : undefined;
  const status = cause instanceof AuthProviderError ? cause.status : undefined;
  console.warn(JSON.stringify({ event: "auth.provider_error", code, providerCode, status }));

  if (providerCode === "invalid_credentials") return fail(res, 401, "AUTH_INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng");
  if (providerCode === "email_not_confirmed") return fail(res, 403, "AUTH_EMAIL_NOT_CONFIRMED", "Email chưa được xác nhận");
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

export function createAuthRouter(provider: AuthProvider | null, repository: UserRepository) {
  const router = express.Router();

  router.post("/login", async (req, res) => {
    if (!provider) return fail(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured");
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request body", parsed.error.issues);
    try {
      const tokens = await provider.signIn(parsed.data.email, parsed.data.password);
      const profile = await profileWithRetry(repository, tokens.authUserId);
      if (!profile) return fail(res, 403, "USER_PROFILE_NOT_FOUND", "No application profile is linked to this account");
      if (profile.status !== "ACTIVE") return fail(res, 403, "ACCOUNT_INACTIVE", "User account is not active");
      return res.json(ok(session(tokens, profile)));
    } catch (error) {
      return authFailure(res, error);
    }
  });

  router.post("/register", async (req, res) => {
    if (!provider) return fail(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured");
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request body", parsed.error.issues);
    try {
      const result = await provider.signUp(parsed.data.fullName, parsed.data.email, parsed.data.password);
      if (!result.tokens) return res.status(201).json(ok({ requiresEmailConfirmation: true }));
      const profile = await profileWithRetry(repository, result.authUserId);
      if (!profile) return fail(res, 503, "USER_PROFILE_PROVISIONING_PENDING", "User profile is still being provisioned");
      return res.status(201).json(ok({ ...session(result.tokens, profile), requiresEmailConfirmation: false }));
    } catch (error) {
      return authFailure(res, error);
    }
  });

  router.post("/refresh", async (req, res) => {
    if (!provider) return fail(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured");
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request body", parsed.error.issues);
    try {
      const tokens = await provider.refresh(parsed.data.refreshToken);
      const profile = await profileWithRetry(repository, tokens.authUserId);
      if (!profile) return fail(res, 403, "USER_PROFILE_NOT_FOUND", "No application profile is linked to this account");
      if (profile.status !== "ACTIVE") return fail(res, 403, "ACCOUNT_INACTIVE", "User account is not active");
      return res.json(ok(session(tokens, profile)));
    } catch (error) {
      return authFailure(res, error);
    }
  });

  router.post("/logout", async (req, res) => {
    if (!provider) return fail(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured");
    const accessToken = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const parsed = refreshSchema.safeParse(req.body);
    if (!accessToken || !parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Access token and refresh token are required");
    try {
      await provider.signOut(accessToken, parsed.data.refreshToken);
      return res.json(ok(null));
    } catch (error) {
      return authFailure(res, error);
    }
  });

  return router;
}

export function createInternalVerifyHandler(provider: AuthProvider | null, repository: UserRepository): express.RequestHandler {
  return async (req, res) => {
    if (!provider) return fail(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured");
    const accessToken = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return fail(res, 401, "AUTH_TOKEN_MISSING", "Access token is required");
    try {
      const authUserId = await provider.verify(accessToken);
      if (!authUserId) return fail(res, 401, "AUTH_TOKEN_INVALID", "Access token is invalid or expired");
      const profile = await repository.findUserByAuthId(authUserId);
      if (!profile) return fail(res, 404, "USER_PROFILE_NOT_FOUND", "No application profile is linked to this account");
      return res.json(ok({ id: profile.id, authUserId, role: profile.role, status: profile.status }));
    } catch {
      return fail(res, 503, "AUTH_SERVICE_UNAVAILABLE", "Authentication service is unavailable");
    }
  };
}
