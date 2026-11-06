"use client";

import { useSession } from "../../lib/session/session-context";
import { PermissionDeniedState } from "../../components/states";
import { AdminDashboard } from "./admin-dashboard";
import { DoctorDashboard } from "./doctor-dashboard";
import { StaffDashboard } from "./staff-dashboard";

export function DashboardPage() {
  const session = useSession();
  const role = session.identity?.role;

  if (session.status !== "authenticated" || !session.identity) {
    return <PermissionDeniedState title="Cần đăng nhập" message="Đăng nhập bằng tài khoản phòng khám để mở bảng điều khiển." action={{ label: "Về trang chủ", href: "/" }} />;
  }

  switch (role) {
    case "DOCTOR":
      return <DoctorDashboard />;
    case "STAFF":
      return <StaffDashboard />;
    case "ADMIN":
      return <AdminDashboard />;
    default:
      return (
        <PermissionDeniedState
          title="Quyền truy cập bị từ chối"
          message="Clinic Management Web chỉ dành cho bác sĩ, nhân viên phòng khám và quản trị viên. Bệnh nhân vui lòng sử dụng Health&Human Patient App."
          action={{ label: "Về trang chủ", href: "/" }}
        />
      );
  }
}
