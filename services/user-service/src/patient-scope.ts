import { z } from "zod";

const doctorReference = z.object({
  id: z.string().uuid(), userId: z.string().uuid(), isActive: z.boolean(),
}).strict();
const appointmentReference = z.object({
  id: z.string().uuid(), patientId: z.string().uuid(), doctorId: z.string().uuid(),
  status: z.enum(["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"]),
}).strict();

export class PatientScopeUnavailableError extends Error {
  constructor() {
    super("Patient scope dependencies are unavailable");
    this.name = "PatientScopeUnavailableError";
  }
}

export type PatientScopeVerifier = {
  patientIdForDoctorAppointment(userId: string, appointmentId: string, requestId?: string): Promise<string | null>;
};

export function createPatientScopeVerifier(options: {
  doctorServiceUrl: string;
  appointmentServiceUrl: string;
  doctorInternalToken?: string;
  appointmentInternalToken?: string;
  reservedTokens?: string[];
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): PatientScopeVerifier {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 4_000;
  const doctorBaseUrl = options.doctorServiceUrl.replace(/\/$/, "");
  const appointmentBaseUrl = options.appointmentServiceUrl.replace(/\/$/, "");

  async function read<T>(url: string, token: string, schema: z.ZodType<T>, requestId?: string): Promise<T | null> {
    try {
      const forwardedRequestId = requestId && /^[a-zA-Z0-9-]{1,80}$/.test(requestId) ? requestId : undefined;
      const response = await fetcher(url, {
        headers: { Accept: "application/json", "X-Internal-Token": token,
          ...(forwardedRequestId ? { "X-Request-Id": forwardedRequestId } : {}) },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new PatientScopeUnavailableError();
      const parsed = z.object({ success: z.literal(true), data: schema }).safeParse(await response.json());
      if (!parsed.success) throw new PatientScopeUnavailableError();
      return parsed.data.data;
    } catch {
      throw new PatientScopeUnavailableError();
    }
  }

  return {
    async patientIdForDoctorAppointment(userId, appointmentId, requestId) {
      const doctorToken = options.doctorInternalToken;
      const appointmentToken = options.appointmentInternalToken;
      if (!doctorToken || Buffer.byteLength(doctorToken, "utf8") < 32 ||
        !appointmentToken || Buffer.byteLength(appointmentToken, "utf8") < 32 ||
        doctorToken === appointmentToken || options.reservedTokens?.includes(doctorToken) ||
        options.reservedTokens?.includes(appointmentToken)) {
        throw new PatientScopeUnavailableError();
      }

      const doctor = await read(
        `${doctorBaseUrl}/internal/v1/doctors/by-user/${encodeURIComponent(userId)}`,
        doctorToken, doctorReference, requestId,
      );
      if (!doctor) return null;
      if (doctor.userId !== userId) throw new PatientScopeUnavailableError();
      if (!doctor.isActive) return null;

      const appointment = await read(
        `${appointmentBaseUrl}/internal/v1/appointments/${encodeURIComponent(appointmentId)}/patient-scope`,
        appointmentToken, appointmentReference, requestId,
      );
      if (!appointment) return null;
      if (appointment.id !== appointmentId) throw new PatientScopeUnavailableError();
      if (appointment.doctorId !== doctor.id || ["CANCELLED", "NO_SHOW"].includes(appointment.status)) return null;
      return appointment.patientId;
    },
  };
}
