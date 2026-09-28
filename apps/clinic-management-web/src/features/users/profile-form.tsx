"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import { ErrorState, LoadingState } from "../../components/states";

export interface OwnProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: "DOCTOR" | "STAFF" | "ADMIN";
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
}

export function ProfileForm() {
  const session = useSession();
  const client = useMemo(() => createBrowserApiClient(session), [session]);
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== "authenticated") return;
    let cancelled = false;
    setLoading(true);
    client.get<OwnProfile>("/api/v1/users/me")
      .then((result) => {
        if (cancelled) return;
        setProfile(result.data);
        setFullName(result.data.fullName);
        setPhone(result.data.phone ?? "");
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Không thể tải hồ sơ cá nhân.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [client, session.status]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const result = await client.patch<OwnProfile>("/api/v1/users/me", {
        body: { fullName: fullName.trim(), phone: phone.trim() || null },
      });
      setProfile(result.data);
      setFullName(result.data.fullName);
      setPhone(result.data.phone ?? "");
      setNotice("Đã cập nhật hồ sơ cá nhân.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cập nhật hồ sơ cá nhân.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState message="Đang tải hồ sơ cá nhân..." />;
  if (!profile) return <ErrorState message={error ?? "Không tìm thấy hồ sơ cá nhân."} />;

  return (
    <section style={{ maxWidth: 680, margin: "0 auto" }}>
      <p className="eyebrow">User Service</p>
      <h1>Hồ sơ cá nhân</h1>
      <p style={{ color: "#64748b" }}>Xem và cập nhật thông tin liên hệ của tài khoản đang đăng nhập.</p>

      {error ? <div className="state-card state-error" role="alert">{error}</div> : null}
      {notice ? <div className="state-card" role="status">{notice}</div> : null}

      <form onSubmit={save} style={{ display: "grid", gap: 16, marginTop: 24 }}>
        <label>
          Email
          <input value={profile.email} disabled style={{ width: "100%", marginTop: 6, padding: 10 }} />
        </label>
        <label>
          Họ và tên
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            minLength={2}
            maxLength={120}
            required
            disabled={saving}
            style={{ width: "100%", marginTop: 6, padding: 10 }}
          />
        </label>
        <label>
          Số điện thoại
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            maxLength={20}
            disabled={saving}
            style={{ width: "100%", marginTop: 6, padding: 10 }}
          />
        </label>
        <div style={{ display: "flex", gap: 16 }}>
          <span>Vai trò: <strong>{profile.role}</strong></span>
          <span>Trạng thái: <strong>{profile.status}</strong></span>
        </div>
        <button type="submit" disabled={saving || fullName.trim().length < 2} style={{ width: "fit-content", padding: "10px 18px" }}>
          {saving ? "Đang lưu..." : "Lưu thay đổi"}
        </button>
      </form>
    </section>
  );
}
