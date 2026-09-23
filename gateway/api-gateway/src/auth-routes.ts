import express, { type Router } from "express";
import { z } from "zod";
import { sendError } from "./http.js";
import type { AuthBroker, AuthTokens, GatewayRequest, UserProfile, UserProfileResolver } from "./types.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128)
});

const registerSchema = loginSchema.extend({
  fullName: z.string().trim().min(2).max(120)
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const logoutSchema = refreshSchema;

async function resolveProfileWithRetry(
  resolver: UserProfileResolver,
  authUserId: string,
  requestId: string
): Promise<UserProfile | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const profile = await resolver(authUserId, requestId);
    if (profile) return profile;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
  return null;
}

function sessionData(tokens: AuthTokens, profile: UserProfile) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    user: { id: profile.id, role: profile.role }
  };
}

function authFailure(req: GatewayRequest, res: express.Response, error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "AUTH_INVALID_CREDENTIALS") {
    return sendError(res, 401, code, "Email hoặc mật khẩu không đúng", [], req.requestId);
  }
  if (code === "AUTH_REFRESH_INVALID" || code === "AUTH_SESSION_INVALID") {
    return sendError(res, 401, code, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn", [], req.requestId);
  }
  if (code === "AUTH_REGISTRATION_FAILED") {
    return sendError(res, 400, code, "Không thể đăng ký tài khoản", [], req.requestId);
  }
  return sendError(res, 503, "AUTH_SERVICE_UNAVAILABLE", "Authentication service is unavailable", [], req.requestId);
}

export function createAuthRouter(
  broker: AuthBroker | null,
  resolveProfile: UserProfileResolver
): Router {
  const router = express.Router();
  const json = express.json({ limit: "16kb" });

  router.post("/login", json, async (req: GatewayRequest, res) => {
    if (!broker) return sendError(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured", [], req.requestId);
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", parsed.error.issues, req.requestId);
    try {
      const tokens = await broker.signIn(parsed.data.email, parsed.data.password);
      const profile = await resolveProfileWithRetry(resolveProfile, tokens.authUserId, req.requestId ?? "unknown");
      if (!profile) return sendError(res, 403, "USER_PROFILE_NOT_FOUND", "No application profile is linked to this account", [], req.requestId);
      if (profile.status !== "ACTIVE") return sendError(res, 403, "ACCOUNT_INACTIVE", "User account is not active", [], req.requestId);
      return res.json({ success: true, data: sessionData(tokens, profile), requestId: req.requestId });
    } catch (error) {
      return authFailure(req, res, error);
    }
  });

  router.post("/register", json, async (req: GatewayRequest, res) => {
    if (!broker) return sendError(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured", [], req.requestId);
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", parsed.error.issues, req.requestId);
    try {
      const result = await broker.signUp(parsed.data.fullName, parsed.data.email, parsed.data.password);
      if (!result.tokens) {
        return res.status(201).json({
          success: true,
          data: { requiresEmailConfirmation: true },
          requestId: req.requestId
        });
      }
      const profile = await resolveProfileWithRetry(resolveProfile, result.authUserId, req.requestId ?? "unknown");
      if (!profile) {
        return sendError(res, 503, "USER_PROFILE_PROVISIONING_PENDING", "User profile is still being provisioned", [], req.requestId);
      }
      return res.status(201).json({
        success: true,
        data: { ...sessionData(result.tokens, profile), requiresEmailConfirmation: false },
        requestId: req.requestId
      });
    } catch (error) {
      return authFailure(req, res, error);
    }
  });

  router.post("/refresh", json, async (req: GatewayRequest, res) => {
    if (!broker) return sendError(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured", [], req.requestId);
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", parsed.error.issues, req.requestId);
    try {
      const tokens = await broker.refresh(parsed.data.refreshToken);
      const profile = await resolveProfileWithRetry(resolveProfile, tokens.authUserId, req.requestId ?? "unknown");
      if (!profile) return sendError(res, 403, "USER_PROFILE_NOT_FOUND", "No application profile is linked to this account", [], req.requestId);
      if (profile.status !== "ACTIVE") return sendError(res, 403, "ACCOUNT_INACTIVE", "User account is not active", [], req.requestId);
      return res.json({ success: true, data: sessionData(tokens, profile), requestId: req.requestId });
    } catch (error) {
      return authFailure(req, res, error);
    }
  });

  router.post("/logout", json, async (req: GatewayRequest, res) => {
    if (!broker) return sendError(res, 503, "AUTH_NOT_CONFIGURED", "Authentication is not configured", [], req.requestId);
    const accessToken = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const parsed = logoutSchema.safeParse(req.body);
    if (!accessToken || !parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", "Access token and refresh token are required", [], req.requestId);
    }
    try {
      await broker.signOut(accessToken, parsed.data.refreshToken);
      return res.json({ success: true, data: null, requestId: req.requestId });
    } catch (error) {
      return authFailure(req, res, error);
    }
  });

  return router;
}
