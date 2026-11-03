"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { canAccessRoute, routeForPath } from "../lib/navigation/routes";
import { useSession } from "../lib/session/session-context";
import { LoadingState } from "./states";
import { Badge, Button } from "./ui";

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
    return <LoadingState message="Đang kiểm tra quyền truy cập..." />;
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
