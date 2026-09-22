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

export type UserProfile = {
  id: string;
  role: Role;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
};

export type AccessTokenVerifier = (token: string) => Promise<{ authUserId: string } | null>;
export type UserProfileResolver = (authUserId: string, requestId: string) => Promise<UserProfile | null>;
