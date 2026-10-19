"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Pagination } from "../../src/components/pagination";
import { EmptyState, ErrorState, LoadingState } from "../../src/components/states";
import { createBrowserApiClient, type PaginatedData } from "../../src/lib/api/client";
import { useSession } from "../../src/lib/session/session-context";
import type { ClinicRole } from "../../src/lib/session/session";

export interface UserItem {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: ClinicRole;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
  createdAt?: string;
  updatedAt?: string;
}

const STATUS_BADGE_STYLES: Record<
  UserItem["status"],
  { className: string; background: string; color: string; border: string }
> = {
  ACTIVE: {
    className: "bg-emerald-100 text-emerald-700",
    background: "#d1fae5",
    color: "#047857",
    border: "#a7f3d0",
  },
  LOCKED: {
    className: "bg-rose-100 text-rose-700",
    background: "#ffe4e6",
    color: "#be123c",
    border: "#fecdd3",
  },
  INACTIVE: {
    className: "bg-slate-100 text-slate-600",
    background: "#f1f5f9",
    color: "#475569",
    border: "#e2e8f0",
  },
};

export default function UsersPage() {
  const session = useSession();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [confirmLockUser, setConfirmLockUser] = useState<UserItem | null>(null);
  const [, startTransition] = useTransition();

  const isAdmin = session.status === "authenticated" && session.identity?.role === "ADMIN";
  const currentUserId = session.identity?.id;

  const fetchUsers = useCallback(
    async (targetPage = 1) => {
      if (!isAdmin) return;
      setLoading(true);
      setError(null);
      try {
        const api = createBrowserApiClient(session);
        const query: Record<string, string | number> = {
          page: targetPage,
          limit: 10,
        };
        if (roleFilter) query.role = roleFilter;
        if (statusFilter) query.status = statusFilter;
        if (searchQuery.trim()) query.q = searchQuery.trim();

        const res = await api.get<PaginatedData<UserItem>>("/api/v1/users", { query });
        setUsers(res.data.items);
        setPage(res.pagination?.page ?? targetPage);
        setTotal(res.pagination?.total ?? res.data.items.length);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Không thể tải danh sách người dùng.");
      } finally {
        setLoading(false);
      }
    },
    [isAdmin, roleFilter, searchQuery, session, statusFilter]
  );

  useEffect(() => {
    if (!isAdmin) {
      if (session.status !== "loading") {
        setLoading(false);
      }
      return;
    }
    const timer = setTimeout(() => {
      setPage(1);
      void fetchUsers(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, roleFilter, statusFilter, isAdmin, session.status, fetchUsers]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      setPage(1);
      void fetchUsers(1);
    });
  };

  const handleRoleChange = async (userId: string, newRole: ClinicRole) => {
    setActionMessage(null);
    setError(null);
    setProcessingUserId(userId);
    try {
      const api = createBrowserApiClient(session);
      await api.patch(`/api/v1/users/${userId}/role`, { body: { role: newRole } });
      setActionMessage("Đã cập nhật vai trò người dùng thành công.");
      await fetchUsers(page);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không thể thay đổi vai trò.");
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleStatusChange = async (userId: string, newStatus: "ACTIVE" | "INACTIVE" | "LOCKED") => {
    if (newStatus === "LOCKED" && userId === currentUserId) {
      setError("Không thể tự khóa tài khoản của chính mình.");
      setConfirmLockUser(null);
      return;
    }
    setActionMessage(null);
    setError(null);
    setProcessingUserId(userId);
    try {
      const api = createBrowserApiClient(session);
      await api.patch(`/api/v1/users/${userId}/status`, { body: { status: newStatus } });
      setActionMessage(`Đã cập nhật trạng thái người dùng thành ${newStatus}.`);
      setConfirmLockUser(null);
      await fetchUsers(page);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không thể thay đổi trạng thái.");
    } finally {
      setProcessingUserId(null);
    }
  };

  if (session.status === "loading" || (isAdmin && loading && users.length === 0 && !error)) {
    return <LoadingState message="Đang kiểm tra quyền và tải danh sách người dùng..." />;
  }

  if (!isAdmin) {
    return (
      <section className="state-card state-error" role="alert" style={{ maxWidth: "600px", margin: "40px auto" }}>
        <h2>Truy cập bị từ chối</h2>
        <p>Chỉ Quản trị viên (ADMIN) mới có quyền truy cập trang quản lý tài khoản.</p>
        {session.status === "unauthenticated" ? (
          <div style={{ marginTop: "16px" }}>
            <Link
              href="/auth"
              style={{
                display: "inline-block",
                padding: "8px 16px",
                background: "#0284c7",
                color: "#fff",
                borderRadius: "4px",
                textDecoration: "none",
              }}
            >
              Đăng nhập tài khoản Quản trị
            </Link>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#0f172a" }}>Quản lý tài khoản</h1>
          <p style={{ color: "#64748b", fontSize: "14px" }}>Quản lý vai trò, trạng thái và tìm kiếm người dùng trong hệ thống</p>
        </div>
      </div>

      {actionMessage && (
        <div
          role="status"
          style={{
            padding: "10px 14px",
            marginBottom: "16px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#15803d",
            borderRadius: "6px",
            fontSize: "14px",
          }}
        >
          {actionMessage}
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            padding: "10px 14px",
            marginBottom: "16px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: "6px",
            fontSize: "14px",
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void fetchUsers(page)}
            style={{
              padding: "4px 10px",
              background: "#fff",
              color: "#b91c1c",
              border: "1px solid #fca5a5",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Filter and search bar */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "20px",
          background: "#f8fafc",
          padding: "14px",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
        }}
      >
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "8px", flex: "1 1 280px" }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên, email, số điện thoại..."
            aria-label="Tìm kiếm người dùng"
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "14px",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "8px 16px",
              background: "#0284c7",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontWeight: "500",
              cursor: "pointer",
            }}
          >
            Tìm
          </button>
        </form>

        <select
          aria-label="Lọc theo vai trò"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            border: "1px solid #cbd5e1",
            fontSize: "14px",
            background: "#fff",
          }}
        >
          <option value="">Tất cả vai trò</option>
          <option value="PATIENT">Bệnh nhân (PATIENT)</option>
          <option value="DOCTOR">Bác sĩ (DOCTOR)</option>
          <option value="STAFF">Nhân viên (STAFF)</option>
          <option value="ADMIN">Quản trị (ADMIN)</option>
        </select>

        <select
          aria-label="Lọc theo trạng thái"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            border: "1px solid #cbd5e1",
            fontSize: "14px",
            background: "#fff",
          }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Hoạt động (ACTIVE)</option>
          <option value="INACTIVE">Chưa kích hoạt (INACTIVE)</option>
          <option value="LOCKED">Bị khóa (LOCKED)</option>
        </select>
      </div>

      {/* Users table */}
      {loading ? (
        <LoadingState message="Đang tải dữ liệu người dùng..." />
      ) : error && users.length === 0 ? (
        <ErrorState message={error} onRetry={() => void fetchUsers(page)} />
      ) : users.length === 0 ? (
        <EmptyState title="Không tìm thấy người dùng" message="Không có tài khoản nào phù hợp với bộ lọc hiện tại." />
      ) : (
        <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: "12px 16px", color: "#475569", fontWeight: "600" }}>Họ và tên</th>
                <th style={{ padding: "12px 16px", color: "#475569", fontWeight: "600" }}>Email / SĐT</th>
                <th style={{ padding: "12px 16px", color: "#475569", fontWeight: "600" }}>Vai trò</th>
                <th style={{ padding: "12px 16px", color: "#475569", fontWeight: "600" }}>Trạng thái</th>
                <th style={{ padding: "12px 16px", color: "#475569", fontWeight: "600" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const badgeStyle = STATUS_BADGE_STYLES[user.status] ?? STATUS_BADGE_STYLES.INACTIVE;
                const isProcessing = processingUserId === user.id;
                const isSelf = currentUserId === user.id;

                return (
                  <tr key={user.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px 16px", fontWeight: "500", color: "#0f172a" }}>
                      {user.fullName}
                      {isSelf && (
                        <span
                          style={{
                            marginLeft: "8px",
                            padding: "2px 6px",
                            fontSize: "11px",
                            borderRadius: "4px",
                            background: "#e0f2fe",
                            color: "#0369a1",
                          }}
                        >
                          Bạn
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#64748b" }}>
                      <div>{user.email}</div>
                      {user.phone && <div style={{ fontSize: "12px" }}>{user.phone}</div>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <select
                        value={user.role}
                        disabled={isProcessing || isSelf}
                        onChange={(e) => void handleRoleChange(user.id, e.target.value as ClinicRole)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          fontSize: "13px",
                        }}
                      >
                        <option value="PATIENT">PATIENT</option>
                        <option value="DOCTOR">DOCTOR</option>
                        <option value="STAFF">STAFF</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        className={badgeStyle.className}
                        style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: "9999px",
                          fontSize: "12px",
                          fontWeight: 600,
                          background: badgeStyle.background,
                          color: badgeStyle.color,
                          border: `1px solid ${badgeStyle.border}`,
                        }}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {user.status === "LOCKED" ? (
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => void handleStatusChange(user.id, "ACTIVE")}
                          style={{
                            padding: "6px 12px",
                            background: isProcessing ? "#94a3b8" : "#16a34a",
                            color: "#fff",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: 500,
                            cursor: isProcessing ? "not-allowed" : "pointer",
                          }}
                        >
                          {isProcessing ? "Đang xử lý..." : "Mở khóa"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isProcessing || isSelf}
                          title={isSelf ? "Không thể tự khóa tài khoản của mình" : undefined}
                          onClick={() => setConfirmLockUser(user)}
                          style={{
                            padding: "6px 12px",
                            background: isProcessing || isSelf ? "#cbd5e1" : "#dc2626",
                            color: isProcessing || isSelf ? "#64748b" : "#fff",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: 500,
                            cursor: isProcessing || isSelf ? "not-allowed" : "pointer",
                          }}
                        >
                          {isProcessing ? "Đang xử lý..." : "Khóa"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0" }}>
            <Pagination
              page={page}
              limit={10}
              total={total}
              onPageChange={(newPage) => {
                setPage(newPage);
                void fetchUsers(newPage);
              }}
            />
          </div>
        </div>
      )}

      {/* Confirmation Modal before locking user account */}
      {confirmLockUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-lock-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              maxWidth: "420px",
              width: "100%",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15)",
              border: "1px solid #e2e8f0",
            }}
          >
            <h2
              id="confirm-lock-title"
              style={{
                margin: "0 0 12px 0",
                fontSize: "18px",
                fontWeight: 700,
                color: "#0f172a",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span aria-hidden="true">⚠️</span>
              <span>Xác nhận khóa tài khoản</span>
            </h2>
            <p style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#334155", lineHeight: 1.5 }}>
              Bạn có chắc muốn khóa tài khoản của{" "}
              <strong>
                {confirmLockUser.fullName} ({confirmLockUser.role})
              </strong>
              ?
            </p>
            <p style={{ margin: "0 0 20px 0", fontSize: "13px", color: "#64748b", lineHeight: 1.5 }}>
              Tài khoản bị khóa sẽ không thể đăng nhập cho đến khi được mở lại.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                disabled={processingUserId === confirmLockUser.id}
                onClick={() => setConfirmLockUser(null)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#334155",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: processingUserId === confirmLockUser.id ? "not-allowed" : "pointer",
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={processingUserId === confirmLockUser.id}
                onClick={() => void handleStatusChange(confirmLockUser.id, "LOCKED")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: processingUserId === confirmLockUser.id ? "#94a3b8" : "#dc2626",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: processingUserId === confirmLockUser.id ? "not-allowed" : "pointer",
                }}
              >
                {processingUserId === confirmLockUser.id ? "Đang xử lý..." : "Xác nhận khóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
