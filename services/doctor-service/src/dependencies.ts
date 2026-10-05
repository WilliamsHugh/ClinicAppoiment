import type { Slot } from "./models.js";

export class DependencyError extends Error {
  constructor(public readonly service: "user" | "appointment") { super(`${service} service is unavailable`); }
}

export interface UserDirectory {
  findDoctorAccount(userId: string, requestId?: string): Promise<{ id: string; role: string; status: string } | null>;
}

export interface AppointmentOccupancy {
  occupied(doctorId: string, from: string, to?: string, requestId?: string): Promise<Slot[]>;
}

async function jsonRequest(url: URL, service: "user" | "appointment", requestId?: string, timeoutMs = 3000,
  internalToken?: string): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", ...(requestId ? { "X-Request-Id": requestId } : {}),
      ...(internalToken ? { "X-Internal-Token": internalToken } : {}) },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs) });
    return { status: response.status, body: await response.json() };
  } catch { throw new DependencyError(service); }
}

export function createUserDirectory(baseUrl = process.env.USER_SERVICE_URL ?? "http://localhost:3001", timeoutMs = 3000): UserDirectory {
  return {
    async findDoctorAccount(userId, requestId) {
      const token = process.env.USER_DOCTOR_INTERNAL_API_TOKEN;
      if (!token || Buffer.byteLength(token, "utf8") < 32) throw new DependencyError("user");
      const result = await jsonRequest(new URL(`/internal/v1/users/${encodeURIComponent(userId)}/doctor-eligibility`, baseUrl),
        "user", requestId, timeoutMs, token);
      if (result.status === 404) return null;
      const envelope = result.body as { success?: boolean; data?: { id?: unknown; role?: unknown; status?: unknown } } | null;
      if (result.status !== 200 || envelope?.success !== true || envelope.data?.id !== userId
        || !["PATIENT", "DOCTOR", "STAFF", "ADMIN"].includes(String(envelope.data.role))
        || !["ACTIVE", "INACTIVE", "LOCKED"].includes(String(envelope.data.status))) {
        throw new DependencyError("user");
      }
      return { id: userId, role: String(envelope.data.role), status: String(envelope.data.status) };
    }
  };
}

function validUtcSlot(value: unknown): value is Slot {
  if (typeof value !== "object" || value === null) return false;
  const slot = value as Record<string, unknown>;
  const utcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  return typeof slot.startAt === "string" && typeof slot.endAt === "string"
    && utcTimestamp.test(slot.startAt) && utcTimestamp.test(slot.endAt)
    && Number.isFinite(Date.parse(slot.startAt)) && Number.isFinite(Date.parse(slot.endAt))
    && Date.parse(slot.startAt) < Date.parse(slot.endAt);
}

export function createAppointmentOccupancy(baseUrl = process.env.APPOINTMENT_SERVICE_URL, timeoutMs = 3000): AppointmentOccupancy | null {
  if (!baseUrl) return null;
  return {
    async occupied(doctorId, from, to, requestId) {
      const url = new URL("/internal/v1/appointments/occupied-slots", baseUrl);
      url.searchParams.set("doctorId", doctorId);
      url.searchParams.set("from", from);
      if (to) url.searchParams.set("to", to);
      const token = process.env.DOCTOR_INTERNAL_API_TOKEN;
      if (!token || Buffer.byteLength(token, "utf8") < 32) throw new DependencyError("appointment");
      const result = await jsonRequest(url, "appointment", requestId, timeoutMs, token);
      const envelope = result.body as { success?: boolean; data?: unknown } | null;
      if (result.status !== 200 || envelope?.success !== true || !Array.isArray(envelope.data)) {
        throw new DependencyError("appointment");
      }
      if (!envelope.data.every(validUtcSlot)) {
        throw new DependencyError("appointment");
      }
      return envelope.data.map((slot) => ({
        startAt: new Date(slot.startAt).toISOString(), endAt: new Date(slot.endAt).toISOString()
      }));
    }
  };
}
