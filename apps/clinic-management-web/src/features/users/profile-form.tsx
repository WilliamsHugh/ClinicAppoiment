"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import { Button, Input, Alert, ConfirmModal, Skeleton, Badge } from "../../components/ui";
import { PageHeader } from "../../components/page-header";
import styles from "./profile.module.css";

export interface OwnProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: "DOCTOR" | "STAFF" | "ADMIN";
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
}

export interface SessionItem {
  sessionId: string;
  isCurrent?: boolean;
  role: string;
  state: "ACTIVE" | "PENDING_MFA" | "LOCKED" | "EXPIRED" | "REVOKED";
  startedAt: string;
  lastActiveAt: string;
  idleExpiresAt?: string | null;
  absoluteExpiresAt?: string | null;
  lockAt?: string | null;
  deviceInfo?: string | null;
  createdAt?: string;
}

function validateFullName(value: string): string | undefined {
  if (!value.trim()) return "Họ và tên không được để trống.";
  if (value.trim().length < 2) return "Họ và tên phải có ít nhất 2 ký tự.";
  if (value.trim().length > 120) return "Họ và tên không được vượt quá 120 ký tự.";
}

function validatePhone(value: string): string | undefined {
  if (value.trim() && !/^\+?[0-9][0-9 .-]{7,19}$/.test(value.trim())) {
    return "Số điện thoại không hợp lệ (8–20 ký tự, gồm số và mã vùng như +84).";
  }
}

function ProfileField({ id, label, loading, available, children }: {
  id: string; label: string; loading: boolean; available: boolean; children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={available ? id : undefined}>{label}</label>
      {loading && !available ? <Skeleton height={44} width="100%" /> : available ? children : (
        <p className={styles.description}>Chưa tải được thông tin.</p>
      )}
    </div>
  );
}

