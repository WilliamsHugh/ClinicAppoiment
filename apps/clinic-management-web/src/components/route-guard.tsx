"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { canAccessRoute, routeForPath, type AppRoute } from "../lib/navigation/routes";
import { useSession } from "../lib/session/session-context";
import { LoadingState } from "./states";
import { Badge, Button, Skeleton, SkeletonTable, SkeletonCard } from "./ui";
import { PageHeader } from "./page-header";
import { SYSTEM_SERVICES } from "../features/health/health";

export const STATIC_HEALTH_SERVICES = SYSTEM_SERVICES.map((s) => ({
  key: s.key,
  title: s.shortName,
}));

export function RouteLoadingFallback({ pathname, route }: { pathname: string; route?: AppRoute }) {
  if (pathname === "/" || pathname === "") {
    return <LoadingState message="Đang mở trang chủ..." />;
  }

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return (
      <div className="page-stack" aria-busy="true" aria-label="Đang tải bảng điều khiển">
        <PageHeader pathname="/dashboard" />
        <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
          <Skeleton height={112} borderRadius="var(--radius-lg)" />
          <Skeleton height={240} borderRadius="var(--radius-lg)" />
        </div>
      </div>
    );
  }

  if (pathname.startsWith("/appointments")) {
    return (
      <div className="page-stack" aria-busy="true" aria-label="Đang nạp dữ liệu lịch hẹn">
        <PageHeader pathname="/appointments" />

        <section
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            padding: "16px 20px",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            marginTop: 16,
            marginBottom: 20,
            alignItems: "center",
          }}
          aria-label="Bộ lọc lịch hẹn"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)" }}>Ngày khám:</span>
            <Skeleton height={36} width={140} borderRadius="var(--radius-md)" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)" }}>Trạng thái:</span>
            <Skeleton height={36} width={130} borderRadius="var(--radius-md)" />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Skeleton height={36} width="100%" borderRadius="var(--radius-md)" />
          </div>
        </section>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          <SkeletonTable
            rows={6}
            headers={["Giờ khám", "Bệnh nhân", "Bác sĩ", "Chuyên khoa", "Trạng thái", "Thao tác"]}
          />
        </div>
      </div>
    );
  }

  if (pathname.startsWith("/users")) {
    return (
      <div className="page-stack" aria-busy="true" aria-label="Đang nạp danh sách tài khoản">
        <PageHeader pathname="/users" />

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 16,
            marginBottom: 20,
          }}
        >
          <Skeleton height={38} width={280} borderRadius="var(--radius-md)" />
          <Skeleton height={38} width={160} borderRadius="var(--radius-md)" />
          <Skeleton height={38} width={160} borderRadius="var(--radius-md)" />
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          <SkeletonTable
            rows={6}
            headers={["Họ và tên", "Email / Số điện thoại", "Vai trò", "Trạng thái", "Thao tác"]}
          />
        </div>
      </div>
    );
  }

  if (pathname.startsWith("/doctors")) {
    return (
      <div className="page-stack" aria-busy="true" aria-label="Đang nạp danh sách bác sĩ">
        <PageHeader pathname="/doctors" />

        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            padding: "20px",
            marginTop: 16,
            marginBottom: 20,
          }}
          aria-label="Tìm bác sĩ"
        >
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 200 }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>Tên bác sĩ</span>
              <Skeleton height={36} width="100%" borderRadius="var(--radius-md)" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 200 }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>Chuyên khoa</span>
              <Skeleton height={36} width="100%" borderRadius="var(--radius-md)" />
            </div>
            <div style={{ alignSelf: "flex-end" }}>
              <Button disabled variant="primary">Tìm kiếm</Button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </section>
      </div>
    );
  }

  if (pathname.startsWith("/medical-records")) {
    return (
      <div className="page-stack" aria-label="Đang nạp hồ sơ khám">
        <PageHeader pathname="/medical-records" />

        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            padding: "24px",
            marginTop: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: "1.15rem", margin: 0, color: "var(--ink)", fontWeight: 600 }}>
                Lập hồ sơ khám bệnh mới
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: "0.875rem", color: "var(--muted)" }}>
                Chọn lịch hẹn đã check-in để bắt đầu khám và lưu kết quả
              </p>
            </div>
            <Badge variant="warning" size="sm">Bản nháp (DRAFT)</Badge>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div aria-busy="true">
              <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)" }}>
                Lịch hẹn khám đã check-in
              </span>
              <Skeleton height={42} width="100%" borderRadius="var(--radius-md)" style={{ marginTop: 6 }} />
            </div>

            <div>
              <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)" }}>
                Triệu chứng lâm sàng
              </span>
              <textarea
                rows={2}
                disabled
                placeholder="Mô tả triệu chứng bệnh nhân phản ánh..."
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--line)",
                  background: "var(--surface-subtle)",
                }}
              />
            </div>

            <div>
              <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)" }}>
                Chẩn đoán sơ bộ / xác định
              </span>
              <textarea
                rows={2}
                disabled
                placeholder="Chẩn đoán bệnh lý của bác sĩ..."
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--line)",
                  background: "var(--surface-subtle)",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <Button disabled variant="secondary">
                Lưu nháp (DRAFT)
              </Button>
              <Button disabled variant="primary">
                Chốt bệnh án (FINAL)
              </Button>
            </div>
          </div>
        </section>

        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            padding: "24px",
            marginTop: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: "1.15rem", margin: 0, color: "var(--ink)", fontWeight: 600 }}>
                Hồ sơ bệnh án gần đây
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: "0.875rem", color: "var(--muted)" }}>
                Danh sách các ca khám đã ghi nhận trong hệ thống
              </p>
            </div>
            <Button disabled variant="secondary" size="sm">
              Làm mới
            </Button>
          </div>

          <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Skeleton height={100} width="100%" borderRadius="var(--radius-md)" />
            <Skeleton height={100} width="100%" borderRadius="var(--radius-md)" />
          </div>
        </section>
      </div>
    );
  }

  if (pathname.startsWith("/notifications")) {
    return (
      <div className="page-stack" aria-busy="true" aria-label="Đang nạp trung tâm thông báo">
        <PageHeader
          pathname="/notifications"
          actions={
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Button variant="secondary" size="sm" disabled>
                Đánh dấu tất cả đã đọc
              </Button>
              <Button variant="ghost" size="sm" disabled>
                Làm mới
              </Button>
            </div>
          }
        />

        <div style={{ display: "flex", gap: 8, margin: "16px 0 20px 0" }}>
          <Button variant="primary" size="sm" disabled>Tất cả</Button>
          <Button variant="secondary" size="sm" disabled>Chưa đọc</Button>
          <Button variant="secondary" size="sm" disabled>Đã đọc</Button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton height={80} width="100%" borderRadius="var(--radius-md)" />
          <Skeleton height={80} width="100%" borderRadius="var(--radius-md)" />
          <Skeleton height={80} width="100%" borderRadius="var(--radius-md)" />
        </div>
      </div>
    );
  }

  if (pathname.startsWith("/profile")) {
    return (
      <div className="page-stack" aria-busy="true" aria-label="Đang nạp hồ sơ cá nhân">
        <PageHeader pathname="/profile" />

        <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
          <div style={{ width: 200, display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton height={36} width="100%" borderRadius="var(--radius-md)" />
            <Skeleton height={36} width="100%" borderRadius="var(--radius-md)" />
            <Skeleton height={36} width="100%" borderRadius="var(--radius-md)" />
          </div>
          <div style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", padding: "24px" }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
              <Skeleton height={64} width={64} borderRadius="50%" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Skeleton height={20} width={180} />
                <Skeleton height={14} width={120} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Skeleton height={38} width="100%" borderRadius="var(--radius-md)" />
              <Skeleton height={38} width="100%" borderRadius="var(--radius-md)" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (pathname.startsWith("/health")) {
    return (
      <div className="page-stack" aria-busy="true" aria-label="Đang nạp thông tin hạ tầng hệ thống">
        <PageHeader pathname="/health" />

        <section className="health-panel" style={{ display: "flex", flexDirection: "column", gap: 20 }} aria-busy="true">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">API Gateway &amp; Microservices</p>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
                <h2 style={{ margin: 0 }}>Hạ tầng hệ thống</h2>
                <Skeleton height={24} width={140} borderRadius="var(--radius-full)" aria-busy="true" />
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4, display: "block" }}>
                Đang kết nối và kiểm tra trạng thái các dịch vụ...
              </span>
            </div>
            <Button variant="outline" disabled>Kiểm tra lại</Button>
          </div>

          <div className="health-grid" aria-busy="true">
            {STATIC_HEALTH_SERVICES.map((svc) => (
              <article key={svc.key} className="health-service">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h3 style={{ margin: 0 }}>{svc.title}</h3>
                </div>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                  <Skeleton height={24} width={140} borderRadius="var(--radius-full)" aria-busy="true" />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack" aria-busy="true" aria-live="polite">
      <PageHeader title={route?.label || "Đang tải giao diện..."} />
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", padding: "24px", marginTop: 16 }}>
        <Skeleton height={28} width={240} style={{ marginBottom: 16 }} />
        <Skeleton height={20} width="80%" style={{ marginBottom: 12 }} />
        <Skeleton height={20} width="60%" />
      </div>
    </div>
  );
}

export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const router = useRouter();
  const route = routeForPath(pathname);

  useEffect(() => {
    if (session.status === "unauthenticated" && route?.roles) {
      if (typeof window !== "undefined") {
        try {
          router.replace("/auth");
        } catch {
          window.location.href = "/auth";
        }
      }
    }
  }, [session.status, route?.roles, router]);

  if (!route?.roles) return <>{children}</>;

  if (session.status === "loading") {
    return <RouteLoadingFallback pathname={pathname} route={route} />;
  }
  if (session.status === "unauthenticated") {
    return <LoadingState message="Đang chuyển hướng đến trang đăng nhập..." />;
  }
  if (canAccessRoute(route, session)) return <>{children}</>;

  return (
    <div className="page-stack">
      <PageHeader pathname={pathname} />
      <section
        role="alert"
        style={{
          maxWidth: 560,
          margin: "24px auto 48px auto",
          padding: "36px 32px",
          background: "var(--surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-md)",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--danger-light)",
            color: "var(--danger)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-hidden="true"
        >
          <ShieldAlert size={28} />
        </div>

        <Badge variant="danger" size="md">
          403 · KHÔNG CÓ QUYỀN TRUY CẬP
        </Badge>

        <h2 style={{ fontSize: "1.35rem", fontWeight: 800, margin: 0, color: "var(--ink)" }}>
          Truy cập khu vực bị giới hạn
        </h2>

      <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6, fontSize: "0.925rem" }}>
        Tài khoản của bạn không có quyền truy cập trang này. Vui lòng trở về trang chủ hoặc liên hệ người quản trị nếu cần hỗ trợ.
      </p>

      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <Link href="/">
          <Button variant="primary">Về trang chủ</Button>
        </Link>
        {session.status === "authenticated" ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => session.signOut()}
          >
            Đăng xuất / Đổi tài khoản
          </Button>
        ) : (
          <Link href="/auth">
            <Button variant="secondary">Đăng nhập tài khoản khác</Button>
          </Link>
        )}
      </div>
    </section>
  </div>
);
}
