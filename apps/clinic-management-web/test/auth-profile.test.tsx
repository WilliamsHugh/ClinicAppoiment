// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "../app/auth/page";
import { ProfileForm } from "../src/features/users/profile-form";
import type { ClinicRole, Session } from "../src/lib/session/session";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let currentSession: Session;
const mockPush = vi.fn();
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  usePathname: () => "/auth",
}));

vi.mock("../src/lib/session/session-context", () => ({
  useSession: () => currentSession,
}));

function makeSession(role?: ClinicRole): Session {
  return {
    status: role ? "authenticated" : "unauthenticated",
    identity: role
      ? { id: "u-12345678", role, displayName: "Nguyễn Văn Bác Sĩ", email: "doctor@clinic.local" }
      : null,
    getAccessToken: async () => (role ? "test-token" : null),
    signIn: mockSignIn,
    signOut: mockSignOut,
  };
}

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function blurInput(input: HTMLInputElement) {
  input.dispatchEvent(new Event("blur", { bubbles: false }));
  input.dispatchEvent(new Event("focusout", { bubbles: true }));
}

describe("Auth & Profile Pages (M3-WEB-030)", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://gateway.test";
    mockPush.mockReset();
    mockSignIn.mockReset();
    mockSignOut.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  describe("AuthPage (/auth)", () => {
    it("renders unauthenticated form with Health&Human branding and inputs", async () => {
      currentSession = makeSession();

      await act(async () => {
        root.render(<AuthPage />);
      });

      expect(host.textContent).toContain("Health&Human");
      expect(host.textContent).toContain("Đăng nhập quản lý");
      expect(host.querySelector("form[aria-label='Đăng nhập quản lý']")).toBeTruthy();
      expect(host.querySelector("#auth-email")).toBeTruthy();
      expect(host.querySelector("#auth-password")).toBeTruthy();
      expect(host.querySelector("button[type='submit']")).toBeTruthy();
    });

    it("displays error message when submitting empty fields", async () => {
      currentSession = makeSession();

      await act(async () => {
        root.render(<AuthPage />);
      });

      const form = host.querySelector("form")!;
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(host.textContent).toContain("Vui lòng điền đầy đủ email và mật khẩu.");
    });

    it("calls session.signIn and redirects to '/' on valid submit", async () => {
      currentSession = makeSession();
      mockSignIn.mockResolvedValueOnce(undefined);

      await act(async () => {
        root.render(<AuthPage />);
      });

      const emailInput = host.querySelector("#auth-email") as HTMLInputElement;
      const passInput = host.querySelector("#auth-password") as HTMLInputElement;
      const form = host.querySelector("form")!;

      await act(async () => {
        changeInput(emailInput, "admin@clinic.vn");
        changeInput(passInput, "password123");
      });

      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(mockSignIn).toHaveBeenCalledWith("admin@clinic.vn", "password123");
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });

    it("toggles password visibility when eye button is clicked", async () => {
      currentSession = makeSession();

      await act(async () => {
        root.render(<AuthPage />);
      });

      const passInput = host.querySelector("#auth-password") as HTMLInputElement;
      expect(passInput.type).toBe("password");

      const toggleBtn = host.querySelector("button[aria-label='Hiện mật khẩu']") as HTMLButtonElement;
      expect(toggleBtn).toBeTruthy();

      await act(async () => {
        toggleBtn.click();
      });

      expect(passInput.type).toBe("text");
      expect(toggleBtn.getAttribute("aria-label")).toBe("Ẩn mật khẩu");

      await act(async () => {
        toggleBtn.click();
      });

      expect(passInput.type).toBe("password");
      expect(toggleBtn.getAttribute("aria-label")).toBe("Hiện mật khẩu");
    });

    it("pre-fills email from localStorage and saves/removes on submit with rememberMe", async () => {
      currentSession = makeSession();
      mockSignIn.mockResolvedValue(undefined);
      localStorage.setItem("clinic_remembered_email", "saved@clinic.vn");

      await act(async () => {
        root.render(<AuthPage />);
      });

      const emailInput = host.querySelector("#auth-email") as HTMLInputElement;
      const rememberCheckbox = host.querySelector("#auth-remember-me") as HTMLInputElement;

      expect(emailInput.value).toBe("saved@clinic.vn");
      expect(rememberCheckbox.checked).toBe(true);

      const passInput = host.querySelector("#auth-password") as HTMLInputElement;
      const form = host.querySelector("form")!;

      await act(async () => {
        changeInput(passInput, "password123");
      });

      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(localStorage.getItem("clinic_remembered_email")).toBe("saved@clinic.vn");

      // Now uncheck and submit with different email
      await act(async () => {
        changeInput(emailInput, "temporary@clinic.vn");
        rememberCheckbox.click();
      });

      expect(rememberCheckbox.checked).toBe(false);

      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(localStorage.getItem("clinic_remembered_email")).toBeNull();
      localStorage.clear();
    });

    it("handles login flow correctly for each role (DOCTOR, STAFF, ADMIN)", async () => {
      currentSession = makeSession();
      mockSignIn.mockResolvedValue(undefined);

      const testRoles = [
        { email: "doctor@clinic.vn", pass: "docPass123" },
        { email: "staff@clinic.vn", pass: "staffPass123" },
        { email: "admin@clinic.vn", pass: "adminPass123" },
      ];

      for (const credential of testRoles) {
        mockSignIn.mockClear();
        mockPush.mockClear();

        await act(async () => {
          root.render(<AuthPage />);
        });

        const emailInput = host.querySelector("#auth-email") as HTMLInputElement;
        const passInput = host.querySelector("#auth-password") as HTMLInputElement;
        const form = host.querySelector("form")!;

        await act(async () => {
          changeInput(emailInput, credential.email);
          changeInput(passInput, credential.pass);
        });

        await act(async () => {
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });

        expect(mockSignIn).toHaveBeenCalledWith(credential.email, credential.pass);
        expect(mockPush).toHaveBeenCalledWith("/dashboard");
      }
    });

    it("renders authenticated screen with ConfirmModal on sign out", async () => {
      currentSession = makeSession("DOCTOR");

      await act(async () => {
        root.render(<AuthPage />);
      });

      expect(host.textContent).toContain("Đã đăng nhập");
      expect(host.textContent).toContain("Nguyễn Văn Bác Sĩ");

      // Find the dashboard button
      const dashboardBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Vào bảng điều khiển")
      )!;
      await act(async () => {
        dashboardBtn.click();
      });
      expect(mockPush).toHaveBeenCalledWith("/dashboard");

      // Find the logout button
      const logoutBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Đăng xuất")
      )!;
      await act(async () => {
        logoutBtn.click();
      });

      // Confirm modal should appear
      expect(host.textContent).toContain("Xác nhận đăng xuất");

      // Click Confirm button inside modal
      const confirmBtns = Array.from(host.querySelectorAll("button")).filter(
        (b) => b.textContent?.trim() === "Đăng xuất"
      );
      // The last one is inside the modal footer
      const modalConfirmBtn = confirmBtns[confirmBtns.length - 1];
      await act(async () => {
        modalConfirmBtn.click();
      });

      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe("ProfileForm (/profile)", () => {
    const mockProfile = {
      id: "u-12345678",
      email: "doctor@clinic.local",
      fullName: "BS. Trần Văn Nam",
      phone: "0901234567",
      role: "DOCTOR",
      status: "ACTIVE",
    };

    beforeEach(() => {
      currentSession = makeSession("DOCTOR");
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
        const url = new URL(String(input));
        const method = options?.method ?? "GET";

        if (url.pathname === "/api/v1/users/me" && method === "GET") {
          return envelope(mockProfile);
        }

        if (url.pathname === "/api/v1/users/me" && method === "PATCH") {
          const body = JSON.parse(String(options?.body));
          return envelope({
            ...mockProfile,
            fullName: body.fullName,
            phone: body.phone,
          });
        }

        return envelope({});
      });
    });

    it("loads and displays profile information", async () => {
      await act(async () => {
        root.render(<ProfileForm />);
      });

      expect(host.textContent).toContain("Hồ sơ cá nhân");
      expect(host.textContent).toContain("BS. Trần Văn Nam");
      expect(host.textContent).toContain("doctor@clinic.local");
      const nameInput = host.querySelector("#profile-fullname") as HTMLInputElement;
      expect(nameInput.value).toBe("BS. Trần Văn Nam");
    });

    it("validates full name and phone inline on blur", async () => {
      await act(async () => {
        root.render(<ProfileForm />);
      });

      const nameInput = host.querySelector("#profile-fullname") as HTMLInputElement;
      const phoneInput = host.querySelector("#profile-phone") as HTMLInputElement;

      // Set name to single character (invalid) and blur
      await act(async () => {
        changeInput(nameInput, "A");
        blurInput(nameInput);
      });

      expect(host.textContent).toContain("Họ và tên phải có ít nhất 2 ký tự.");
      expect(nameInput.getAttribute("aria-invalid")).toBe("true");

      // Set phone to invalid string and blur
      await act(async () => {
        changeInput(phoneInput, "invalid-phone-abc");
        blurInput(phoneInput);
      });

      expect(host.textContent).toContain("Số điện thoại không hợp lệ");
      expect(phoneInput.getAttribute("aria-invalid")).toBe("true");
    });

    it("opens ConfirmModal on save and updates profile upon confirmation", async () => {
      await act(async () => {
        root.render(<ProfileForm />);
      });

      const nameInput = host.querySelector("#profile-fullname") as HTMLInputElement;
      const saveBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Lưu thay đổi")
      )!;

      // Update name
      await act(async () => {
        changeInput(nameInput, "BS. Trần Văn Nam Mới");
      });

      // Click save
      await act(async () => {
        saveBtn.click();
      });

      // Confirm modal opens
      expect(host.textContent).toContain("Xác nhận lưu thay đổi");
      expect(host.textContent).toContain("Bạn có chắc chắn muốn cập nhật thông tin hồ sơ cá nhân?");

      // Confirm modal action
      const modalConfirmBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Lưu thay đổi" && b.getAttribute("type") !== "submit"
      )!;

      await act(async () => {
        modalConfirmBtn.click();
      });

      // Verify success notice
      expect(host.textContent).toContain("Đã cập nhật hồ sơ cá nhân thành công.");
    });

    it("preserves user input values and displays alert when API save request fails", async () => {
      // Mock PATCH to return failure
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
        const url = new URL(String(input));
        const method = options?.method ?? "GET";

        if (url.pathname === "/api/v1/users/me" && method === "GET") {
          return envelope(mockProfile);
        }

        if (url.pathname === "/api/v1/users/me" && method === "PATCH") {
          return new Response(
            JSON.stringify({
              success: false,
              error: { code: "INTERNAL_ERROR", message: "Máy chủ cơ sở dữ liệu tạm thời bận." },
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        return envelope({});
      });

      await act(async () => {
        root.render(<ProfileForm />);
      });

      const nameInput = host.querySelector("#profile-fullname") as HTMLInputElement;
      const phoneInput = host.querySelector("#profile-phone") as HTMLInputElement;
      const saveBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Lưu thay đổi")
      )!;

      // Type new inputs
      await act(async () => {
        changeInput(nameInput, "BS. Hoàng Văn Thử Nghiệm");
        changeInput(phoneInput, "0988776655");
      });

      // Submit
      await act(async () => {
        saveBtn.click();
      });

      // Confirm in modal
      const modalConfirmBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Lưu thay đổi" && b.getAttribute("type") !== "submit"
      )!;

      await act(async () => {
        modalConfirmBtn.click();
      });

      // Error alert should show up
      expect(host.textContent).toContain("Máy chủ cơ sở dữ liệu tạm thời bận.");

      // CRITICAL CHECK: User input is NOT wiped or reset on failure!
      expect(nameInput.value).toBe("BS. Hoàng Văn Thử Nghiệm");
      expect(phoneInput.value).toBe("0988776655");
    });

    it("shows roadmap badges and disables controls for features without APIs", async () => {
      await act(async () => {
        root.render(<ProfileForm />);
      });

      // 1. Avatar button
      const avatarBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Đổi ảnh đại diện")
      )!;
      expect(avatarBtn).toBeTruthy();
      expect(avatarBtn.disabled).toBe(true);
      expect(avatarBtn.textContent).toContain("Sắp ra mắt");

      // 2. Security tab
      const securityTabBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Bảo mật")
      )!;
      await act(async () => {
        securityTabBtn.click();
      });

      const changePassBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Đổi mật khẩu")
      )!;
      expect(changePassBtn).toBeTruthy();
      expect(changePassBtn.disabled).toBe(true);
      expect(changePassBtn.textContent).toContain("Sắp ra mắt");

      // 3. Notifications tab
      const notifTabBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Thông báo")
      )!;
      await act(async () => {
        notifTabBtn.click();
      });

      expect(host.textContent).toContain("Lộ trình phát triển");
      const switchButtons = host.querySelectorAll("button[role='switch']");
      expect(switchButtons.length).toBeGreaterThan(0);
      switchButtons.forEach((btn) => {
        expect((btn as HTMLButtonElement).disabled).toBe(true);
      });
    });

    it("switches to sessions tab and opens ConfirmModal on logout from sessions card", async () => {
      await act(async () => {
        root.render(<ProfileForm />);
      });

      const sessionsTabBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Phiên đăng nhập")
      )!;

      await act(async () => {
        sessionsTabBtn.click();
      });

      const logoutBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Đăng xuất khỏi thiết bị này")
      )!;

      await act(async () => {
        logoutBtn.click();
      });

      expect(host.textContent).toContain("Xác nhận đăng xuất");
      expect(host.textContent).toContain(
        "Bạn có chắc chắn muốn đăng xuất khỏi phiên làm việc trên thiết bị này?"
      );

      // Confirm logout in modal
      const modalLogoutBtn = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Đăng xuất"
      )!;

      await act(async () => {
        modalLogoutBtn.click();
      });

      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
