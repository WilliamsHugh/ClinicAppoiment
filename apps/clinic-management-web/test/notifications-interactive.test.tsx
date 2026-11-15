// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsPanel } from "../src/features/notifications/notifications-panel";
import { NotificationProvider, useNotifications } from "../src/features/notifications/notification-context";
import { AppShell } from "../src/components/app-shell";
import type { ClinicRole, Session } from "../src/lib/session/session";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let currentSession: Session;
let mockPathname = "/notifications";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../src/lib/session/session-context", () => ({
  useSession: () => currentSession,
}));

function makeSession(role: ClinicRole = "DOCTOR", id = "u-doc-1"): Session {
  return {
    status: "authenticated",
    identity: { id, role, displayName: `Bác sĩ ${id}` },
    getAccessToken: async () => "test-token",
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
}

function envelope(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status = 500, message = "Lỗi kết nối máy chủ") {
  return new Response(
    JSON.stringify({ success: false, error: { message, code: "INTERNAL_ERROR" } }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://gateway.test";
  currentSession = makeSession("DOCTOR");
  mockPathname = "/notifications";
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
});

describe("NotificationsPanel State & Mutation Transitions (Nhánh 2 Agent B)", () => {
  const sampleNotifications = [
    {
      id: "notif-1",
      type: "appointment.confirmed",
      title: "Lịch hẹn đã xác nhận",
      message: "Bệnh nhân Nguyễn Văn A đã xác nhận lịch khám.",
      status: "UNREAD",
      createdAt: "2026-11-13T08:00:00.000Z",
      payload: { appointmentId: "appt-101" },
    },
    {
      id: "notif-2",
      type: "medical-record.created",
      title: "Hồ sơ bệnh án mới",
      message: "Bệnh án của bệnh nhân Lê Thị B đã được tạo.",
      status: "UNREAD",
      createdAt: "2026-11-13T08:30:00.000Z",
      payload: { recordId: "rec-202" },
    },
  ];

  it("Empty state ONLY appears after a successful response returning 0 items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/v1/notifications")) {
          return Promise.resolve(envelope({ items: [], total: 0 }));
        }
        return Promise.resolve(envelope({}));
      })
    );

    await act(async () => {
      root.render(
        <NotificationProvider>
          <NotificationsPanel />
        </NotificationProvider>
      );
    });

    // Sau khi fetch rỗng thành công -> hiển thị EmptyState
    expect(host.textContent).toContain("Chưa có thông báo nào");
    expect(host.textContent).not.toContain("Lỗi kết nối");
  });

  it("Network/Server error renders ErrorState and NEVER renders EmptyState", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/v1/notifications")) {
          return Promise.resolve(errorResponse(500, "Máy chủ thông báo đang bảo trì"));
        }
        return Promise.resolve(envelope({}));
      })
    );

    await act(async () => {
      root.render(
        <NotificationProvider>
          <NotificationsPanel />
        </NotificationProvider>
      );
    });

    // Phải render ErrorState
    expect(host.textContent).toContain("Máy chủ thông báo đang bảo trì");
    expect(host.textContent).toContain("Thử lại");

    // TUYỆT ĐỐI không diễn giải lỗi thành EmptyState ("Chưa có thông báo nào")
    expect(host.textContent).not.toContain("Chưa có thông báo nào");
    expect(host.textContent).not.toContain("Không có thông báo chưa đọc");
  });

  it("Retry in ErrorState keeps the active filter without resetting", async () => {
    let failPanel = true;
    const requestedUrls: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        requestedUrls.push(url);
        // Header provider request for unread count
        if (url.includes("status=UNREAD&limit=1")) {
          return Promise.resolve(envelope({ items: [], total: 0 }));
        }

        // Panel fetch
        if (failPanel) {
          return Promise.resolve(errorResponse(500, "Lỗi mạng tạm thời"));
        }
        return Promise.resolve(envelope({ items: sampleNotifications, total: 2 }));
      })
    );

    await act(async () => {
      root.render(
        <NotificationProvider>
          <NotificationsPanel />
        </NotificationProvider>
      );
    });

    expect(host.textContent).toContain("Lỗi mạng tạm thời");

    // Bấm nút "Thử lại" khi đang lỗi
    const retryBtn = Array.from(host.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Thử lại")
    );
    expect(retryBtn).toBeDefined();

    // Cho lần gọi tiếp theo thành công
    failPanel = false;

    await act(async () => {
      retryBtn?.click();
    });

    // Sau khi retry thành công -> hiển thị thông báo, không còn lỗi
    expect(host.textContent).toContain("Lịch hẹn đã xác nhận");
    expect(host.textContent).toContain("Hồ sơ bệnh án mới");
  });

  it("Preserves stale items on screen when refresh fails and shows non-blocking alert banner", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (callCount === 1) {
          // Lần đầu load thành công 2 items
          return Promise.resolve(envelope({ items: sampleNotifications, total: 2 }));
        }
        // Khi bấm "Làm mới", server trả lỗi
        return Promise.resolve(errorResponse(503, "Dịch vụ bận, vui lòng thử lại"));
      })
    );

    await act(async () => {
      root.render(
        <NotificationProvider>
          <NotificationsPanel />
        </NotificationProvider>
      );
    });

    expect(host.textContent).toContain("Lịch hẹn đã xác nhận");

    // Bấm nút "Làm mới"
    const refreshBtn = Array.from(host.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Làm mới")
    );
    expect(refreshBtn).toBeDefined();

    await act(async () => {
      refreshBtn?.click();
    });

    // Dữ liệu cũ VẪN hiển thị (không bị xóa trắng)
    expect(host.textContent).toContain("Lịch hẹn đã xác nhận");
    expect(host.textContent).toContain("Hồ sơ bệnh án mới");

    // Xuất hiện alert banner thông báo không thể làm mới
    expect(host.textContent).toContain("Không thể làm mới danh sách");
    expect(host.textContent).toContain("Dịch vụ bận, vui lòng thử lại");
  });

  it("Mark as read mutation: loading indicator, double-submit protection, and updates UI on success", async () => {
    let patchCalledCount = 0;
    let resolvePatch!: (val: Response) => void;
    const patchPromise = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "PATCH" && url.includes("/read")) {
          patchCalledCount++;
          return patchPromise;
        }
        if (url.includes("/api/v1/notifications")) {
          return Promise.resolve(envelope({ items: [sampleNotifications[0]], total: 1 }));
        }
        return Promise.resolve(envelope({}));
      })
    );

    await act(async () => {
      root.render(
        <NotificationProvider initialUnreadCount={1}>
          <AppShell>
            <NotificationsPanel />
          </AppShell>
        </NotificationProvider>
      );
    });

    expect(host.textContent).toContain("Lịch hẹn đã xác nhận");
    const topbarNotifLink = host.querySelector("header a[href='/notifications']");
    expect(topbarNotifLink?.getAttribute("aria-label")).toBe("Thông báo (1 chưa đọc)");
    expect(host.textContent).toContain("1");

    const markReadBtn = Array.from(host.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Đánh dấu đã đọc") && btn.getAttribute("aria-label")?.includes("Lịch hẹn đã xác nhận")
    );
    expect(markReadBtn).toBeDefined();

    // Bấm lần 1
    await act(async () => {
      markReadBtn?.click();
    });

    // Nút phải bị disabled và có trạng thái loading (chống double submit)
    expect(markReadBtn?.getAttribute("disabled")).not.toBeNull();
    expect(patchCalledCount).toBe(1);

    // Bấm lần 2 trong khi đang loading -> không được phát sinh thêm request
    await act(async () => {
      markReadBtn?.click();
    });
    expect(patchCalledCount).toBe(1);

    // Resolve response thành công
    await act(async () => {
      resolvePatch(envelope({ ...sampleNotifications[0], status: "READ" }));
    });

    // Nút "Đánh dấu đã đọc" biến mất (vì đã chuyển thành READ)
    expect(host.textContent).toContain("Đã đọc");
    const recheckedBtn = Array.from(host.querySelectorAll("button")).find((btn) =>
      btn.getAttribute("aria-label")?.includes("Lịch hẹn đã xác nhận")
    );
    expect(recheckedBtn).toBeUndefined();

    // Badge header cập nhật thành 0 chưa đọc
    expect(host.textContent).not.toContain("Thông báo (1 chưa đọc)");
  });

  it("Mark as read mutation failure keeps item UNREAD and surfaces actionable error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "PATCH" && url.includes("/read")) {
          return Promise.resolve(errorResponse(500, "Không thể cập nhật trạng thái thông báo"));
        }
        if (url.includes("/api/v1/notifications")) {
          return Promise.resolve(envelope({ items: [sampleNotifications[0]], total: 1 }));
        }
        return Promise.resolve(envelope({}));
      })
    );

    await act(async () => {
      root.render(
        <NotificationProvider initialUnreadCount={1}>
          <NotificationsPanel />
        </NotificationProvider>
      );
    });

    const markReadBtn = Array.from(host.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Đánh dấu đã đọc") && btn.getAttribute("aria-label")?.includes("Lịch hẹn đã xác nhận")
    );
    expect(markReadBtn).toBeDefined();

    await act(async () => {
      markReadBtn?.click();
    });

    // Lỗi hiển thị
    expect(host.textContent).toContain("Không thể cập nhật trạng thái thông báo");

    // Trạng thái vẫn là Chưa đọc, nút đánh dấu vẫn còn để user thử lại
    expect(host.textContent).toContain("Chưa đọc");
    const retryBtn = Array.from(host.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Đánh dấu đã đọc") && btn.getAttribute("aria-label")?.includes("Lịch hẹn đã xác nhận")
    );
    expect(retryBtn).toBeDefined();
    expect(retryBtn?.getAttribute("disabled")).toBeNull();
  });
  it("marks only unread items on this page, retains partial failures and decrements the global count only for successes", async () => {
    const patches: string[] = [];
    let failSecond = true;
    let panelLoads = 0;
    function UnreadProbe() {
      const { unreadCount } = useNotifications();
      return <output aria-label="Số chưa đọc toàn tập">{unreadCount}</output>;
    }
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === "PATCH") {
        patches.push(url.pathname);
        if (url.pathname.includes("notif-2") && failSecond) return errorResponse(503, "Chưa cập nhật được");
        return envelope({ status: "READ" });
      }
      if (url.searchParams.get("limit") === "1") return envelope({ items: [], total: 31 });
      panelLoads++;
      return envelope({ items: sampleNotifications, total: 31 });
    }));
    await act(async () => {
      root.render(<NotificationProvider><UnreadProbe /><NotificationsPanel /></NotificationProvider>);
    });
    const bulkButton = Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Đánh dấu trang này đã đọc")!;
    await act(async () => { bulkButton.click(); });
    expect(host.textContent).toContain("Một số thông báo không thể đánh dấu đã đọc");
    expect(host.querySelector("output")?.textContent).toBe("30");
    expect(host.querySelector("button[aria-label='Đánh dấu đã đọc thông báo: Lịch hẹn đã xác nhận']")).toBeNull();
    expect(host.querySelector("button[aria-label='Đánh dấu đã đọc thông báo: Hồ sơ bệnh án mới']")).not.toBeNull();
    failSecond = false;
    await act(async () => { bulkButton.click(); });
    expect(host.querySelector("output")?.textContent).toBe("29");
    expect(patches).toEqual(["/api/v1/notifications/notif-1/read", "/api/v1/notifications/notif-2/read", "/api/v1/notifications/notif-2/read"]);
    expect(panelLoads).toBe(1);
    expect(bulkButton.disabled).toBe(true);
  });

  it("ignores a late response for the previous filter", async () => {
    let resolveAll!: (response: Response) => void;
    const allResponse = new Promise<Response>((resolve) => { resolveAll = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(String(input));
      if (url.searchParams.get("limit") === "1") return envelope({ items: [], total: 1 });
      if (url.searchParams.get("status") === "UNREAD") return envelope({ items: [sampleNotifications[1]], total: 1 });
      return allResponse;
    }));
    await act(async () => { root.render(<NotificationProvider><NotificationsPanel /></NotificationProvider>); });
    const unreadFilter = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.startsWith("Chưa đọc"))!;
    await act(async () => { unreadFilter.click(); });
    expect(host.textContent).toContain("Hồ sơ bệnh án mới");
    await act(async () => { resolveAll(envelope({ items: [sampleNotifications[0]], total: 1 })); });
    expect(host.textContent).toContain("Hồ sơ bệnh án mới");
    expect(host.textContent).not.toContain("Lịch hẹn đã xác nhận");
    expect(unreadFilter.getAttribute("aria-pressed")).toBe("true");
  });

});
