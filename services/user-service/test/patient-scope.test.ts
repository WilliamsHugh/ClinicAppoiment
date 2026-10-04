import { describe, expect, it, vi } from "vitest";
import { createPatientScopeVerifier } from "../src/patient-scope.js";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("USER-004 doctor patient scope", () => {
  it("resolves the patient only when the active doctor owns the appointment", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/doctors/by-user/")) {
        return json({ success: true, data: { id: "doctor-1", userId: "user-1", isActive: true } });
      }
      return json({
        success: true,
        data: {
          valid: true,
          appointment: {
            id: "appointment-1",
            patientId: "patient-1",
            doctorId: "doctor-1",
            status: "CHECKED_IN",
          },
        },
      });
    });
    const verifier = createPatientScopeVerifier({
      doctorServiceUrl: "http://doctor-service:3002",
      appointmentServiceUrl: "http://appointment-service:3003",
      fetcher: fetcher as typeof fetch,
    });

    await expect(verifier.patientIdForDoctorAppointment("user-1", "appointment-1"))
      .resolves.toBe("patient-1");
  });

  it.each([
    { doctorId: "doctor-other", status: "CHECKED_IN", active: true },
    { doctorId: "doctor-1", status: "CANCELLED", active: true },
    { doctorId: "doctor-1", status: "CHECKED_IN", active: false },
  ])("denies an appointment outside the doctor scope: %o", async ({ doctorId, status, active }) => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return url.includes("/doctors/by-user/")
        ? json({ success: true, data: { id: "doctor-1", userId: "user-1", isActive: active } })
        : json({
            success: true,
            data: {
              valid: true,
              appointment: { id: "appointment-1", patientId: "patient-1", doctorId, status },
            },
          });
    });
    const verifier = createPatientScopeVerifier({
      doctorServiceUrl: "http://doctor-service:3002",
      appointmentServiceUrl: "http://appointment-service:3003",
      fetcher: fetcher as typeof fetch,
    });

    await expect(verifier.patientIdForDoctorAppointment("user-1", "appointment-1"))
      .resolves.toBeNull();
  });
});
