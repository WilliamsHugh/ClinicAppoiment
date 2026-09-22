"use client";

import { createContext, useContext, type ReactNode } from "react";
import { unauthenticatedSession, type Session } from "./session";

const SessionContext = createContext<Session>(unauthenticatedSession);

export function SessionProvider({ children, session = unauthenticatedSession }: { children: ReactNode; session?: Session }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  return useContext(SessionContext);
}
