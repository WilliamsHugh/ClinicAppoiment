"use client";

import React, { useState, type FormEvent } from "react";
import { ShieldCheck, LogOut } from "lucide-react";
import { Modal, Input, Button, Alert } from "./ui";
import { useSession } from "../lib/session/session-context";

export function LockoutModal() {
  const session = useSession();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isLocked = session.status === "locked";

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim();
    if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setError("Vui lòng nhập đúng 6 chữ số mã xác thực TOTP.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (session.unlockSession) {
        await session.unlockSession(cleanCode);
        setCode("");
      } else {
        throw new Error("Chức năng mở khóa không khả dụng.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mã xác thực không hợp lệ hoặc đã hết hạn.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await session.signOut();
  };

  if (!isLocked) return null;

  return (
    <Modal
      isOpen={isLocked}
      onClose={() => {}} // Cannot dismiss by clicking outside when locked
      title="Phiên làm việc đã bị khóa"
      maxWidth="440px"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "var(--brand-soft, #EEF2FF)",
              color: "var(--brand, #2D5BFF)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={24} />
          </div>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--muted)", lineHeight: 1.5 }}>
            Phiên của bạn đã bị khóa do không hoạt động trong 15 phút. Nhập mã TOTP 6 số từ ứng dụng Authenticator để tiếp tục.
          </p>
        </div>

        {error && (
          <Alert variant="danger">
            {error}
          </Alert>
        )}

        <form onSubmit={handleUnlock} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input
            id="totp-unlock-code"
            label="Mã xác thực TOTP (6 số)"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              if (error) setError(null);
            }}
            placeholder="000000"
            maxLength={6}
            autoFocus
            autoComplete="one-time-code"
            required
            disabled={loading}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={handleSignOut}
              disabled={loading}
            >
              <LogOut size={16} style={{ marginRight: 6 }} />
              Đăng xuất
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={loading}
              disabled={code.length !== 6 || loading}
            >
              Mở khóa phiên
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