export function ProfileForm() {
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const client = useMemo(() => createBrowserApiClient({
    getAccessToken: () => sessionRef.current.getAccessToken(),
    handleUnauthorized: async () => { await sessionRef.current.handleUnauthorized?.(); },
  }), []);
  const request = useRef<AbortController | null>(null);
  const accountId = session.identity?.id;
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState({ fullName: false, phone: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [confirmRevokeSession, setConfirmRevokeSession] = useState<SessionItem | null>(null);
  const fullNameError = touched.fullName ? validateFullName(fullName) : undefined;
  const phoneError = touched.phone ? validatePhone(phone) : undefined;

  const loadProfile = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await client.get<OwnProfile>("/api/v1/users/me", { signal: controller.signal });
      if (controller.signal.aborted) return;
      setProfile(result.data);
      setFullName(result.data.fullName || "");
      setPhone(result.data.phone ?? "");
    } catch (cause) {
      if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Không thể tải hồ sơ cá nhân.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [client]);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    setSessionError(null);
    try {
      const result = await client.get<{ items: SessionItem[] }>("/api/v1/auth/sessions");
      const list = Array.isArray(result.data?.items) ? result.data.items : [];
      setSessions(list);
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : "Không thể tải danh sách phiên đăng nhập.");
    } finally {
      setLoadingSessions(false);
    }
  }, [client]);

  useEffect(() => {
    setProfile(null);
    setFullName("");
    setPhone("");
    setTouched({ fullName: false, phone: false });
    setSaveError(null);
    setNotice(null);
    setConfirmSave(false);
    setConfirmLogout(false);
    setConfirmRevokeSession(null);
    if (session.status === "authenticated" && accountId) {
      void loadProfile();
      void loadSessions();
    } else {
      setLoading(session.status === "loading");
    }
    return () => { request.current?.abort(); };
  }, [accountId, session.status, loadProfile, loadSessions]);

  async function executeRevokeSession() {
    if (!confirmRevokeSession) return;
    const target = confirmRevokeSession;
    setRevokingSessionId(target.sessionId);
    try {
      await client.delete(`/api/v1/auth/sessions/${target.sessionId}`);
      setSessions((prev) => prev.filter((s) => s.sessionId !== target.sessionId));
      setNotice("Đã thu hồi phiên đăng nhập thành công.");
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : "Không thể thu hồi phiên đăng nhập.");
    } finally {
      setRevokingSessionId(null);
      setConfirmRevokeSession(null);
    }
  }

  function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!profile || saving || session.recovery) return;
    setTouched({ fullName: true, phone: true });
    if (!validateFullName(fullName) && !validatePhone(phone)) setConfirmSave(true);
  }

  async function executeSave() {
    if (saving || sessionRef.current.recovery) return;
    setSaveError(null);
    setNotice(null);
    setSaving(true);
    const actor = accountId;
    try {
      const result = await client.patch<OwnProfile>("/api/v1/users/me", {
        body: { fullName: fullName.trim(), phone: phone.trim() || null },
      });
      if (sessionRef.current.identity?.id !== actor) return;
      setProfile(result.data);
      setFullName(result.data.fullName);
      setPhone(result.data.phone ?? "");
      setNotice("Đã cập nhật hồ sơ cá nhân thành công.");
    } catch (cause) {
      if (sessionRef.current.identity?.id === actor) {
        setSaveError(cause instanceof Error ? cause.message : "Không thể cập nhật hồ sơ cá nhân. Vui lòng thử lưu lại.");
      }
    } finally {
      setConfirmSave(false);
      setSaving(false);
    }
  }

  function handleReset() {
    if (!profile) return;
    setFullName(profile.fullName);
    setPhone(profile.phone ?? "");
    setTouched({ fullName: false, phone: false });
    setSaveError(null);
    setNotice(null);
  }

  return (
    <div className="page-stack">
      <PageHeader pathname="/profile" />
      <section className={styles.section} aria-labelledby="profile-info-title">
        <div className={styles.sectionHeading}>
          <h2 id="profile-info-title">Thông tin cá nhân</h2>
          <p className={styles.description}>Cập nhật tên và số điện thoại liên hệ của bạn.</p>
        </div>
        {loadError && (
          <Alert variant="danger" title="Không thể tải hồ sơ cá nhân">
            <p>{loadError}</p>
            <Button variant="outline" type="button" onClick={() => void loadProfile()}>Thử lại</Button>
          </Alert>
        )}
        {saveError && <Alert variant="danger" title="Chưa lưu được thay đổi">{saveError}</Alert>}
        {notice && <div role="status"><Alert variant="success">{notice}</Alert></div>}
        <form onSubmit={handleSave} aria-label="Cập nhật hồ sơ cá nhân" className={styles.form}>
          <div className={styles.formGrid} aria-busy={loading} aria-label={loading ? "Đang tải thông tin cá nhân" : "Thông tin liên hệ"}>
            <ProfileField id="profile-fullname" label="Họ và tên" loading={loading} available={!!profile}>
              <Input id="profile-fullname" value={fullName} error={fullNameError}
                onChange={(event) => setFullName(event.target.value)}
                onBlur={() => setTouched((value) => ({ ...value, fullName: true }))}
                minLength={2} maxLength={120} required disabled={saving} autoComplete="name" />
            </ProfileField>
            <ProfileField id="profile-email" label="Email" loading={loading} available={!!profile}>
              <Input id="profile-email" value={profile?.email ?? ""} type="email" readOnly
                hint="Email do quản trị viên quản lý, không thể tự đổi." />
            </ProfileField>
            <ProfileField id="profile-phone" label="Số điện thoại" loading={loading} available={!!profile}>
              <Input id="profile-phone" value={phone} type="tel" inputMode="tel" error={phoneError}
                onChange={(event) => setPhone(event.target.value)}
                onBlur={() => setTouched((value) => ({ ...value, phone: true }))}
                maxLength={20} disabled={saving} autoComplete="tel" hint="Có thể để trống nếu chưa cung cấp." />
            </ProfileField>
          </div>
          <div className={styles.actions}>
            <Button variant="secondary" type="button" onClick={handleReset} disabled={!profile || saving}>Hủy</Button>
            <Button variant="primary" type="submit" loading={saving} disabled={!profile || saving || !!session.recovery}>
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </section>
      <section className={styles.section} aria-labelledby="profile-security-title">
        <div className={styles.sectionHeading}>
          <h2 id="profile-security-title">Bảo mật và phiên đăng nhập</h2>
          <p className={styles.description}>
            Quản lý các phiên đăng nhập đang hoạt động của tài khoản trên các thiết bị.
          </p>
        </div>

        {sessionError && (
          <Alert variant="danger" title="Lỗi phiên đăng nhập">
            <p>{sessionError}</p>
            <Button variant="outline" size="sm" type="button" onClick={() => void loadSessions()}>Thử lại</Button>
          </Alert>
        )}

        <div className={styles.sessionList} role="region" aria-label="Danh sách phiên đăng nhập">
          {loadingSessions && sessions.length === 0 ? (
            <Skeleton height={60} width="100%" />
          ) : sessions.length === 0 ? (
            <p className={styles.description}>Không có phiên đăng nhập nào khác.</p>
          ) : (
            sessions.map((item) => {
              const isCurrent = item.isCurrent || (session.sessionId && item.sessionId === session.sessionId);
              const deviceLabel = item.deviceInfo || "Thiết bị không xác định";
              const lastActive = item.lastActiveAt ? new Date(item.lastActiveAt).toLocaleString("vi-VN") : "Chưa ghi nhận";

              return (
                <div key={item.sessionId} className={styles.sessionItem}>
                  <div className={styles.sessionInfo}>
                    <div className={styles.sessionHeader}>
                      <span className={styles.sessionTitle}>{deviceLabel}</span>
                      {isCurrent && <Badge variant="info" size="sm">Phiên hiện tại</Badge>}
                      {item.state === "ACTIVE" && <Badge variant="success" size="sm">Hoạt động</Badge>}
                      {item.state === "LOCKED" && <Badge variant="warning" size="sm">Tạm khóa</Badge>}
                      {item.state === "EXPIRED" && <Badge variant="neutral" size="sm">Hết hạn</Badge>}
                      {item.state === "REVOKED" && <Badge variant="danger" size="sm">Đã thu hồi</Badge>}
                    </div>
                    <p className={styles.sessionMeta}>
                      <span>Hoạt động gần nhất: {lastActive}</span>
                    </p>
                  </div>
                  {!isCurrent && item.state !== "REVOKED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      disabled={revokingSessionId === item.sessionId}
                      loading={revokingSessionId === item.sessionId}
                      onClick={() => setConfirmRevokeSession(item)}
                    >
                      Thu hồi
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className={styles.actions}>
          <Button variant="danger" type="button" disabled={signingOut} onClick={() => setConfirmLogout(true)}>
            Đăng xuất tất cả thiết bị
          </Button>
        </div>
      </section>
      <ConfirmModal isOpen={confirmSave} onCancel={() => setConfirmSave(false)} onConfirm={executeSave}
        title="Xác nhận lưu thay đổi" description="Bạn có chắc chắn muốn cập nhật thông tin hồ sơ cá nhân?"
        confirmLabel="Lưu thay đổi" cancelLabel="Quay lại" variant="primary" loading={saving} />
      <ConfirmModal isOpen={confirmLogout} onCancel={() => setConfirmLogout(false)}
        onConfirm={async () => {
          setSigningOut(true);
          try { await session.signOut(); } finally { setSigningOut(false); setConfirmLogout(false); }
        }}
        title="Xác nhận đăng xuất" description="Đăng xuất tài khoản trên tất cả thiết bị? Những thay đổi chưa lưu sẽ bị mất."
        confirmLabel="Đăng xuất tất cả thiết bị" cancelLabel="Quay lại" variant="danger" loading={signingOut} />
      <ConfirmModal
        isOpen={Boolean(confirmRevokeSession)}
        onCancel={() => setConfirmRevokeSession(null)}
        onConfirm={executeRevokeSession}
        title="Xác nhận thu hồi phiên đăng nhập"
        description={`Bạn có chắc chắn muốn kết thúc phiên đăng nhập trên thiết bị "${confirmRevokeSession?.deviceInfo || "này"}"? Thiết bị sẽ bị đăng xuất ngay lập tức.`}
        confirmLabel="Thu hồi phiên"
        cancelLabel="Hủy"
        variant="danger"
        loading={Boolean(revokingSessionId)}
      />
    </div>
  );
}
