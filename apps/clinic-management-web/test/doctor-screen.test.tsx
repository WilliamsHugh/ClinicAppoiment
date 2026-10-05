import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DoctorPanel } from "../src/features/doctors/doctor-panel";
import type { ClinicRole, Session } from "../src/lib/session/session";

// Vitest uses the classic JSX transform for this standalone test; Next.js uses the automatic runtime.
Object.assign(globalThis, { React });
let currentSession: Session;
vi.mock("../src/lib/session/session-context", () => ({ useSession: () => currentSession }));

function render(role?: ClinicRole) {
  currentSession = {
    status: role ? "authenticated" : "unauthenticated",
    identity: role ? { id: "user-1", role } : null,
    getAccessToken: async () => role ? "test-token" : null,
    signIn: async () => {},
    signOut: async () => {}
  };
  return renderToStaticMarkup(React.createElement(DoctorPanel));
}

describe("Doctor web screen permissions", () => {
  it("does not render management controls without a clinical session", () => {
    const markup = render();
    expect(markup).toContain("Bạn cần tài khoản bác sĩ");
    expect(markup).not.toContain("Quản lý chuyên khoa");
  });

  it("limits specialty and doctor account management to ADMIN", () => {
    expect(render("DOCTOR")).not.toContain("Quản lý chuyên khoa");
    expect(render("STAFF")).not.toContain("Quản lý hồ sơ bác sĩ");
    expect(render("ADMIN")).toContain("Quản lý chuyên khoa");
    expect(render("ADMIN")).toContain("Quản lý hồ sơ bác sĩ");
  });
});
