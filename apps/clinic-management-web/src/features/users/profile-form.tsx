"use client";

import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import { createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import { LoadingState, ErrorState } from "../../components/states";
import { Button, Badge, Alert } from "../../components/ui";
import styles from "./profile.module.css";

export interface OwnProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: "DOCTOR" | "STAFF" | "ADMIN";
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
}

function getInitials(name?: string, role?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length >= 2) {
      return parts[0].substring(0, 2).toUpperCase();
    }
  }
  if (role === "DOCTOR") return "BS";
  if (role === "STAFF") return "NV";
  if (role === "ADMIN") return "AD";
  return "HH";
}

function getRoleLabel(role?: string): string {
  if (role === "DOCTOR") return "Bác sĩ";
  if (role === "STAFF") return "Trợ lý phòng khám";
  if (role === "ADMIN") return "Quản trị viên";
  return "Người dùng";
}

type TabKey = "personal" | "security" | "notifications" | "sessions";

export function ProfileForm() {
  const session = useSession();
  const client = useMemo(() => createBrowserApiClient(session), [session]);

  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("14/03/1984");
  const [gender, setGender] = useState("Nam");
  const [language, setLanguage] = useState("Tiếng Việt");

  const [activeTab, setActiveTab] = useState<TabKey>("personal");
  const [notifications, setNotifications] = useState({
    assigned: true,
    cancelled: true,
    checkedIn: true,
    dailySummary: false,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== "authenticated") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    client
      .get<OwnProfile>("/api/v1/users/me")
      .then((result) => {
        if (cancelled) return;
        setProfile(result.data);
        setFullName(result.data.fullName || "");
        setPhone(result.data.phone ?? "");
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Không thể tải hồ sơ cá nhân.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, session.status]);

  async function handleSave(event: FormEvent) {
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
      setNotice("Đã cập nhật hồ sơ cá nhân thành công.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cập nhật hồ sơ cá nhân.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (profile) {
      setFullName(profile.fullName || "");
      setPhone(profile.phone ?? "");
      setError(null);
      setNotice(null);
    }
  }

  if (loading) {
    return <LoadingState message="Đang tải hồ sơ cá nhân..." />;
  }

  if (!profile) {
    if (session.status === "unauthenticated") {
      return (
        <ErrorState
          message="Bạn chưa đăng nhập. Vui lòng đăng nhập để xem và quản lý hồ sơ của bạn."
        />
      );
    }
    return <ErrorState message={error ?? "Không tìm thấy hồ sơ cá nhân."} />;
  }

  const role = profile.role;
  const initials = getInitials(profile.fullName, role);
  const roleLabel = getRoleLabel(role);

  return (
    <div className={styles.container}>
      {/* Page Title */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Hồ sơ cá nhân</h1>
        <p className={styles.pageSubtitle}>
          Quản lý thông tin tài khoản, bảo mật và cài đặt làm việc trong phòng khám.
        </p>
      </div>

      {notice && (
        <Alert type="success" title="Thành công" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {error && (
        <Alert type="danger" title="Lỗi" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Main Layout: Subnav + Stack */}
      <div className={styles.layout}>
        {/* Left Sub-Navigation */}
        <nav className={styles.subnav} aria-label="Cài đặt hồ sơ">
          <button
            type="button"
            className={`${styles.subnavItem} ${activeTab === "personal" ? styles.subnavItemActive : ""}`}
            onClick={() => setActiveTab("personal")}
          >
            <span>👤</span>
            <span>Thông tin cá nhân</span>
          </button>
          <button
            type="button"
            className={`${styles.subnavItem} ${activeTab === "security" ? styles.subnavItemActive : ""}`}
            onClick={() => setActiveTab("security")}
          >
            <span>🔒</span>
            <span>Bảo mật</span>
          </button>
          <button
            type="button"
            className={`${styles.subnavItem} ${activeTab === "notifications" ? styles.subnavItemActive : ""}`}
            onClick={() => setActiveTab("notifications")}
          >
            <span>🔔</span>
            <span>Thông báo</span>
          </button>
          <button
            type="button"
            className={`${styles.subnavItem} ${activeTab === "sessions" ? styles.subnavItemActive : ""}`}
            onClick={() => setActiveTab("sessions")}
          >
            <span>💻</span>
            <span>Phiên đăng nhập</span>
          </button>
        </nav>

        {/* Right Stack */}
        <div className={styles.mainColumn}>
          {/* 1. User Header Card */}
          <div className={styles.userHeaderCard}>
            <div className={styles.avatarCircle} aria-hidden="true">
              {initials}
            </div>
            <div className={styles.userHeaderInfo}>
              <h2 className={styles.userName}>{profile.fullName || "Chưa đặt tên"}</h2>
              <p className={styles.userMeta}>
                {roleLabel} · Mã: {profile.id.slice(0, 8).toUpperCase()} · {profile.email}
              </p>
              <div className={styles.badgeGroup}>
                <Badge variant="info" size="sm">
                  {roleLabel}
                </Badge>
                <Badge variant="success" size="sm">
                  {profile.status === "ACTIVE" ? "Đang hoạt động" : profile.status}
                </Badge>
              </div>
            </div>
            <Button variant="secondary" size="sm" type="button">
              Đổi ảnh đại diện
            </Button>
          </div>

          {/* 2. Personal Information Card */}
          {(activeTab === "personal" || activeTab === "security" || activeTab === "notifications" || activeTab === "sessions") && (
            <div className={styles.card} id="section-personal">
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>Thông tin cá nhân</h2>
                  <p className={styles.cardSubtitle}>
                    Thông tin này hiển thị với đồng nghiệp trong phòng khám.
                  </p>
                </div>
              </div>

              <div className={styles.divider} />

              <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className={styles.formGrid}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="profile-fullname">
                      Họ và tên
                    </label>
                    <input
                      id="profile-fullname"
                      className={styles.fieldInput}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      minLength={2}
                      maxLength={120}
                      required
                      disabled={saving}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="profile-email">
                      Email
                    </label>
                    <div className={`${styles.fieldInput} ${styles.fieldInputReadOnly}`}>
                      <input
                        id="profile-email"
                        value={profile.email}
                        disabled
                        style={{ border: "none", background: "transparent", width: "100%", outline: "none", color: "inherit" }}
                      />
                      <span aria-hidden="true">🔒</span>
                    </div>
                    <p className={styles.fieldDescription}>Do quản trị viên quản lý, không thể tự đổi.</p>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="profile-phone">
                      Số điện thoại
                    </label>
                    <input
                      id="profile-phone"
                      className={styles.fieldInput}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      inputMode="tel"
                      maxLength={20}
                      disabled={saving}
                      placeholder="0901 234 567"
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="profile-dob">
                      Ngày sinh
                    </label>
                    <select
                      id="profile-dob"
                      className={styles.fieldInput}
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                    >
                      <option value="14/03/1984">14/03/1984</option>
                      <option value="20/05/1990">20/05/1990</option>
                      <option value="10/11/1995">10/11/1995</option>
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="profile-gender">
                      Giới tính
                    </label>
                    <select
                      id="profile-gender"
                      className={styles.fieldInput}
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                    >
                      <option value="Nam">Nam</option>
                      <option value="Nữ">Nữ</option>
                      <option value="Khác">Khác</option>
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="profile-lang">
                      Ngôn ngữ giao diện
                    </label>
                    <select
                      id="profile-lang"
                      className={styles.fieldInput}
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="Tiếng Việt">Tiếng Việt</option>
                      <option value="English">English</option>
                    </select>
                  </div>
                </div>

                <div className={styles.divider} />

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <Button variant="secondary" type="button" onClick={handleReset} disabled={saving}>
                    Hủy
                  </Button>
                  <Button variant="primary" type="submit" loading={saving} disabled={fullName.trim().length < 2}>
                    Lưu thay đổi
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* 3. Professional Information Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Thông tin nghề nghiệp</h2>
              <Badge variant="neutral" size="sm">
                Chỉ xem
              </Badge>
            </div>
            <div className={styles.divider} />

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Vai trò:</span>
                <span className={styles.kvValue}>{roleLabel}</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Mã định danh:</span>
                <span className={styles.kvValue}>{profile.id}</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Cơ sở làm việc:</span>
                <span className={styles.kvValue}>Phòng khám Health&amp;Human</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Trạng thái tài khoản:</span>
                <span className={styles.kvValue}>{profile.status === "ACTIVE" ? "Đang hoạt động" : profile.status}</span>
              </div>
            </div>

            <div className={styles.divider} />
            <p className={styles.cardSubtitle}>
              Liên hệ quản trị viên để thay đổi vai trò hoặc thông tin phân công cơ sở.
            </p>
          </div>

          {/* 4. Security Card */}
          <div className={styles.card} id="section-security">
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Bảo mật</h2>
            </div>
            <div className={styles.divider} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: "0.875rem", margin: 0, color: "var(--ink)" }}>Mật khẩu</p>
                <p className={styles.cardSubtitle}>
                  Nên dùng mật khẩu an toàn, tối thiểu 12 ký tự gồm chữ hoa, số và ký tự đặc biệt.
                </p>
              </div>
              <Button variant="secondary" size="sm" type="button">
                Đổi mật khẩu
              </Button>
            </div>
          </div>

          {/* 5. Notification Card */}
          <div className={styles.card} id="section-notifications">
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Cài đặt thông báo</h2>
            </div>
            <div className={styles.divider} />

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className={styles.switchRow}>
                <div className={styles.switchInfo}>
                  <p className={styles.switchTitle}>Lịch hẹn mới được giao cho tôi</p>
                  <p className={styles.switchDesc}>Nhận thông báo khi trợ lý xác nhận lịch hẹn mới</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.assigned}
                  className={`${styles.switchButton} ${notifications.assigned ? styles.switchButtonOn : ""}`}
                  onClick={() => setNotifications((n) => ({ ...n, assigned: !n.assigned }))}
                >
                  <span className={styles.switchThumb} />
                </button>
              </div>

              <div className={styles.divider} />

              <div className={styles.switchRow}>
                <div className={styles.switchInfo}>
                  <p className={styles.switchTitle}>Lịch hẹn bị hủy hoặc đổi giờ</p>
                  <p className={styles.switchDesc}>Luôn bật để kịp thời cập nhật thay đổi trong ngày</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.cancelled}
                  className={`${styles.switchButton} ${notifications.cancelled ? styles.switchButtonOn : ""}`}
                  onClick={() => setNotifications((n) => ({ ...n, cancelled: !n.cancelled }))}
                >
                  <span className={styles.switchThumb} />
                </button>
              </div>

              <div className={styles.divider} />

              <div className={styles.switchRow}>
                <div className={styles.switchInfo}>
                  <p className={styles.switchTitle}>Bệnh nhân đã check-in</p>
                  <p className={styles.switchDesc}>Báo khi bệnh nhân đã có mặt tại phòng chờ</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.checkedIn}
                  className={`${styles.switchButton} ${notifications.checkedIn ? styles.switchButtonOn : ""}`}
                  onClick={() => setNotifications((n) => ({ ...n, checkedIn: !n.checkedIn }))}
                >
                  <span className={styles.switchThumb} />
                </button>
              </div>

              <div className={styles.divider} />

              <div className={styles.switchRow}>
                <div className={styles.switchInfo}>
                  <p className={styles.switchTitle}>Email tóm tắt hằng ngày</p>
                  <p className={styles.switchDesc}>Gửi lúc 07:00 sáng mỗi ngày làm việc (GMT+7)</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.dailySummary}
                  className={`${styles.switchButton} ${notifications.dailySummary ? styles.switchButtonOn : ""}`}
                  onClick={() => setNotifications((n) => ({ ...n, dailySummary: !n.dailySummary }))}
                >
                  <span className={styles.switchThumb} />
                </button>
              </div>
            </div>
          </div>

          {/* 6. Login Sessions Card */}
          <div className={styles.card} id="section-sessions">
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Phiên đăng nhập</h2>
            </div>
            <div className={styles.divider} />

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.875rem", margin: 0, color: "var(--ink)" }}>
                    Chrome · Windows 11
                  </p>
                  <p className={styles.cardSubtitle}>TP. Hồ Chí Minh · Đang hoạt động</p>
                </div>
                <Badge variant="success" size="sm">
                  Phiên hiện tại
                </Badge>
              </div>
            </div>

            <div className={styles.divider} />

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                variant="danger"
                size="sm"
                type="button"
                onClick={() => session.signOut()}
              >
                Đăng xuất khỏi thiết bị này
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
