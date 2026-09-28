type SuccessEnvelope<T> = { success: true; data: T };

type DoctorReference = {
  id: string;
  userId: string;
  isActive: boolean;
};

type AppointmentReference = {
  id: string;
  patientId: string;
  doctorId: string;
  status: string;
};

export type PatientScopeVerifier = {
  patientIdForDoctorAppointment(userId: string, appointmentId: string): Promise<string | null>;
};

export function createPatientScopeVerifier(options: {
  doctorServiceUrl: string;
  appointmentServiceUrl: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): PatientScopeVerifier {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 4_000;
  const doctorBaseUrl = options.doctorServiceUrl.replace(/\/$/, "");
  const appointmentBaseUrl = options.appointmentServiceUrl.replace(/\/$/, "");

  async function read<T>(url: string): Promise<T | null> {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) return null;
      const body = await response.json() as SuccessEnvelope<T>;
      return body.success === true ? body.data : null;
    } catch {
      return null;
    }
  }

  return {
    async patientIdForDoctorAppointment(userId, appointmentId) {
      const [doctor, verification] = await Promise.all([
        read<DoctorReference>(`${doctorBaseUrl}/internal/v1/doctors/by-user/${encodeURIComponent(userId)}`),
        read<{ valid: boolean; appointment?: AppointmentReference }>(
          `${appointmentBaseUrl}/internal/v1/appointments/${encodeURIComponent(appointmentId)}/verify-for-medical-record`,
        ),
      ]);
      const appointment = verification?.appointment;
      const inScope = Boolean(
        doctor?.isActive &&
        appointment &&
        appointment.doctorId === doctor.id &&
        !["CANCELLED", "NO_SHOW"].includes(appointment.status),
      );
      return inScope && appointment ? appointment.patientId : null;
    },
  };
}
