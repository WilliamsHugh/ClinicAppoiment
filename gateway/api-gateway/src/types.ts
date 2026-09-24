import type { Role } from "@clinic/shared-types";
import type { Request } from "express";

export type AuthenticatedUser = {
  id: string;
  authUserId: string;
  role: Role;
};

export type GatewayRequest = Request & {
  requestId?: string;
  user?: AuthenticatedUser;
};

export type VerifiedIdentity = {
  id: string;
  authUserId: string;
  role: Role;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
};

export type AccessTokenVerifier = (token: string, requestId: string) => Promise<VerifiedIdentity | null>;
