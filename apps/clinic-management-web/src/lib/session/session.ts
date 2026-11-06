export type ClinicRole = "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";

export function isClinicManagementRole(role: string): role is Exclude<ClinicRole, "PATIENT"> {
  return role === "DOCTOR" || role === "STAFF" || role === "ADMIN";
}

export function clinicRoleLabel(role?: ClinicRole): string {
  switch (role) {
    case "DOCTOR": return "Bác sĩ";
    case "ADMIN": return "Quản trị viên";
    case "STAFF": return "Nhân viên phòng khám";
    case "PATIENT": return "Bệnh nhân";
    default: return "Nhân viên phòng khám";
  }
}

export function sessionDisplayName(identity: SessionIdentity | null | undefined): string | undefined {
  const name = identity?.displayName?.trim();
  return name && name !== identity?.role ? name : undefined;
}

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface SessionIdentity {
  id: string;
  role: ClinicRole;
  displayName?: string;
  email?: string;
  phone?: string;
}

export interface Session {
  status: SessionStatus;
  identity: SessionIdentity | null;
  getAccessToken(): Promise<string | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  handleUnauthorized?(): Promise<void>;
}

export const unauthenticatedSession: Session = {
  status: "unauthenticated",
  identity: null,
  async getAccessToken() {
    return null;
  },
  async signIn() {},
  async signOut() {},
};
