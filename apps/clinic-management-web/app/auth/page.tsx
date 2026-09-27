"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../src/lib/session/session-context";

export default function AuthPage() {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (session.status === "authenticated" && session.identity) {
    return (
      <div style={{ maxWidth: "480px", margin: "40px auto", padding: "24px", background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
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
    if (!email || !password) {
      setErrorMessage("Vui lòng điền đầy đủ email và mật khẩu.");
      return;
    }

    setLoading(true);
    try {
      await session.signIn(email, password);
      router.push("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Đăng nhập thất bại. Vui lòng thử lại.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "440px", margin: "40px auto", padding: "32px", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <div style={{ marginBottom: "24px", textAlign: "center" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#0f172a", marginBottom: "6px" }}>Đăng nhập quản lý</h1>
        <p style={{ fontSize: "14px", color: "#64748b" }}>Dành cho Bác sĩ, Nhân viên và Quản trị viên</p>
      </div>

      {errorMessage && (
        <div style={{ padding: "12px 14px", marginBottom: "18px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", color: "#b91c1c", fontSize: "14px" }}>
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label htmlFor="auth-email" style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#334155", marginBottom: "6px" }}>
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
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <label htmlFor="auth-password" style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#334155", marginBottom: "6px" }}>
            Mật khẩu
          </label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: "8px",
            padding: "10px 16px",
            background: loading ? "#94a3b8" : "#0284c7",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontSize: "15px",
            fontWeight: "600",
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background 0.2s",
          }}
        >
          {loading ? "Đang xử lý..." : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}
