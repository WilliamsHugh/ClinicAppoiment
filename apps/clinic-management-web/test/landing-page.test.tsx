// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicLandingPage } from "../src/features/landing/clinic-landing-page";
import type { ClinicRole, Session } from "../src/lib/session/session";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let currentSession: Session;
const mockSignOut = vi.fn();

vi.mock("../src/lib/session/session-context", () => ({
  useSession: () => currentSession,
}));

function makeSession(role?: ClinicRole): Session {
  return {
    status: role ? "authenticated" : "unauthenticated",
    identity: role
      ? { id: "u-101", role, displayName: "BS. Trần Văn A", email: "doctor@clinic.vn" }
      : null,
    getAccessToken: async () => (role ? "test-token" : null),
    signIn: vi.fn(),
    signOut: mockSignOut,
  };
}

describe("ClinicLandingPage (Public Clinic Presentation & Introduction)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    currentSession = makeSession(); // unauthenticated
    mockSignOut.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the top navigation bar with Vietnamese links and internal login action", async () => {
    await act(async () => {
      root.render(<ClinicLandingPage />);
    });

    expect(container.textContent).toContain("Health&Human");
    expect(container.textContent).toContain("Trang chủ");
    expect(container.textContent).toContain("Dịch vụ");
    expect(container.textContent).toContain("Liên hệ");
    expect(container.textContent).toContain("Hỗ trợ");
    expect(container.textContent).toContain("Cẩm nang");
    expect(container.textContent).toContain("Đăng nhập nội bộ");

    const logoImg = container.querySelector('img[alt="Health&Human Clinic Logo"]');
    expect(logoImg).not.toBeNull();

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header?.className).toContain("headerSticky");
  });

  it("renders the hero section with Vietnamese headline, CTAs, doctor visual and floating badges", async () => {
    await act(async () => {
      root.render(<ClinicLandingPage />);
    });

    // Hero title
    expect(container.textContent).toContain("Chăm Sóc Y Tế Chất Lượng Cao Tại Health&Human Vì Một Tương Lai Khỏe Mạnh Hơn");
    expect(container.textContent).toContain("Tại Hệ thống Phòng khám Health&Human");

    // Action buttons
    const appointmentsBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Đặt lịch khám")
    );
    expect(appointmentsBtn).toBeDefined();

    const servicesBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Xem dịch vụ khám")
    );
    expect(servicesBtn).toBeDefined();

    // Floating badges
    expect(container.textContent).toContain("24/7");
    expect(container.textContent).toContain("Trực cấp cứu");
    expect(container.textContent).toContain("Đội ngũ chuyên gia");
    expect(container.textContent).toContain("30+");

    // Doctor image
    const doctorImg = container.querySelector('img[alt="Đội ngũ bác sĩ chuyên khoa Health&Human"]');
    expect(doctorImg).not.toBeNull();
  });

  it("renders the Find A Doctor search card and filters doctors interactively", async () => {
    await act(async () => {
      root.render(<ClinicLandingPage />);
    });

    expect(container.textContent).toContain("Tìm kiếm bác sĩ");

    const nameInput = container.querySelector("#doctor-name-search") as HTMLInputElement;
    const specialtySelect = container.querySelector("#specialty-select") as HTMLSelectElement;
    const searchBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Tìm kiếm")
    )!;

    expect(nameInput).not.toBeNull();
    expect(specialtySelect).not.toBeNull();

    // Perform search by typing "Nhi"
    await act(async () => {
      nameInput.value = "Nhi";
      nameInput.dispatchEvent(new Event("change", { bubbles: true }));
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchBtn.click();
    });

    expect(container.textContent).toContain("BS. CKI Trần Văn An");
    expect(container.textContent).toContain("Nhi khoa (Pediatrics)");
  });

  it("scrolls to services section when Xem dịch vụ khám CTA is clicked", async () => {
    await act(async () => {
      root.render(<ClinicLandingPage />);
    });

    const servicesBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Xem dịch vụ khám")
    )!;

    await act(async () => {
      servicesBtn.click();
    });

    const nav = container.querySelector("nav")!;
    const serviceNavBtn = Array.from(nav.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Dịch vụ"
    )!;
    expect(serviceNavBtn.className).toContain("navLinkActive");
  });

  it("renders authenticated status with Vào Dashboard button when user is logged in", async () => {
    currentSession = makeSession("DOCTOR");
    await act(async () => {
      root.render(<ClinicLandingPage />);
    });

    expect(container.textContent).toContain("BS. Trần Văn A");
    expect(container.textContent).toContain("Bác sĩ");
    expect(container.textContent).toContain("Vào Dashboard");
    expect(container.textContent).toContain("Đăng xuất");

    const dashboardBtn = Array.from(container.querySelectorAll("a")).find(
      (b) => b.textContent?.includes("Vào Dashboard")
    )!;
    expect(dashboardBtn.getAttribute("href")).toBe("/dashboard");
  });

  it("handles navigation buttons click and toggles active state smoothly", async () => {
    // Mock window.scrollTo
    const originalScrollTo = window.scrollTo;
    window.scrollTo = vi.fn();

    await act(async () => {
      root.render(<ClinicLandingPage />);
    });

    const nav = container.querySelector("nav")!;
    const navButtons = Array.from(nav.querySelectorAll("button"));
    const homeBtn = navButtons.find((b) => b.textContent?.trim() === "Trang chủ")!;
    const serviceBtn = navButtons.find((b) => b.textContent?.trim() === "Dịch vụ")!;
    const helpBtn = navButtons.find((b) => b.textContent?.trim() === "Hỗ trợ")!;
    const blogsBtn = navButtons.find((b) => b.textContent?.trim() === "Cẩm nang")!;
    const contactBtn = navButtons.find((b) => b.textContent?.trim() === "Liên hệ")!;

    expect(homeBtn).toBeDefined();
    expect(serviceBtn).toBeDefined();
    expect(helpBtn).toBeDefined();
    expect(blogsBtn).toBeDefined();
    expect(contactBtn).toBeDefined();

    // Default active is home
    expect(homeBtn.className).toContain("navLinkActive");
    expect(serviceBtn.className).not.toContain("navLinkActive");

    // Click Service
    await act(async () => {
      serviceBtn.click();
    });
    expect(serviceBtn.className).toContain("navLinkActive");
    expect(homeBtn.className).not.toContain("navLinkActive");

    // Click Help
    await act(async () => {
      helpBtn.click();
    });
    expect(helpBtn.className).toContain("navLinkActive");

    // Click Blogs
    await act(async () => {
      blogsBtn.click();
    });
    expect(blogsBtn.className).toContain("navLinkActive");

    // Click Home again -> calls window.scrollTo({ top: 0, behavior: 'smooth' })
    await act(async () => {
      homeBtn.click();
    });
    expect(homeBtn.className).toContain("navLinkActive");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });

    window.scrollTo = originalScrollTo;
  });

  it("interactively toggles Help FAQ accordion answers", async () => {
    await act(async () => {
      root.render(<ClinicLandingPage />);
    });

    // Check Help section title
    expect(container.textContent).toContain("Trung Tâm Trợ Giúp & Giải Đáp Thắc Mắc");

    // Find first FAQ button
    const firstFaqBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Làm thế nào để tôi đặt lịch hẹn khám tại Health&Human?")
    )!;
    expect(firstFaqBtn).toBeDefined();

    // Initially index 0 is open
    expect(container.textContent).toContain("Bạn có thể dễ dàng đặt lịch bằng 3 cách");

    // Toggle close
    await act(async () => {
      firstFaqBtn.click();
    });
    expect(container.textContent).not.toContain("Bạn có thể dễ dàng đặt lịch bằng 3 cách");

    // Toggle open again
    await act(async () => {
      firstFaqBtn.click();
    });
    expect(container.textContent).toContain("Bạn có thể dễ dàng đặt lịch bằng 3 cách");
  });

  it("opens and closes medical blog article reading modal", async () => {
    await act(async () => {
      root.render(<ClinicLandingPage />);
    });

    expect(container.textContent).toContain("Tin Tức & Kiến Thức Y Khoa");
    expect(container.textContent).toContain("5 Thói quen đơn giản giúp duy trì trái tim khỏe mạnh");

    // Find and click "Đọc tiếp" for cardiology article
    const readBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Đọc tiếp")
    )!;

    await act(async () => {
      readBtn.click();
    });

    // Modal is opened
    expect(container.textContent).toContain("Tác giả: ThS. BS Lê Thị Mai");
    expect(container.textContent).toContain("Bệnh lý tim mạch hiện là nguyên nhân hàng đầu");
    expect(container.textContent).toContain("Đặt Lịch Khám Chuyên Khoa");

    // Close modal
    const closeBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Đóng" || b.getAttribute("aria-label") === "Đóng bài viết"
    )!;

    await act(async () => {
      closeBtn.click();
    });

    expect(container.textContent).not.toContain("Tác giả: ThS. BS Lê Thị Mai");
  });
});
