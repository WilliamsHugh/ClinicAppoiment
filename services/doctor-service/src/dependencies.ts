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

async function jsonRequest(url: URL, service: "user" | "appointment", requestId?: string): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", ...(requestId ? { "X-Request-Id": requestId } : {}) },
      signal: AbortSignal.timeout(3000) });
    return { status: response.status, body: await response.json() };
  } catch { throw new DependencyError(service); }
}

export function createUserDirectory(baseUrl = process.env.USER_SERVICE_URL ?? "http://localhost:3001"): UserDirectory {
  return {
    async findDoctorAccount(userId, requestId) {
      const result = await jsonRequest(new URL(`/api/v1/users/${encodeURIComponent(userId)}`, baseUrl), "user", requestId);
      if (result.status === 404) return null;
      const envelope = result.body as { success?: boolean; data?: { id?: string; role?: string; status?: string } };
      if (result.status !== 200 || envelope.success !== true || !envelope.data?.id) throw new DependencyError("user");
      return { id: envelope.data.id, role: envelope.data.role ?? "", status: envelope.data.status ?? "" };
    }
  };
}

export function createAppointmentOccupancy(baseUrl = process.env.APPOINTMENT_SERVICE_URL): AppointmentOccupancy | null {
  if (!baseUrl) return null;
  return {
    async occupied(doctorId, from, to, requestId) {
      const url = new URL("/internal/v1/appointments/occupied-slots", baseUrl);
      url.searchParams.set("doctorId", doctorId);
      url.searchParams.set("from", from);
      if (to) url.searchParams.set("to", to);
      const result = await jsonRequest(url, "appointment", requestId);
      const envelope = result.body as { success?: boolean; data?: unknown };
      if (result.status !== 200 || envelope.success !== true || !Array.isArray(envelope.data)) {
        throw new DependencyError("appointment");
      }
      if (!envelope.data.every((slot) => typeof slot.startAt === "string" && typeof slot.endAt === "string"
        && Number.isFinite(Date.parse(slot.startAt)) && Number.isFinite(Date.parse(slot.endAt))
        && Date.parse(slot.startAt) < Date.parse(slot.endAt))) {
        throw new DependencyError("appointment");
      }
      return (envelope.data as Slot[]).map((slot) => ({
        startAt: new Date(slot.startAt).toISOString(), endAt: new Date(slot.endAt).toISOString()
      }));
    }
  };
}
