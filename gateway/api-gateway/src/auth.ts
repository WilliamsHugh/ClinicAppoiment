import { createClient } from "@supabase/supabase-js";
import type { Role } from "@clinic/shared-types";
import type { NextFunction, Response } from "express";
import type { GatewayConfig } from "./config.js";
import { sendError } from "./http.js";
import type { AccessTokenVerifier, AuthBroker, AuthTokens, GatewayRequest, UserProfileResolver } from "./types.js";

const roles: Role[] = ["PATIENT", "DOCTOR", "STAFF", "ADMIN"];

function toAuthTokens(data: {
  session: { access_token: string; refresh_token: string; expires_in: number; user: { id: string } } | null;
}): AuthTokens | null {
  const session = data.session;
  if (!session) return null;
  return {
    authUserId: session.user.id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in
  };
}

export function createSupabaseAuthBroker(config: GatewayConfig): AuthBroker | null {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  const createAuthClient = () => createClient(config.supabaseUrl!, config.supabaseAnonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  return {
    async signIn(email, password) {
      const { data, error } = await createAuthClient().auth.signInWithPassword({ email, password });
      const tokens = toAuthTokens(data);
      if (error || !tokens) throw new Error("AUTH_INVALID_CREDENTIALS");
      return tokens;
    },
    async signUp(fullName, email, password) {
      const { data, error } = await createAuthClient().auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      });
      if (error || !data.user) throw new Error("AUTH_REGISTRATION_FAILED");
      return { authUserId: data.user.id, tokens: toAuthTokens(data) };
    },
    async refresh(refreshToken) {
      const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token: refreshToken });
      const tokens = toAuthTokens(data);
      if (error || !tokens) throw new Error("AUTH_REFRESH_INVALID");
      return tokens;
    },
    async signOut(accessToken, refreshToken) {
      const client = createAuthClient();
      const { error: sessionError } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (sessionError) throw new Error("AUTH_SESSION_INVALID");
      const { error } = await client.auth.signOut({ scope: "global" });
      if (error) throw new Error("AUTH_SIGN_OUT_FAILED");
    }
  };
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Authentication dependency timed out")), timeoutMs);
  });
  try {
    return await Promise.race([operation, expired]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function createSupabaseVerifier(config: GatewayConfig): AccessTokenVerifier | null {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return async (token) => {
    const { data, error } = await client.auth.getUser(token);
    return error || !data.user ? null : { authUserId: data.user.id };
  };
}

export function createUserProfileResolver(config: GatewayConfig): UserProfileResolver {
  return async (authUserId, requestId) => {
    const response = await fetch(`${config.serviceTargets.users}/api/v1/auth/me`, {
      headers: { "X-Supabase-Auth-User-Id": authUserId, "X-Request-Id": requestId },
      signal: AbortSignal.timeout(config.authTimeoutMs)
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`User Service returned ${response.status}`);

    const body = await response.json() as {
      success: boolean;
      data?: { id?: string; role?: Role; status?: "ACTIVE" | "INACTIVE" | "LOCKED" };
    };
    if (!body.success || !body.data?.id || !body.data.role || !roles.includes(body.data.role) || !body.data.status) {
      throw new Error("User Service returned an invalid profile");
    }
    return { id: body.data.id, role: body.data.role, status: body.data.status };
  };
}

export function createAuthenticate(config: GatewayConfig, verifier: AccessTokenVerifier | null, resolveProfile: UserProfileResolver) {
  return async (req: GatewayRequest, res: Response, next: NextFunction) => {
    const match = req.header("authorization")?.match(/^Bearer\s+(.+)$/i);
    if (!match) return sendError(res, 401, "AUTH_TOKEN_MISSING", "Access token is required", [], req.requestId);

    if (!verifier) {
      if (!config.authDevMode) {
        return sendError(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured", [], req.requestId);
      }
      const userId = req.header("x-user-id");
      const role = req.header("x-role") as Role | undefined;
      if (match[1] !== "dev-token" || !userId || !role || !roles.includes(role)) {
        return sendError(res, 401, "AUTH_TOKEN_INVALID", "Development authentication is invalid", [], req.requestId);
      }
      req.user = { id: userId, authUserId: `dev:${userId}`, role };
      return next();
    }

    try {
      const tokenIdentity = await withTimeout(verifier(match[1]), config.authTimeoutMs);
      if (!tokenIdentity) {
        return sendError(res, 401, "AUTH_TOKEN_INVALID", "Access token is invalid or expired", [], req.requestId);
      }
      const profile = await withTimeout(
        resolveProfile(tokenIdentity.authUserId, req.requestId ?? "unknown"),
        config.authTimeoutMs
      );
      if (!profile) {
        return sendError(res, 403, "USER_PROFILE_NOT_FOUND", "No application profile is linked to this account", [], req.requestId);
      }
      if (profile.status !== "ACTIVE") {
        return sendError(res, 403, "ACCOUNT_INACTIVE", "User account is not active", [], req.requestId);
      }
      req.user = { id: profile.id, authUserId: tokenIdentity.authUserId, role: profile.role };
      return next();
    } catch {
      return sendError(res, 503, "AUTH_SERVICE_UNAVAILABLE", "Authentication service is unavailable", [], req.requestId);
    }
  };
}

export function requireRoles(...allowedRoles: Role[]) {
  return (req: GatewayRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return sendError(res, 403, "ACCESS_DENIED", "You do not have permission to access this resource", [], req.requestId);
    }
    return next();
  };
}

export function requireRoleForRequest(policy: (method: string, path: string) => Role[]) {
  return (req: GatewayRequest, res: Response, next: NextFunction) => {
    const allowedRoles = policy(req.method, req.path);
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return sendError(res, 403, "ACCESS_DENIED", "You do not have permission to access this resource", [], req.requestId);
    }
    return next();
  };
}
