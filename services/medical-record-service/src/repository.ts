import { randomUUID } from "crypto";

export type PrescriptionItem = {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
};

export type MedicalRecord = {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  symptoms?: string;
  diagnosis?: string;
  notes?: string;
  treatmentPlan?: string;
  prescription: PrescriptionItem[];
  status: "DRAFT" | "FINAL";
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type MedicalRecordAuditLog = {
  id: string;
  medicalRecordId: string;
  actorId: string;
  action: "CREATE" | "UPDATE";
  changes: Record<string, unknown>;
  createdAt: string;
};

export class MedicalRecordRepository {
  private readonly records: MedicalRecord[] = [];
  private readonly auditLogs: MedicalRecordAuditLog[] = [];

  // RECORD-001: Repository chỉ truy cập schema medical_record_service
  // Tham chiếu logic: appointmentId -> appointment_service.appointments.id
  // patientId -> user_service.patient_profiles.id (logic)
  // doctorId -> doctor_service.doctors.id (logic)
  // Không JOIN/FK xuyên service

  findAll(filters: { patientId?: string; doctorId?: string; appointmentId?: string }) {
    return this.records.filter((record) => {
      if (record.deletedAt) return false;
      if (filters.patientId && record.patientId !== filters.patientId) return false;
      if (filters.doctorId && record.doctorId !== filters.doctorId) return false;
      if (filters.appointmentId && record.appointmentId !== filters.appointmentId) return false;
      return true;
    });
  }

  findById(id: string) {
    return this.records.find((record) => record.id === id && !record.deletedAt);
  }

  findByAppointmentId(appointmentId: string) {
    return this.records.find((record) => record.appointmentId === appointmentId && !record.deletedAt);
  }

  create(input: Omit<MedicalRecord, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const record: MedicalRecord = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now
    };
    this.records.push(record);
    this.auditLogs.push({
      id: randomUUID(),
      medicalRecordId: record.id,
      actorId: input.createdBy,
      action: "CREATE",
      changes: { ...input },
      createdAt: now
    });
    return record;
  }

  update(id: string, input: Partial<MedicalRecord> & { updatedBy: string }) {
    const record = this.findById(id);
    if (!record) return null;
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (key === "updatedBy" || key === "id" || key === "createdAt") continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((record as any)[key] !== value) changes[key] = value;
    }
    Object.assign(record, input, { updatedAt: new Date().toISOString() });
    if (Object.keys(changes).length > 0) {
      this.auditLogs.push({
        id: randomUUID(),
        medicalRecordId: id,
        actorId: input.updatedBy,
        action: "UPDATE",
        changes,
        createdAt: record.updatedAt
      });
    }
    return record;
  }

  findAuditLogs(medicalRecordId: string) {
    return this.auditLogs.filter((log) => log.medicalRecordId === medicalRecordId);
  }

  // Soft delete intentionally not exposed via public API (RECORD-004: không xóa vật lý tùy tiện)
  softDelete(id: string, actorId: string) {
    const record = this.findById(id);
    if (!record) return null;
    record.deletedAt = new Date().toISOString();
    record.updatedBy = actorId;
    this.auditLogs.push({
      id: randomUUID(),
      medicalRecordId: id,
      actorId,
      action: "UPDATE",
      changes: { deletedAt: record.deletedAt },
      createdAt: record.deletedAt
    });
    return record;
  }
}
