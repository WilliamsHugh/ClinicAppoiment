"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "../src/lib/session/session-context";
import { Button } from "../src/components/ui";
import { LoadingState, PermissionDeniedState } from "../src/components/states";
import { DoctorDashboard } from "../src/features/dashboard/doctor-dashboard";
import { StaffDashboard } from "../src/features/dashboard/staff-dashboard";
import { AdminDashboard } from "../src/features/dashboard/admin-dashboard";
import styles from "./dashboard.module.css";

export default function ClinicDashboardPage() {
  const session = useSession();

  if (session.status === "loading") {
    return (
      <div className={styles.container}>
        <LoadingState message="Đang tải phiên làm việc..." />
      </div>
    );
  }

  if (session.status === "unauthenticated") {
    return (
      <div className={styles.container}>
        <section className={styles.welcomeBanner} aria-labelledby="welcome-unauth-heading">
          <div className={styles.welcomeText}>
            <h1 id="welcome-unauth-heading">Health&amp;Human · Quản Lý Phòng Khám</h1>
            <p>Vui lòng đăng nhập để truy cập không gian làm việc chuyên nghiệp.</p>
          </div>
          <Link href="/auth">
            <Button variant="primary">Đăng nhập ngay</Button>
          </Link>
        </section>
      </div>
    );
  }

  const role = session.identity?.role;

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
