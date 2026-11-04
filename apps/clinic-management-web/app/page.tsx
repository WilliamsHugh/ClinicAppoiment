"use client";

import React, { useState } from "react";
import { useSession } from "../src/lib/session/session-context";
import { PermissionDeniedState } from "../src/components/states";
import { SkeletonPage } from "../src/components/ui/skeleton";
import { DoctorDashboard } from "../src/features/dashboard/doctor-dashboard";
import { StaffDashboard } from "../src/features/dashboard/staff-dashboard";
import { AdminDashboard } from "../src/features/dashboard/admin-dashboard";
import { ClinicLandingPage } from "../src/features/landing/clinic-landing-page";
import styles from "./dashboard.module.css";

export default function ClinicHomePage() {
  const session = useSession();
  const [viewMode, setViewMode] = useState<"dashboard" | "landing">("dashboard");

  // While session storage is being restored, render a compact session placeholder
  // to avoid flashing the public landing page before redirecting to the role dashboard (Contract §2 & §3.1).
  if (session.status === "loading") {
    return (
      <div className={styles.container} aria-busy="true" aria-label="Đang khôi phục phiên làm việc">
        <SkeletonPage title={true} tableRows={4} tableCols={4} />
      </div>
    );
  }

  // Once confirmed unauthenticated or visitor, render the full static Clinic Landing Page
  if (session.status !== "authenticated" || !session.identity) {
    return <ClinicLandingPage />;
  }

  const role = session.identity.role;

  // Workforce role (DOCTOR, STAFF, ADMIN) toggled to view the public landing page
  if (viewMode === "landing") {
    return (
      <ClinicLandingPage
        onSwitchToDashboard={() => setViewMode("dashboard")}
      />
    );
  }

  // Workforce roles are directed to their fully-functional dashboards
  switch (role) {
    case "DOCTOR":
      return <DoctorDashboard />;
    case "ADMIN":
      return <AdminDashboard />;
    case "STAFF":
      return <StaffDashboard />;
    default:
      return (
        <div className={styles.container}>
          <PermissionDeniedState
            title="Quyền truy cập bị từ chối"
            message="Tài khoản này không có quyền sử dụng Clinic Management Web. Bệnh nhân vui lòng sử dụng ứng dụng di động Health&Human Patient App."
            action={{
              label: "Đăng xuất",
              onClick: () => {
                void session.signOut();
              },
            }}
          />
        </div>
      );
  }
}
