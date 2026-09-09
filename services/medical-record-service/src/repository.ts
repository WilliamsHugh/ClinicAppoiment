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

export class MedicalRecordRepository {
  private readonly records: MedicalRecord[] = [];

  findAll(filters: { patientId?: string; doctorId?: string }) {
    return this.records.filter((record) => {
      if (record.deletedAt) return false;
      if (filters.patientId && record.patientId !== filters.patientId) return false;
      if (filters.doctorId && record.doctorId !== filters.doctorId) return false;
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
    return record;
  }

  update(id: string, input: Partial<MedicalRecord> & { updatedBy: string }) {
    const record = this.findById(id);
    if (!record) return null;
    Object.assign(record, input, { updatedAt: new Date().toISOString() });
    return record;
  }
}
