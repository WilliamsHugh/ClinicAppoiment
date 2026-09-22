import type { ClinicRole, Session } from "../session/session";

export interface AppRoute {
  href: string;
  label: string;
  roles?: readonly ClinicRole[];
}

export const appRoutes: readonly AppRoute[] = [
  { href: "/", label: "Tổng quan" },
  { href: "/appointments", label: "Lịch hẹn", roles: ["DOCTOR", "STAFF", "ADMIN"] },
  { href: "/doctors", label: "Bác sĩ & lịch làm việc", roles: ["DOCTOR", "STAFF", "ADMIN"] },
  { href: "/medical-records", label: "Hồ sơ khám", roles: ["DOCTOR", "ADMIN"] },
  { href: "/notifications", label: "Thông báo", roles: ["DOCTOR", "STAFF", "ADMIN"] },
  { href: "/users", label: "Tài khoản", roles: ["ADMIN"] },
  { href: "/health", label: "Sức khỏe hệ thống", roles: ["ADMIN"] }
];

export function canAccessRoute(route: AppRoute, session: Session): boolean {
  if (!route.roles) return true;
  return session.status === "authenticated" && session.identity !== null && route.roles.includes(session.identity.role);
}

export function visibleRoutes(session: Session): readonly AppRoute[] {
  return appRoutes.filter((route) => canAccessRoute(route, session));
}
