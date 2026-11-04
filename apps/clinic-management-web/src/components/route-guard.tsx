"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { canAccessRoute, routeForPath, type AppRoute } from "../lib/navigation/routes";
import { useSession } from "../lib/session/session-context";
import { LoadingState } from "./states";
import { Badge, Button, Skeleton, SkeletonTable, SkeletonCard } from "./ui";

export const STATIC_HEALTH_SERVICES = [
  { key: "api-gateway", title: "API Gateway" },
  { key: "users", title: "User Service" },
  { key: "doctors", title: "Doctor Service" },
  { key: "appointments", title: "Appointment Service" },
  { key: "medicalRecords", title: "Medical Record Service" },
  { key: "notifications", title: "Notification Service" },
];

export function RouteLoadingFallback({ pathname, route }: { pathname: string; route?: AppRoute }) {
  if (pathname.startsWith("/appointments")) {
    return (
      <div className="page-stack" aria-busy="true" aria-label="Đang nạp dữ liệu lịch hẹn">
        <header className="page-heading">
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--ink)" }}>
            Quản lý lịch hẹn
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.875rem" }}>
            Theo dõi, tiếp đón, xác nhận và xử lý lịch khám của toàn phòng khám.
          </p>
        </header>

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
        <header className="page-heading">
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--ink)" }}>
            Quản lý tài khoản
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.875rem" }}>
            Quản trị danh sách người dùng, phân quyền vai trò và kiểm soát trạng thái hoạt động tài khoản.
          </p>
        </header>

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
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            padding: "20px",
            marginBottom: 20,
          }}
          aria-label="Tìm bác sĩ"
        >
          <h2 style={{ fontSize: "1.25rem", margin: "0 0 16px 0", color: "var(--ink)" }}>Tìm bác sĩ</h2>
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
      <div className="page-stack" aria-busy="true" aria-label="Đang nạp hồ sơ khám">
        <header className="page-heading">
          <p className="eyebrow" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--brand)", margin: "0 0 4px 0", fontWeight: 700 }}>
            Medical Record Service
          </p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--ink)" }}>
            Hồ sơ khám bệnh
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.875rem" }}>
            Ghi nhận triệu chứng, chẩn đoán, kế hoạch điều trị và kê đơn thuốc cho bệnh nhân.
          </p>
        </header>

        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            padding: "24px",
            marginTop: 16,
          }}
        >
          <h2 style={{ fontSize: "1.2rem", margin: "0 0 16px 0", color: "var(--ink)" }}>
            Lập hồ sơ khám bệnh mới
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={38} width="100%" borderRadius="var(--radius-md)" />
            <Skeleton height={70} width="100%" borderRadius="var(--radius-md)" />
            <Skeleton height={70} width="100%" borderRadius="var(--radius-md)" />
          </div>
        </section>
      </div>
    );
  }

  if (pathname.startsWith("/notifications")) {
    return (
      <div className="page-stack" aria-busy="true" aria-label="Đang nạp trung tâm thông báo">
        <header className="page-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p className="eyebrow" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--brand)", margin: "0 0 4px 0", fontWeight: 700 }}>
              Trung tâm thông báo
            </p>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--ink)" }}>
              Thông báo
            </h1>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.875rem" }}>
              Theo dõi các sự kiện lịch hẹn, hồ sơ bệnh án và cập nhật điều hành phòng khám.
            </p>
          </div>
        </header>

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
        <header className="page-heading">
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--ink)" }}>
            Hồ sơ cá nhân
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.875rem" }}>
            Quản lý thông tin tài khoản, bảo mật và cài đặt làm việc trong phòng khám.
          </p>
        </header>

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
        <header className="page-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p className="eyebrow" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--brand)", margin: "0 0 4px 0", fontWeight: 700 }}>
              API Gateway &amp; Microservices
            </p>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--ink)" }}>
              Hạ tầng hệ thống
            </h1>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block" }}>
              Đang kết nối và kiểm tra trạng thái các dịch vụ...
            </span>
          </div>
          <Button variant="outline" disabled>Kiểm tra lại</Button>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 20 }}>
          {STATIC_HEALTH_SERVICES.map((svc) => (
            <article key={svc.key} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", padding: "20px", display: "flex", flexDirection: "column", gap: 8 }}>
              <h3 style={{ margin: 0, textTransform: "capitalize", fontSize: "1.1rem" }}>{svc.title}</h3>
              <div>
                <Skeleton height={24} width={140} borderRadius="var(--radius-full)" />
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack" aria-busy="true" aria-live="polite">
      <header className="page-heading">
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--ink)" }}>
          {route?.label || "Đang tải giao diện..."}
        </h1>
      </header>
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

  const currentRole = session.identity?.role;
  const allowedRoles = route.roles.join(", ");

  return (
    <section
      role="alert"
      style={{
        maxWidth: 560,
        margin: "48px auto",
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

      <h1 style={{ fontSize: "1.35rem", fontWeight: 800, margin: 0, color: "var(--ink)" }}>
        Truy cập khu vực bị giới hạn
      </h1>

      <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6, fontSize: "0.925rem" }}>
        Bạn đang đăng nhập với vai trò{" "}
        <strong style={{ color: "var(--ink)" }}>{currentRole || "Chưa xác định"}</strong>, không
        nằm trong danh sách vai trò được phép truy cập trang này ({allowedRoles}).
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
  );
}
