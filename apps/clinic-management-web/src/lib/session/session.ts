export type ClinicRole = "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";

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
