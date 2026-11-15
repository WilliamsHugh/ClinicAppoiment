"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "../../lib/session/session-context";
import { clinicRoleLabel, isClinicManagementRole, sessionDisplayName } from "../../lib/session/session";
import { Badge, Button, ConfirmModal } from "../../components/ui";
import styles from "./clinic-landing.module.css";

export function ClinicLandingPage() {
  const session = useSession();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const signedIn = session.status === "authenticated" && !!session.identity;
  const workforce = signedIn && isClinicManagementRole(session.identity!.role);

  return (
    <div className={styles.page}>
      <a href="#noi-dung" className={styles.skipLink}>Đến nội dung chính</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <Image src="/images/logo.png" alt="" width={32} height={32} />
            Health&amp;Human
          </Link>
          <nav aria-label="Điều hướng trang chủ" className={styles.navigation}>
            <a href="#benh-nhan">Dành cho bệnh nhân</a>
            <a href="#phong-kham">Dành cho phòng khám</a>
            <a href="#ho-tro">Hỗ trợ</a>
          </nav>
          <div className={styles.account}>
            {signedIn ? <>
              <span className={styles.accountName}>{sessionDisplayName(session.identity) || "Tài khoản"}</span>
              <Badge variant="info" size="sm">{clinicRoleLabel(session.identity!.role)}</Badge>
              {workforce && <Link href="/dashboard" className={styles.primaryLink}>Vào tổng quan</Link>}
              <Button variant="ghost" onClick={() => setConfirmSignOut(true)}>Đăng xuất</Button>
            </> : session.status === "loading" ? <span role="status">Đang khôi phục phiên…</span> :
              <Link href="/auth" className={styles.primaryLink}>Đăng nhập nội bộ</Link>}
          </div>
        </div>
      </header>

      <main id="noi-dung" className={styles.main}>
        <section className={styles.hero} aria-labelledby="home-title">
          <div>
            <h1 id="home-title">Theo dõi lịch khám.<br />Tiếp nối việc chăm sóc.</h1>
            <p>Health&amp;Human kết nối việc đặt lịch của bệnh nhân với công việc tiếp đón và khám bệnh tại phòng khám.</p>
            <a href="#benh-nhan" className={styles.primaryLink}>Tìm hiểu cách đặt khám</a>
          </div>
          <Image src="/images/doctor-figure.png" alt="Minh họa nhân viên y tế" width={500} height={358} priority className={styles.illustration} />
        </section>

        <section id="benh-nhan" className={styles.section} aria-labelledby="patient-title">
          <div className={styles.sectionHeading}>
            <h2 id="patient-title">Dành cho bệnh nhân</h2>
            <p>Đặt lịch và theo dõi kết quả trên ứng dụng Health&amp;Human dành cho bệnh nhân.</p>
          </div>
          <ol className={styles.steps}>
            <li><h3>Chọn lịch khám</h3><p>Chọn bác sĩ, ngày khám và khung giờ còn trống trên ứng dụng.</p></li>
            <li><h3>Theo dõi lịch hẹn</h3><p>Xem trạng thái xác nhận và thông báo liên quan đến lịch khám của bạn.</p></li>
            <li><h3>Xem lại kết quả</h3><p>Tra cứu bệnh án và đơn thuốc của mình sau khi bác sĩ chốt hồ sơ.</p></li>
          </ol>
        </section>

        <section id="phong-kham" className={styles.workSection} aria-labelledby="clinic-title">
          <div className={styles.sectionHeading}>
            <h2 id="clinic-title">Công việc tại phòng khám</h2>
            <p>Tiếp đón, lịch làm việc và hồ sơ khám được tổ chức theo nhiệm vụ của từng tài khoản.</p>
          </div>
          <dl className={styles.workList}>
            <div><dt>Tiếp đón</dt><dd>Theo dõi lịch trong ngày, xác nhận lịch hẹn và check-in bệnh nhân.</dd></div>
            <div><dt>Khám bệnh</dt><dd>Xem ca được phân công, ghi nhận kết quả khám và kê đơn trong hồ sơ.</dd></div>
            <div><dt>Quản lý</dt><dd>Quản lý tài khoản, bác sĩ, chuyên khoa và lịch làm việc theo quyền được cấp.</dd></div>
          </dl>
          <Link href={workforce ? "/dashboard" : "/auth"} className={styles.secondaryLink}>
            {workforce ? "Trở lại khu vực làm việc" : "Đăng nhập khu vực làm việc"}
          </Link>
        </section>

        <section id="ho-tro" className={styles.section} aria-labelledby="help-title">
          <h2 id="help-title">Hướng dẫn sử dụng</h2>
          <details><summary>Tôi đặt lịch khám ở đâu?</summary><p>Bệnh nhân đặt lịch trên ứng dụng Health&amp;Human. Khu vực đăng nhập của website dành cho nhân sự phòng khám.</p></details>
          <details><summary>Tôi đã đăng nhập, làm sao quay lại công việc?</summary><p>Chọn “Vào tổng quan” trên đầu trang. Bạn vẫn có thể trở lại trang giới thiệu bằng logo Health&amp;Human.</p></details>
          <details><summary>Tôi cần hỗ trợ về tài khoản?</summary><p>Nhân sự phòng khám liên hệ người quản trị tài khoản của cơ sở để được hỗ trợ.</p></details>
        </section>
      </main>
      <footer className={styles.footer}>Health&amp;Human · Lịch hẹn và hồ sơ khám</footer>
      <ConfirmModal isOpen={confirmSignOut} onClose={() => setConfirmSignOut(false)}
        onConfirm={() => { setConfirmSignOut(false); void session.signOut(); }}
        title="Đăng xuất tài khoản" description="Đăng xuất sẽ kết thúc các phiên đăng nhập của tài khoản trên mọi thiết bị."
        confirmLabel="Đăng xuất" variant="danger" />
    </div>
  );
}
