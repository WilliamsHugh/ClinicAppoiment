"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Pagination } from "../../src/components/pagination";
import { EmptyState, ErrorState, LoadingState } from "../../src/components/states";
import { createBrowserApiClient } from "../../src/lib/api/client";
import { useSession } from "../../src/lib/session/session-context";
import type { ClinicRole } from "../../src/lib/session/session";

interface UserItem {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: ClinicRole;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
  createdAt?: string;
  updatedAt?: string;
}

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
  const [, startTransition] = useTransition();

  const isAdmin = session.status === "authenticated" && session.identity?.role === "ADMIN";

  const fetchUsers = async (targetPage = page) => {
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

      const res = await api.get<UserItem[]>("/api/v1/users", { query });
      setUsers(res.data ?? []);
      setPage(res.pagination?.page ?? targetPage);
      setTotal(res.pagination?.total ?? (res.data ? res.data.length : 0));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không thể tải danh sách người dùng.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers(1);
    } else if (session.status !== "loading") {
      setLoading(false);
    }
  }, [session.status, session.identity?.role, roleFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      fetchUsers(1);
    });
  };

  const handleRoleChange = async (userId: string, newRole: ClinicRole) => {
    setActionMessage(null);
    try {
      const api = createBrowserApiClient(session);
      await api.patch(`/api/v1/users/${userId}/role`, { body: { role: newRole } });
      setActionMessage("Đã cập nhật vai trò người dùng thành công.");
      fetchUsers(page);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không thể thay đổi vai trò.");
    }
  };

  const handleStatusChange = async (userId: string, newStatus: "ACTIVE" | "INACTIVE" | "LOCKED") => {
    setActionMessage(null);
    try {
      const api = createBrowserApiClient(session);
      await api.patch(`/api/v1/users/${userId}/status`, { body: { status: newStatus } });
      setActionMessage(`Đã cập nhật trạng thái người dùng thành ${newStatus}.`);
      fetchUsers(page);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không thể thay đổi trạng thái.");
    }
  };

  if (session.status === "loading" || (isAdmin && loading && users.length === 0)) {
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
        <div style={{ padding: "10px 14px", marginBottom: "16px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", borderRadius: "6px", fontSize: "14px" }}>
          {actionMessage}
        </div>
      )}

      {error && (
        <div style={{ padding: "10px 14px", marginBottom: "16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: "6px", fontSize: "14px" }}>
          {error}
        </div>
      )}

      {/* Filter and search bar */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "20px", background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "8px", flex: "1 1 280px" }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên, email, số điện thoại..."
            style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
          />
          <button
            type="submit"
            style={{ padding: "8px 16px", background: "#0284c7", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "500", cursor: "pointer" }}
          >
            Tìm
          </button>
        </form>

        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px", background: "#fff" }}
        >
          <option value="">Tất cả vai trò</option>
          <option value="PATIENT">Bệnh nhân (PATIENT)</option>
          <option value="DOCTOR">Bác sĩ (DOCTOR)</option>
          <option value="STAFF">Nhân viên (STAFF)</option>
          <option value="ADMIN">Quản trị (ADMIN)</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px", background: "#fff" }}
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
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 16px", fontWeight: "500", color: "#0f172a" }}>
                    {user.fullName}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#64748b" }}>
                    <div>{user.email}</div>
                    {user.phone && <div style={{ fontSize: "12px" }}>{user.phone}</div>}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as ClinicRole)}
                      style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    >
                      <option value="PATIENT">PATIENT</option>
                      <option value="DOCTOR">DOCTOR</option>
                      <option value="STAFF">STAFF</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: "500",
                        background: user.status === "ACTIVE" ? "#dcfce7" : user.status === "LOCKED" ? "#fee2e2" : "#f1f5f9",
                        color: user.status === "ACTIVE" ? "#166534" : user.status === "LOCKED" ? "#991b1b" : "#475569",
                      }}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {user.status === "LOCKED" ? (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(user.id, "ACTIVE")}
                        style={{ padding: "4px 10px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}
                      >
                        Mở khóa
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(user.id, "LOCKED")}
                        style={{ padding: "4px 10px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}
                      >
                        Khóa
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0" }}>
            <Pagination
              page={page}
              limit={10}
              total={total}
              onPageChange={(newPage) => {
                setPage(newPage);
                fetchUsers(newPage);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
