import { describe, expect, it, vi } from "vitest";
import { createPatientScopeVerifier, PatientScopeUnavailableError } from "../src/patient-scope.js";

const doctorUserId = "10000000-0000-4000-8000-000000000001";
const doctorId = "20000000-0000-4000-8000-000000000001";
const appointmentId = "30000000-0000-4000-8000-000000000001";
const patientId = "40000000-0000-4000-8000-000000000001";
const doctorToken = "user-to-doctor-secret-at-least-32-bytes";
const appointmentToken = "user-to-appointment-secret-at-least-32-bytes";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function fixture(options: {
  doctor?: unknown;
  appointment?: unknown;
  doctorStatus?: number;
  appointmentStatus?: number;
  doctorInternalToken?: string;
  appointmentInternalToken?: string;
  reservedTokens?: string[];
} = {}) {
  const doctor = options.doctor ?? { id: doctorId, userId: doctorUserId, isActive: true };
  const appointment = options.appointment ?? { id: appointmentId, patientId, doctorId, status: "CHECKED_IN" };
  const fetcher = vi.fn(async (input: string | URL | Request, _init?: RequestInit) =>
    String(input).includes("/doctors/by-user/")
      ? json({ success: true, data: doctor }, options.doctorStatus ?? 200)
      : json({ success: true, data: appointment }, options.appointmentStatus ?? 200));
  const verifier = createPatientScopeVerifier({
    doctorServiceUrl: "http://doctor-service:3002",
    appointmentServiceUrl: "http://appointment-service:3003",
    doctorInternalToken: options.doctorInternalToken ?? doctorToken,
    appointmentInternalToken: options.appointmentInternalToken ?? appointmentToken,
    reservedTokens: options.reservedTokens,
    fetcher: fetcher as typeof fetch,
  });
  return { verifier, fetcher };
}

describe("M2-USER-001 doctor patient scope", () => {
  it.each(["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED"])(
    "resolves an assigned active doctor's %s appointment through caller-specific APIs", async (status) => {
      const { verifier, fetcher } = fixture({ appointment: { id: appointmentId, patientId, doctorId, status } });
      await expect(verifier.patientIdForDoctorAppointment(doctorUserId, appointmentId, "request-123"))
        .resolves.toBe(patientId);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[0]?.[0]).toBe(`http://doctor-service:3002/internal/v1/doctors/by-user/${doctorUserId}`);
      expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
        headers: { Accept: "application/json", "X-Internal-Token": doctorToken, "X-Request-Id": "request-123" },
        redirect: "error",
      }));
      expect(fetcher.mock.calls[1]?.[0]).toBe(
        `http://appointment-service:3003/internal/v1/appointments/${appointmentId}/patient-scope`);
      expect(fetcher.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
        headers: { Accept: "application/json", "X-Internal-Token": appointmentToken,
          "X-Request-Id": "request-123" },
        redirect: "error",
      }));
    },
  );

  it("denies an inactive doctor before querying Appointment", async () => {
    const { verifier, fetcher } = fixture({ doctor: { id: doctorId, userId: doctorUserId, isActive: false } });
    await expect(verifier.patientIdForDoctorAppointment(doctorUserId, appointmentId)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects a Doctor response for another User ID", async () => {
    const { verifier, fetcher } = fixture({ doctor: {
      id: doctorId, userId: "10000000-0000-4000-8000-000000000002", isActive: true,
    } });
    await expect(verifier.patientIdForDoctorAppointment(doctorUserId, appointmentId))
      .rejects.toBeInstanceOf(PatientScopeUnavailableError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["CANCELLED", "NO_SHOW"])("denies a %s appointment", async (status) => {
    const { verifier } = fixture({ appointment: { id: appointmentId, patientId, doctorId, status } });
    await expect(verifier.patientIdForDoctorAppointment(doctorUserId, appointmentId)).resolves.toBeNull();
  });

  it("denies an appointment assigned to another doctor", async () => {
    const { verifier } = fixture({ appointment: {
      id: appointmentId, patientId, doctorId: "20000000-0000-4000-8000-000000000002", status: "CHECKED_IN",
    } });
    await expect(verifier.patientIdForDoctorAppointment(doctorUserId, appointmentId)).resolves.toBeNull();
  });

  it("treats a missing doctor or appointment as outside scope", async () => {
    const missingDoctor = fixture({ doctorStatus: 404 });
    const missingAppointment = fixture({ appointmentStatus: 404 });
    await expect(missingDoctor.verifier.patientIdForDoctorAppointment(doctorUserId, appointmentId))
      .resolves.toBeNull();
    expect(missingDoctor.fetcher).toHaveBeenCalledTimes(1);
    await expect(missingAppointment.verifier.patientIdForDoctorAppointment(doctorUserId, appointmentId))
      .resolves.toBeNull();
  });

  it.each([401, 503])("reports Doctor HTTP %i as unavailable", async (doctorStatus) => {
    const { verifier } = fixture({ doctorStatus });
    await expect(verifier.patientIdForDoctorAppointment(doctorUserId, appointmentId))
      .rejects.toBeInstanceOf(PatientScopeUnavailableError);
  });

  it.each([401, 503])("reports Appointment HTTP %i as unavailable", async (appointmentStatus) => {
    const { verifier } = fixture({ appointmentStatus });
    await expect(verifier.patientIdForDoctorAppointment(doctorUserId, appointmentId))
      .rejects.toBeInstanceOf(PatientScopeUnavailableError);
  });

  it("rejects malformed and mismatched upstream DTOs", async () => {
    const malformed = fixture({ appointment: { id: appointmentId, patientId, status: "CHECKED_IN" } });
    const wrongAppointmentId = fixture({ appointment: {
      id: "30000000-0000-4000-8000-000000000002", patientId, doctorId, status: "CHECKED_IN",
    } });
    await expect(malformed.verifier.patientIdForDoctorAppointment(doctorUserId, appointmentId))
      .rejects.toBeInstanceOf(PatientScopeUnavailableError);
    await expect(wrongAppointmentId.verifier.patientIdForDoctorAppointment(doctorUserId, appointmentId))
      .rejects.toBeInstanceOf(PatientScopeUnavailableError);
  });

  it("fails closed for missing, weak or reused caller credentials without making a request", async () => {
    for (const tokens of [
      { doctorInternalToken: "" },
      { appointmentInternalToken: "" },
      { doctorInternalToken: "short" },
      { appointmentInternalToken: "short" },
      { appointmentInternalToken: doctorToken },
      { reservedTokens: [doctorToken] },
    ]) {
      const { verifier, fetcher } = fixture(tokens);
      await expect(verifier.patientIdForDoctorAppointment(doctorUserId, appointmentId))
        .rejects.toBeInstanceOf(PatientScopeUnavailableError);
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("reports network failure as unavailable", async () => {
    const fetcher = vi.fn(async () => { throw new Error("network unavailable"); });
    const verifier = createPatientScopeVerifier({
      doctorServiceUrl: "http://doctor-service:3002", appointmentServiceUrl: "http://appointment-service:3003",
      doctorInternalToken: doctorToken, appointmentInternalToken: appointmentToken,
      fetcher: fetcher as typeof fetch,
    });
    await expect(verifier.patientIdForDoctorAppointment(doctorUserId, appointmentId))
      .rejects.toBeInstanceOf(PatientScopeUnavailableError);
  });
});
