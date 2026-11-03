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

  it("renders the top navigation bar with brand, links, Sign Up and Log In", async () => {
    await act(async () => {
      root.render(<ClinicLandingPage />);
    });

    expect(container.textContent).toContain("Health&Human");
    expect(container.textContent).toContain("Home");
    expect(container.textContent).toContain("Service");
    expect(container.textContent).toContain("Contact Us");
    expect(container.textContent).toContain("Help");
    expect(container.textContent).toContain("Blogs");
    expect(container.textContent).toContain("Sign Up");
    expect(container.textContent).toContain("Log In");

    const logoImg = container.querySelector('img[alt="Health&Human Clinic Logo"]');
    expect(logoImg).not.toBeNull();

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header?.className).toContain("headerSticky");
  });

  it("renders the hero section with headline, CTAs, doctor visual and floating badges", async () => {
    await act(async () => {
      root.render(<ClinicLandingPage />);
    });

    // Hero title
    expect(container.textContent).toContain("Providing Quality Care At Health&Human For A Brighter And Healthy Future");
    expect(container.textContent).toContain("Tại Hệ thống Phòng khám Health&Human");

    // Action buttons
    const appointmentsBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Appointments")
    );
    expect(appointmentsBtn).toBeDefined();

    const watchVideoBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Watch Video")
    );
    expect(watchVideoBtn).toBeDefined();

    // Floating badges
    expect(container.textContent).toContain("24/7");
    expect(container.textContent).toContain("Service");
    expect(container.textContent).toContain("Our Professionals");
    expect(container.textContent).toContain("30+");

    // Doctor image
    const doctorImg = container.querySelector('img[alt="Đội ngũ bác sĩ chuyên khoa Health&Human"]');
    expect(doctorImg).not.toBeNull();
  });

  it("renders the Find A Doctor search card and filters doctors interactively", async () => {
    await act(async () => {
      root.render(<ClinicLandingPage />);
    });

    expect(container.textContent).toContain("Find A Doctor");

    const nameInput = container.querySelector("#doctor-name-search") as HTMLInputElement;
    const specialtySelect = container.querySelector("#specialty-select") as HTMLSelectElement;
    const searchBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Search")
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

  it("opens and closes the Video Tour modal when Watch Video is clicked", async () => {
    await act(async () => {
      root.render(<ClinicLandingPage />);
    });

    const watchVideoBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Watch Video")
    )!;

    await act(async () => {
      watchVideoBtn.click();
    });

    expect(container.textContent).toContain("Giới Thiệu Phòng Khám Health&Human");
    expect(container.textContent).toContain("Video Tour Giới Thiệu Phòng Khám (HD)");

    // Click Close
    const closeBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Đóng") || b.getAttribute("aria-label") === "Đóng video"
    )!;

    await act(async () => {
      closeBtn.click();
    });

    expect(container.textContent).not.toContain("Video Tour Giới Thiệu Phòng Khám (HD)");
  });

  it("renders authenticated status with Vào Dashboard button when user is logged in", async () => {
    currentSession = makeSession("DOCTOR");
    const onSwitchMock = vi.fn();

    await act(async () => {
      root.render(<ClinicLandingPage onSwitchToDashboard={onSwitchMock} />);
    });

    expect(container.textContent).toContain("BS. Trần Văn A");
    expect(container.textContent).toContain("DOCTOR");
    expect(container.textContent).toContain("Vào Dashboard");
    expect(container.textContent).toContain("Đăng xuất");

    const dashboardBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Vào Dashboard")
    )!;

    await act(async () => {
      dashboardBtn.click();
    });

    expect(onSwitchMock).toHaveBeenCalled();
  });
});
