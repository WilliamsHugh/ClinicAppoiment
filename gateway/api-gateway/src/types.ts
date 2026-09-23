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

export type AuthTokens = {
  authUserId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type SignUpResult = {
  authUserId: string;
  tokens: AuthTokens | null;
};

export type AuthBroker = {
  signIn(email: string, password: string): Promise<AuthTokens>;
  signUp(fullName: string, email: string, password: string): Promise<SignUpResult>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  signOut(accessToken: string, refreshToken: string): Promise<void>;
};
