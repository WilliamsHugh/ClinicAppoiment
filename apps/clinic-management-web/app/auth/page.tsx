"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "../../src/lib/session/session-context";
import { Alert, Button, ConfirmModal, Input } from "../../src/components/ui";
import styles from "./auth.module.css";

export default function AuthPage() {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);

  // Authenticated Screen
  if (session.status === "authenticated" && session.identity) {
    const dashboardRoute = "/dashboard";

    return (
      <div className={styles.container}>
        <div className={styles.authenticatedCard}>
          <div className={styles.brandHeader}>
            <span className={styles.brandLogo}>
              <Image
                src="/images/logo.png"
                alt="Health&Human Logo"
                width={34}
                height={34}
                style={{ objectFit: "contain" }}
              />
            </span>
            <span className={styles.brandName}>Health&amp;Human</span>
          </div>

          <div className={styles.authenticatedHeader}>
            <h1 className={styles.title}>Đã đăng nhập</h1>
            <p className={styles.subtitle}>
              Bạn đang đăng nhập với tài khoản{" "}
              <strong>{session.identity.displayName || "Người dùng"}</strong> (
              {session.identity.role}).
            </p>
          </div>

          <div className={styles.authenticatedActions}>
            <Button
              variant="primary"
              type="button"
              onClick={() => router.push(dashboardRoute)}
            >
              Vào bảng điều khiển
            </Button>
            <Button
              variant="danger"
              type="button"
              onClick={() => setConfirmSignOutOpen(true)}
            >
              Đăng xuất
            </Button>
          </div>
        </div>

        <ConfirmModal
          isOpen={confirmSignOutOpen}
          onCancel={() => setConfirmSignOutOpen(false)}
          onConfirm={() => {
            setConfirmSignOutOpen(false);
            session.signOut();
          }}
          title="Xác nhận đăng xuất"
          description="Bạn có chắc chắn muốn đăng xuất khỏi hệ thống quản lý phòng khám?"
          confirmLabel="Đăng xuất"
          cancelLabel="Quay lại"
          variant="danger"
        />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email || !password) {
      setErrorMessage("Vui lòng điền đầy đủ email và mật khẩu.");
      return;
    }

    setLoading(true);
    try {
      await session.signIn(email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Đăng nhập thất bại. Vui lòng thử lại.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {/* Brand Header */}
        <div className={styles.brandHeader}>
          <span className={styles.brandLogo}>
            <Image
              src="/images/logo.png"
              alt="Health&Human Logo"
              width={34}
              height={34}
              style={{ objectFit: "contain" }}
            />
          </span>
          <span className={styles.brandName}>Health&amp;Human</span>
        </div>

        {/* Title Area */}
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Đăng nhập quản lý</h1>
          <p className={styles.subtitle}>Dành cho Bác sĩ, Nhân viên và Quản trị viên</p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <Alert variant="danger" title="Lỗi đăng nhập" onClose={() => setErrorMessage(null)}>
            {errorMessage}
          </Alert>
        )}

        {/* Login Form */}
        <form
          onSubmit={handleSubmit}
          className={styles.form}
          aria-label="Đăng nhập quản lý"
        >
          <div className={styles.formFields}>
            <Input
              id="auth-email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nhanvien@phongkham.vn"
              required
              disabled={loading}
              autoComplete="email"
            />

            <Input
              id="auth-password"
              label="Mật khẩu"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            fullWidth
            className={styles.submitButton}
          >
            Đăng nhập
          </Button>
        </form>
      </div>
    </div>
  );
}
