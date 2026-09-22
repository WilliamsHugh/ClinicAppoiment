export type ClinicRole = "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface SessionIdentity {
  id: string;
  role: ClinicRole;
  displayName?: string;
}

export interface Session {
  status: SessionStatus;
  identity: SessionIdentity | null;
  getAccessToken(): Promise<string | null>;
}

export const unauthenticatedSession: Session = {
  status: "unauthenticated",
  identity: null,
  async getAccessToken() {
    return null;
  }
};
