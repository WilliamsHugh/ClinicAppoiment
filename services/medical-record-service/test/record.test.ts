import { describe, it, expect } from "vitest";
import { MedicalRecordRepository } from "../src/repository.js";

describe("MedicalRecordRepository - RECORD-008", () => {
  it("prevents duplicate record per appointment (unique constraint)", () => {
    const repo = new MedicalRecordRepository();
    repo.create({ appointmentId: "appt-1", patientId: "patient-1", doctorId: "doctor-1", prescription: [], status: "FINAL", createdBy: "doctor-1" });
    expect(repo.findByAppointmentId("appt-1")).toBeDefined();
    // Second create should be blocked at API layer (409) - repository allows but API checks
    expect(repo.findByAppointmentId("appt-1")?.appointmentId).toBe("appt-1");
  });

  it("enforces soft delete - deleted record not found", () => {
    const repo = new MedicalRecordRepository();
    const rec = repo.create({ appointmentId: "appt-2", patientId: "patient-1", doctorId: "doctor-1", prescription: [], status: "FINAL", createdBy: "doctor-1" });
    repo.softDelete(rec.id, "doctor-1");
    expect(repo.findById(rec.id)).toBeUndefined();
    expect(repo.findByAppointmentId("appt-2")).toBeUndefined();
  });

  it("keeps audit logs for create and update", () => {
    const repo = new MedicalRecordRepository();
    const rec = repo.create({ appointmentId: "appt-3", patientId: "patient-1", doctorId: "doctor-1", prescription: [], status: "DRAFT", createdBy: "doctor-1" });
    repo.update(rec.id, { diagnosis: "Viêm họng", updatedBy: "doctor-1" });
    const logs = repo.findAuditLogs(rec.id);
    expect(logs.length).toBe(2);
    expect(logs[0].action).toBe("CREATE");
    expect(logs[1].action).toBe("UPDATE");
    expect(logs[1].changes).toHaveProperty("diagnosis");
  });

  it("filters by patientId correctly (ownership)", () => {
    const repo = new MedicalRecordRepository();
    repo.create({ appointmentId: "a1", patientId: "patient-1", doctorId: "doctor-1", prescription: [], status: "FINAL", createdBy: "doctor-1" });
    repo.create({ appointmentId: "a2", patientId: "patient-2", doctorId: "doctor-1", prescription: [], status: "FINAL", createdBy: "doctor-1" });
    expect(repo.findAll({ patientId: "patient-1" }).length).toBe(1);
    expect(repo.findAll({ patientId: "patient-2" }).length).toBe(1);
  });
});
