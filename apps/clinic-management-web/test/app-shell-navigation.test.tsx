// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/components/app-shell";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("../src/lib/session/session-context", () => ({ useSession: () => ({
  status: "authenticated", identity: { id: "review", role: "DOCTOR", displayName: "Người dùng kiểm thử" },
  getAccessToken: async () => "synthetic-token", signIn: vi.fn(), signOut: vi.fn(),
}) }));
vi.mock("../src/features/notifications/notification-context", () => ({ useNotifications: () => ({ unreadCount: 1, isLoading: false }) }));

describe("Mobile navigation keyboard boundary", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    await act(async () => root.render(<AppShell><div>Không gian làm việc</div></AppShell>));
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

  it("keeps a closed mobile menu inert and restores focus after Escape", async () => {
    const sidebar = container.querySelector("aside")!;
    expect(sidebar.hasAttribute("inert")).toBe(true);
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-controls="app-navigation"]')!;
    await act(async () => toggle.click());
    expect(sidebar.hasAttribute("inert")).toBe(false);
    expect(sidebar.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Đóng menu điều hướng");
    expect(container.querySelector("main")?.parentElement?.hasAttribute("inert")).toBe(true);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(sidebar.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(toggle);
    expect(container.querySelector("main")?.parentElement?.hasAttribute("inert")).toBe(false);
  });

  it("wraps Tab within the open drawer rather than into the work area", async () => {
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-controls="app-navigation"]')!.click());
    const controls = container.querySelector("aside")!.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    const first = controls[0], last = controls[controls.length - 1];
    last.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
  });
});
