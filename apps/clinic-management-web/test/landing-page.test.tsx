// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicLandingPage } from "../src/features/landing/clinic-landing-page";
import type { Session } from "../src/lib/session/session";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
let session: Session;
const signOut = vi.fn();
vi.mock("../src/lib/session/session-context", () => ({ useSession: () => session }));

describe("Public home access", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    signOut.mockReset();
    session = { status: "unauthenticated", identity: null, getAccessToken: async () => null, signIn: vi.fn(), signOut };
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it("offers internal sign-in and real on-page destinations without an anonymous booking form", async () => {
    await act(async () => root.render(<ClinicLandingPage />));
    expect(container.querySelector('a[href="/auth"]')?.textContent).toContain("Đăng nhập");
    expect(container.querySelector("form")).toBeNull();
    for (const link of Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))) {
      expect(container.querySelector(link.getAttribute("href")!)).not.toBeNull();
    }
  });

  it("keeps the home available with a route back to work and one role label", async () => {
    session = { ...session, status: "authenticated", identity: { id: "review-doctor", role: "DOCTOR", displayName: "Người dùng kiểm thử" } };
    await act(async () => root.render(<ClinicLandingPage />));
    expect(container.querySelector('header a[href="/dashboard"]')).not.toBeNull();
    expect(container.querySelector("header")?.textContent).toContain("Người dùng kiểm thử");
    expect(container.querySelector("header")?.textContent?.match(/Bác sĩ/g)).toHaveLength(1);
    expect(container.querySelector("main")).not.toBeNull();
  });

  it("requires confirmation before signing out the current global provider session", async () => {
    session = { ...session, status: "authenticated", identity: { id: "review-doctor", role: "DOCTOR" } };
    await act(async () => root.render(<ClinicLandingPage />));
    const trigger = Array.from(container.querySelectorAll<HTMLButtonElement>("header button")).find(b => b.textContent === "Đăng xuất")!;
    await act(async () => trigger.click());
    expect(signOut).not.toHaveBeenCalled();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("mọi thiết bị");
    await act(async () => Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent === "Đăng xuất")!.click());
    expect(signOut).toHaveBeenCalledOnce();
  });
});
