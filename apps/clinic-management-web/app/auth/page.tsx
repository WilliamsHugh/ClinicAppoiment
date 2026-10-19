"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../src/lib/session/session-context";

const REMEMBERED_EMAIL_KEY = "clinic_remembered_email";

export default function AuthPage() {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    } catch {
      // Ignore storage access errors in restricted environments
    }
  }, []);

  if (session.status === "authenticated" && session.identity) {
    return (
      <div
        style={{
          maxWidth: "480px",
          margin: "40px auto",
          padding: "24px",
          background: "#fff",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
        }}
      >
        <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "8px" }}>Đã đăng nhập</h2>
        <p style={{ color: "#64748b", marginBottom: "16px" }}>
          Bạn đang đăng nhập với tài khoản <strong>{session.identity.displayName}</strong> ({session.identity.role}).
        </p>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            type="button"
            onClick={() => router.push(session.identity?.role === "ADMIN" ? "/users" : "/appointments")}
            style={{
              padding: "8px 16px",
              background: "#0284c7",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Vào bảng điều khiển
          </button>
          <button
            type="button"
            onClick={() => session.signOut()}
            style={{
              padding: "8px 16px",
              background: "#fff",
              color: "#dc2626",
              border: "1px solid #dc2626",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage("Vui lòng điền đầy đủ email và mật khẩu.");
      return;
    }

    try {
      if (rememberMe) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, trimmedEmail);
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch {
      // Ignore storage write errors
    }

    setLoading(true);
    try {
      await session.signIn(trimmedEmail, password);
      router.push("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Đăng nhập thất bại. Vui lòng thử lại.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .clinic-auth-split {
          display: flex;
          min-height: 540px;
          max-width: 960px;
          margin: 32px auto;
          background: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);
        }
        .clinic-auth-brand {
          flex: 1 1 50%;
          width: 50%;
          padding: 40px 36px;
          background: linear-gradient(135deg, #0284c7 0%, #0d9488 100%);
          color: #ffffff;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .clinic-auth-form-panel {
          flex: 1 1 50%;
          width: 50%;
          padding: 40px 36px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          background: #ffffff;
        }
        @media (max-width: 767px) {
          .clinic-auth-split {
            margin: 16px;
            min-height: auto;
          }
          .clinic-auth-brand {
            display: none !important;
          }
          .clinic-auth-form-panel {
            flex: 1 1 100%;
            width: 100%;
            padding: 28px 20px;
          }
        }
      `}</style>

      <div className="clinic-auth-split">
        {/* Left brand panel (50% on >=768px, hidden on <768px) */}
        <aside className="clinic-auth-brand hidden md:flex" aria-label="Giới thiệu phòng khám">
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 14px",
                borderRadius: "9999px",
                background: "rgba(255, 255, 255, 0.16)",
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              <span aria-hidden="true">🏥</span>
              <span>Health &amp; Human Clinic</span>
            </div>

            <h2
              style={{
                marginTop: "32px",
                marginBottom: "12px",
                fontSize: "30px",
                fontWeight: 800,
                lineHeight: 1.2,
              }}
            >
              Health &amp; Human
              <br />
              Chào mừng trở lại
            </h2>

            <p style={{ fontSize: "15px", lineHeight: 1.6, color: "rgba(255, 255, 255, 0.9)", margin: 0 }}>
              Hệ thống điều phối lịch khám, hàng đợi tiếp đón và hồ sơ bệnh án điện tử dành cho đội ngũ y tế.
            </p>
          </div>

          <div
            style={{
              marginTop: "32px",
              padding: "18px",
              borderRadius: "12px",
              background: "rgba(255, 255, 255, 0.12)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>Cổng thông tin nội bộ</div>
            <div style={{ color: "rgba(255, 255, 255, 0.88)" }}>
              • Tiếp đón &amp; điều phối hàng đợi thời gian thực
              <br />
              • Quản lý lịch làm việc bác sĩ &amp; chuyên khoa
              <br />• Bảo mật dữ liệu bệnh nhân theo phân quyền
            </div>
          </div>
        </aside>

        {/* Right login form panel */}
        <div className="clinic-auth-form-panel">
          <div style={{ marginBottom: "24px" }}>
            <p
              style={{
                margin: "0 0 6px 0",
                fontSize: "13px",
                fontWeight: 700,
                color: "#0d9488",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Health&amp;Human
            </p>
            <h1 style={{ fontSize: "24px", fontWeight: "700", color: "#0f172a", margin: "0 0 6px 0" }}>
              Đăng nhập quản lý
            </h1>
            <p style={{ fontSize: "14px", color: "#64748b", margin: 0 }}>
              Dành cho Bác sĩ, Nhân viên và Quản trị viên
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              style={{
                padding: "12px 14px",
                marginBottom: "18px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "6px",
                color: "#b91c1c",
                fontSize: "14px",
              }}
            >
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label
                htmlFor="auth-email"
                style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#334155", marginBottom: "6px" }}
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nhanvien@phongkham.vn"
                required
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#334155", marginBottom: "6px" }}
              >
                Mật khẩu
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "10px 42px 10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  disabled={loading}
                  onClick={() => setShowPassword((prev) => !prev)}
                  style={{
                    position: "absolute",
                    right: "8px",
                    background: "transparent",
                    border: "none",
                    padding: "4px 6px",
                    cursor: loading ? "not-allowed" : "pointer",
                    color: "#64748b",
                    fontSize: "16px",
                    lineHeight: 1,
                  }}
                >
                  <span aria-hidden="true">{showPassword ? "🙈" : "👁"}</span>
                </button>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "14px",
                  color: "#334155",
                  cursor: loading ? "not-allowed" : "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  disabled={loading}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRememberMe(checked);
                    try {
                      if (!checked) {
                        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
                      } else if (email.trim()) {
                        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
                      }
                    } catch {
                      // Ignore storage errors
                    }
                  }}
                  style={{ width: "16px", height: "16px", accentColor: "#0284c7" }}
                />
                <span>Ghi nhớ tài khoản</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "6px",
                padding: "11px 16px",
                background: loading ? "#94a3b8" : "linear-gradient(135deg, #0284c7 0%, #0d9488 100%)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "15px",
                fontWeight: "600",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "opacity 0.2s",
              }}
            >
              {loading ? "Đang xử lý..." : "Đăng nhập"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
