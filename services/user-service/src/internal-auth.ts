import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export type InternalCaller = "gateway" | "doctor" | "appointment" | "record";
export type InternalCredentials = Partial<Record<InternalCaller, string>>;

export function internalCredentialsFromEnv(): InternalCredentials {
  return {
    gateway: process.env.USER_GATEWAY_INTERNAL_API_TOKEN,
    doctor: process.env.USER_DOCTOR_INTERNAL_API_TOKEN,
    appointment: process.env.USER_APPOINTMENT_INTERNAL_API_TOKEN,
    record: process.env.USER_RECORD_INTERNAL_API_TOKEN,
  };
}

export function requireInternalCaller(
  allowed: readonly InternalCaller[],
  credentials: InternalCredentials,
): RequestHandler {
  return (req, res, next) => {
    const configured = Object.values(credentials).filter((value): value is string => Boolean(value));
    const required = allowed.map((caller) => credentials[caller]);
    if (required.some((value) => !value || Buffer.byteLength(value, "utf8") < 32)
      || configured.some((value, index) => configured.indexOf(value) !== index)) {
      return res.status(503).json({ success: false, error: {
        code: "INTERNAL_AUTH_NOT_CONFIGURED", message: "Internal service authentication is unavailable", details: [],
      } });
    }

    const supplied = req.header("X-Internal-Token") ?? "";
    const actual = Buffer.from(supplied, "utf8");
    const authorized = required.some((value) => {
      const expected = Buffer.from(value!, "utf8");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
    if (!authorized) {
      return res.status(401).json({ success: false, error: {
        code: "INTERNAL_AUTH_REQUIRED", message: "Internal service credential is required", details: [],
      } });
    }
    next();
  };
}
