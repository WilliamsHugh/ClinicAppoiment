// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "../app/auth/page";
import type { Session } from "../src/lib/session/session";

const REMEMBERED_EMAIL_KEY = "clinic_remembered_email";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let currentSession: Session;
const pushMock = vi.fn();

vi.mock("../src/lib/session/session-context", () => ({ useSession: () => currentSession }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  window.localStorage.clear();
  pushMock.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function changeInput(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("AuthPage (M3-UI-USER-002)", () => {
  it("supports split-screen login, password visibility toggle, remember email in localStorage, and loading state", async () => {
    let resolveSignIn!: () => void;
    const signInMock = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolveSignIn = done;
        })
    );
    currentSession = {
      status: "unauthenticated",
      identity: null,
      getAccessToken: async () => null,
      signIn: signInMock,
      signOut: async () => {},
    };

    window.localStorage.setItem(REMEMBERED_EMAIL_KEY, "doctor@phongkham.vn");

    await act(async () => {
      root.render(<AuthPage />);
    });

    expect(host.querySelector(".clinic-auth-split")).not.toBeNull();
    expect(host.textContent).toContain("Chào mừng trở lại");

    const emailInput = host.querySelector<HTMLInputElement>("#auth-email")!;
    const passwordInput = host.querySelector<HTMLInputElement>("#auth-password")!;
    expect(emailInput.value).toBe("doctor@phongkham.vn");
    expect(passwordInput.type).toBe("password");

    const toggleBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Hiện mật khẩu"]')!;
    await act(async () => {
      toggleBtn.click();
    });
    expect(passwordInput.type).toBe("text");

    await changeInput(passwordInput, "secret12345");
    const submitBtn = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(submitBtn.textContent).toBe("Đang xử lý...");
    expect(submitBtn.disabled).toBe(true);
    expect(signInMock).toHaveBeenCalledWith("doctor@phongkham.vn", "secret12345");
    expect(window.localStorage.getItem(REMEMBERED_EMAIL_KEY)).toBe("doctor@phongkham.vn");

    await act(async () => {
      resolveSignIn();
    });
    expect(pushMock).toHaveBeenCalledWith("/");
  });
});
