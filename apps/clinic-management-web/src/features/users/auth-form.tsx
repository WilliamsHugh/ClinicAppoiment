"use client";

import React, { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useSession } from "../../lib/session/session-context";
import { sessionDisplayName } from "../../lib/session/session";
import { Alert, Button, ConfirmModal, Input } from "../../components/ui";
import styles from "./auth-form.module.css";

const REMEMBERED_EMAIL_KEY = "clinic_remembered_email";

export function AuthForm() {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (savedEmail) { setEmail(savedEmail); setRememberEmail(true); }
    } catch { /* Remembering email is optional. */ }
  }, []);

  useEffect(() => {
    if (!errorMessage) return;
    if (fieldErrors.email) emailRef.current?.focus();
    else if (fieldErrors.password) passwordRef.current?.focus();
    else errorRef.current?.focus();
  }, [errorMessage, fieldErrors]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading || session.status === "loading" || session.recovery) return;
    setErrorMessage(null);
    const errors = {
      email: !email.trim() ? "Nhập email của bạn." : emailRef.current?.validity.typeMismatch ? "Nhập email hợp lệ, ví dụ ten@phongkham.vn." : undefined,
      password: !password ? "Nhập mật khẩu của bạn." : undefined,
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      setErrorMessage(!email.trim() || !password ? "Vui lòng điền đầy đủ email và mật khẩu." : "Vui lòng kiểm tra lại email.");
      return;
    }
    setLoading(true);
    try {
      await session.signIn(email.trim(), password);
      try {
        if (rememberEmail) localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
        else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      } catch { /* Login does not depend on browser storage. */ }
      router.push("/dashboard");
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Đăng nhập thất bại. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  const authenticated = session.status === "authenticated" && !!session.identity;
  const disabled = loading || session.status === "loading";

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.brandHeader}>
          <span className={styles.brandLogo}>
            <Image src="/images/logo.png" alt="" width={34} height={34} />
          </span>
          <span className={styles.brandName}>Health&amp;Human</span>
        </div>
        {session.recovery ? (
          <>
            <h1 className={styles.title}>Khôi phục phiên đăng nhập</h1>
            <Alert variant="warning">{session.recovery.message}</Alert>
            <div className={styles.actions}>
              <Button type="button" loading={session.recovery.pending} onClick={() => void session.recovery?.retry()}>Thử kết nối lại</Button>
              <Button type="button" variant="outline" onClick={() => setConfirmSignOut(true)}>Đăng xuất tất cả thiết bị</Button>
            </div>
          </>
        ) : authenticated ? (
          <>
            <div className={styles.titleArea}>
              <h1 className={styles.title}>Đã đăng nhập</h1>
              <p className={styles.subtitle}>Bạn đang đăng nhập với tài khoản <strong>{sessionDisplayName(session.identity) || "Tài khoản"}</strong>.</p>
            </div>
            <div className={styles.actions}>
              <Button type="button" onClick={() => router.push("/dashboard")}>Vào bảng điều khiển</Button>
              <Button type="button" variant="outline" onClick={() => setConfirmSignOut(true)}>Đăng xuất tất cả thiết bị</Button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.titleArea}>
              <h1 className={styles.title}>Đăng nhập quản lý</h1>
              <p className={styles.subtitle}>Dành cho Bác sĩ, Nhân viên và Quản trị viên</p>
            </div>
            {errorMessage && (
              <div tabIndex={-1} ref={errorRef} className={styles.errorSummary}>
                <Alert variant="danger" title="Lỗi đăng nhập">{errorMessage}</Alert>
              </div>
            )}
            <form onSubmit={handleSubmit} noValidate aria-label="Đăng nhập quản lý" className={styles.form}>
              <Input ref={emailRef} id="auth-email" label="Email" type="email" value={email}
                onChange={(event) => setEmail(event.target.value)} required disabled={disabled}
                error={fieldErrors.email} autoComplete="username" />
              <div className={styles.passwordField}>
                <Input ref={passwordRef} id="auth-password" label="Mật khẩu" type={showPassword ? "text" : "password"}
                  value={password} onChange={(event) => setPassword(event.target.value)} required disabled={disabled}
                  error={fieldErrors.password} autoComplete="current-password" />
                <Button type="button" variant="ghost" className={styles.passwordToggle}
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword} disabled={disabled}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </Button>
              </div>
              <label htmlFor="auth-remember-me" className={styles.rememberLabel}>
                <input type="checkbox" id="auth-remember-me" checked={rememberEmail}
                  onChange={(event) => setRememberEmail(event.target.checked)} disabled={disabled} />
                <span>Ghi nhớ email</span>
              </label>
              {session.status === "loading" && !loading && <p className={styles.subtitle} role="status">Đang kiểm tra phiên đăng nhập…</p>}
              <Button type="submit" loading={loading} disabled={disabled} fullWidth>Đăng nhập</Button>
            </form>
          </>
        )}
      </div>
      <ConfirmModal isOpen={confirmSignOut} onCancel={() => setConfirmSignOut(false)}
        onConfirm={async () => {
          setSigningOut(true);
          try { await session.signOut(); } finally { setSigningOut(false); setConfirmSignOut(false); }
        }}
        title="Xác nhận đăng xuất" description="Đăng xuất tài khoản trên tất cả thiết bị? Những thay đổi chưa lưu sẽ bị mất."
        confirmLabel="Đăng xuất tất cả thiết bị" cancelLabel="Quay lại" variant="danger" loading={signingOut} />
    </div>
  );
}
