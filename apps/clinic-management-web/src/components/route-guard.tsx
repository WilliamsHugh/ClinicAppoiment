"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { canAccessRoute, routeForPath } from "../lib/navigation/routes";
import { useSession } from "../lib/session/session-context";
import { LoadingState } from "./states";

export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const route = routeForPath(pathname);

  if (!route?.roles) return children;
  if (session.status === "loading") return <LoadingState message="Đang kiểm tra quyền truy cập..." />;
  if (canAccessRoute(route, session)) return children;

  return (
    <section className="state-card state-error" role="alert">
      <h2>Truy cập bị từ chối</h2>
      <p>Bạn không có quyền truy cập trang này.</p>
      {session.status === "unauthenticated"
        ? <Link href="/auth">Đăng nhập</Link>
        : <Link href="/">Về tổng quan</Link>}
    </section>
  );
}
