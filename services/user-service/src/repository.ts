import type { Role } from "@clinic/shared-types";

export type UserProfile = {
  id: string;
  supabaseAuthUserId: string;
  email: string;
  fullName: string;
  phone?: string;
  role: Role;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
};

export type PatientProfile = {
  id: string;
  userId: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContact?: string;
  insuranceNumber?: string;
};

export class UserRepository {
  private readonly users: UserProfile[] = [
    {
      id: "user-patient-1",
      supabaseAuthUserId: "auth-patient-1",
      email: "patient@example.com",
      fullName: "Nguyen Van A",
      phone: "0900000001",
      role: "PATIENT",
      status: "ACTIVE"
    },
    {
      id: "user-doctor-1",
      supabaseAuthUserId: "auth-doctor-1",
      email: "doctor@example.com",
      fullName: "Dr. Tran Thi B",
      role: "DOCTOR",
      status: "ACTIVE"
    }
  ];

  private readonly patients: PatientProfile[] = [
    {
      id: "patient-1",
      userId: "user-patient-1",
      dateOfBirth: "1998-01-01",
      gender: "MALE",
      address: "Ho Chi Minh City"
    }
  ];

  findUsers() {
    return this.users;
  }

  findUserById(id: string) {
    return this.users.find((user) => user.id === id);
  }

  findUserByAuthId(supabaseAuthUserId: string) {
    return this.users.find((user) => user.supabaseAuthUserId === supabaseAuthUserId);
  }

  updateUser(id: string, input: Partial<Pick<UserProfile, "fullName" | "phone" | "status" | "role">>) {
    const user = this.findUserById(id);
    if (!user) return null;
    Object.assign(user, input);
    return user;
  }

  findPatients() {
    return this.patients;
  }

  findPatientById(id: string) {
    return this.patients.find((patient) => patient.id === id);
  }

  updatePatient(id: string, input: Partial<PatientProfile>) {
    const patient = this.findPatientById(id);
    if (!patient) return null;
    Object.assign(patient, input);
    return patient;
  }
}

