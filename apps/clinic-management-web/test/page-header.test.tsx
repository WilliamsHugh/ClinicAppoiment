import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHeader, getPageHeaderConfig } from "../src/components/page-header";
import { RouteLoadingFallback } from "../src/components/route-guard";

Object.assign(globalThis, { React });

describe("PageHeader Component & Registry", () => {
  it("has static header configurations for all core protected app routes", () => {
    const requiredRoutes = [
      "/appointments",
      "/dashboard",
      "/doctors",
      "/health",
      "/users",
      "/medical-records",
      "/notifications",
      "/profile",
    ];

    for (const route of requiredRoutes) {
      const config = getPageHeaderConfig(route);
      expect(config, `Missing config for ${route}`).toBeDefined();
      expect(config?.title).toBeTruthy();
      expect(config?.subtitle).toBeTruthy();
    }
  });

  it("renders identical H1 and task summary across PageHeader and RouteLoadingFallback for /appointments", () => {
    const headerHtml = renderToStaticMarkup(React.createElement(PageHeader, { pathname: "/appointments" }));
    const fallbackHtml = renderToStaticMarkup(React.createElement(RouteLoadingFallback, { pathname: "/appointments" }));

    expect(headerHtml).toContain(">Quản lý lịch hẹn</h1>");
    expect(headerHtml).toContain("Theo dõi, tiếp đón, xác nhận và xử lý lịch khám của toàn phòng khám.");

    expect(fallbackHtml).toContain(">Quản lý lịch hẹn</h1>");
    expect(fallbackHtml).toContain("Theo dõi, tiếp đón, xác nhận và xử lý lịch khám của toàn phòng khám.");
  });

  it("renders identical H1 and task summary across PageHeader and RouteLoadingFallback for /doctors", () => {
    const headerHtml = renderToStaticMarkup(React.createElement(PageHeader, { pathname: "/doctors" }));
    const fallbackHtml = renderToStaticMarkup(React.createElement(RouteLoadingFallback, { pathname: "/doctors" }));

    expect(headerHtml).toContain(">Bác sĩ và lịch làm việc</h1>");
    expect(headerHtml).toContain("Quản lý thông tin bác sĩ, chuyên khoa, lịch làm việc và khung giờ khám.");

    expect(fallbackHtml).toContain(">Bác sĩ và lịch làm việc</h1>");
    expect(fallbackHtml).toContain("Quản lý thông tin bác sĩ, chuyên khoa, lịch làm việc và khung giờ khám.");
    // Must NOT contain invented h2 "Tìm bác sĩ" in fallback
    expect(fallbackHtml).not.toContain("Tìm bác sĩ</h2>");
  });

  it("renders identical H1 and task summary across PageHeader and RouteLoadingFallback for /health", () => {
    const headerHtml = renderToStaticMarkup(React.createElement(PageHeader, { pathname: "/health" }));
    const fallbackHtml = renderToStaticMarkup(React.createElement(RouteLoadingFallback, { pathname: "/health" }));

    expect(headerHtml).toContain(">Sức khỏe hệ thống</h1>");
    expect(headerHtml).toContain("Trạng thái tổng hợp do API Gateway cung cấp cho quản trị viên.");

    expect(fallbackHtml).toContain(">Sức khỏe hệ thống</h1>");
    expect(fallbackHtml).toContain("Trạng thái tổng hợp do API Gateway cung cấp cho quản trị viên.");
    // Section header inside must be H2 "Hạ tầng hệ thống" with eyebrow "API Gateway & Microservices"
    expect(fallbackHtml).toContain("<h2");
    expect(fallbackHtml).toContain("Hạ tầng hệ thống</h2>");
    expect(fallbackHtml).toContain("API Gateway &amp; Microservices");
  });

  it("renders identical H1 and task summary across PageHeader and RouteLoadingFallback for /users", () => {
    const headerHtml = renderToStaticMarkup(React.createElement(PageHeader, { pathname: "/users" }));
    const fallbackHtml = renderToStaticMarkup(React.createElement(RouteLoadingFallback, { pathname: "/users" }));

    expect(headerHtml).toContain(">Quản lý tài khoản</h1>");
    expect(headerHtml).toContain("Quản trị danh sách người dùng, phân quyền vai trò và kiểm soát trạng thái hoạt động tài khoản.");

    expect(fallbackHtml).toContain(">Quản lý tài khoản</h1>");
    expect(fallbackHtml).toContain("Quản trị danh sách người dùng, phân quyền vai trò và kiểm soát trạng thái hoạt động tài khoản.");
  });

  it("renders identical H1 and task summary across PageHeader and RouteLoadingFallback for /medical-records", () => {
    const headerHtml = renderToStaticMarkup(React.createElement(PageHeader, { pathname: "/medical-records" }));
    const fallbackHtml = renderToStaticMarkup(React.createElement(RouteLoadingFallback, { pathname: "/medical-records" }));

    expect(headerHtml).toContain(">Hồ sơ khám bệnh</h1>");
    expect(headerHtml).toContain("Ghi nhận triệu chứng, chẩn đoán, kế hoạch điều trị và kê đơn thuốc cho bệnh nhân.");

    expect(fallbackHtml).toContain(">Hồ sơ khám bệnh</h1>");
    expect(fallbackHtml).toContain("Ghi nhận triệu chứng, chẩn đoán, kế hoạch điều trị và kê đơn thuốc cho bệnh nhân.");
  });

  it("renders identical H1 and task summary across PageHeader and RouteLoadingFallback for /notifications", () => {
    const headerHtml = renderToStaticMarkup(React.createElement(PageHeader, { pathname: "/notifications" }));
    const fallbackHtml = renderToStaticMarkup(React.createElement(RouteLoadingFallback, { pathname: "/notifications" }));

    expect(headerHtml).toContain(">Thông báo</h1>");
    expect(headerHtml).toContain("Theo dõi các sự kiện lịch hẹn, hồ sơ bệnh án và cập nhật điều hành phòng khám.");

    expect(fallbackHtml).toContain(">Thông báo</h1>");
    expect(fallbackHtml).toContain("Theo dõi các sự kiện lịch hẹn, hồ sơ bệnh án và cập nhật điều hành phòng khám.");
    expect(fallbackHtml).toContain("Đánh dấu tất cả đã đọc");
    expect(fallbackHtml).toContain("Làm mới");
    expect(fallbackHtml.indexOf("Đánh dấu tất cả đã đọc")).toBeLessThan(fallbackHtml.indexOf("Làm mới"));
  });

  it("renders identical H1 and task summary across PageHeader and RouteLoadingFallback for /profile", () => {
    const headerHtml = renderToStaticMarkup(React.createElement(PageHeader, { pathname: "/profile" }));
    const fallbackHtml = renderToStaticMarkup(React.createElement(RouteLoadingFallback, { pathname: "/profile" }));

    expect(headerHtml).toContain(">Hồ sơ cá nhân</h1>");
    expect(headerHtml).toContain("Quản lý thông tin tài khoản, bảo mật và cài đặt làm việc trong phòng khám.");

    expect(fallbackHtml).toContain(">Hồ sơ cá nhân</h1>");
    expect(fallbackHtml).toContain("Quản lý thông tin tài khoản, bảo mật và cài đặt làm việc trong phòng khám.");
  });

  it("keeps the home route out of the dashboard loading fallback", () => {
    const fallbackHtml = renderToStaticMarkup(React.createElement(RouteLoadingFallback, { pathname: "/" }));

    expect(fallbackHtml).toContain("Đang mở trang chủ...");
    expect(fallbackHtml).not.toContain("<h1");
    expect(fallbackHtml).not.toContain("Xin chào");
  });

  it("uses the same named page header in the /dashboard route fallback", () => {
    const fallbackHtml = renderToStaticMarkup(React.createElement(RouteLoadingFallback, {
      pathname: "/dashboard",
    }));
    const dashboardHeaderHtml = renderToStaticMarkup(React.createElement(PageHeader, { pathname: "/dashboard" }));

    const getHeaderTitle = (html: string) => html.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0];
    expect(getHeaderTitle(fallbackHtml)).toBe(getHeaderTitle(dashboardHeaderHtml));
    expect(fallbackHtml).toContain("Theo dõi lịch khám trong ngày");
    expect(fallbackHtml).toContain("aria-label=\"Đang tải bảng điều khiển\"");
  });
});
