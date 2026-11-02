"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import { LoadingState, PermissionDeniedState } from "../../components/states";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { createBrowserApiClient, type PaginatedData } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import type { ClinicRole } from "../../lib/session/session";
import { UserTable, type UserItem } from "./user-table";
import { UserRoleModal } from "./user-role-modal";
import { UserStatusModal, type UserStatus } from "./user-status-modal";
import styles from "./users-panel.module.css";

export function UsersPanel() {
  const session = useSession();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters & Search
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [, startTransition] = useTransition();

  // Alert Messages
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals state
  const [roleModalUser, setRoleModalUser] = useState<UserItem | null>(null);
  const [statusModalUser, setStatusModalUser] = useState<UserItem | null>(null);
  const [statusModalTarget, setStatusModalTarget] = useState<UserStatus | undefined>(undefined);
  const [mutating, setMutating] = useState(false);

  const isAdmin = session.status === "authenticated" && session.identity?.role === "ADMIN";

  const fetchUsers = useCallback(
    async (targetPage = page) => {
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
        setUsers(res.data.items || []);
        setPage(res.pagination?.page ?? targetPage);
        setTotal(res.pagination?.total ?? (res.data.items?.length || 0));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Không thể tải danh sách tài khoản người dùng.");
      } finally {
        setLoading(false);
      }
    },
    [isAdmin, page, roleFilter, statusFilter, searchQuery, session]
  );

  useEffect(() => {
    if (isAdmin) {
      void fetchUsers(1);
    } else if (session.status !== "loading") {
      setLoading(false);
    }
  }, [isAdmin, session.status, roleFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      void fetchUsers(1);
    });
  };

  const handleConfirmRoleChange = async (userId: string, newRole: ClinicRole) => {
    setMutating(true);
    setActionSuccess(null);
    setActionError(null);
    try {
      const api = createBrowserApiClient(session);
      await api.patch(`/api/v1/users/${userId}/role`, { body: { role: newRole } });
      setActionSuccess("Đã cập nhật vai trò người dùng thành công.");
      setRoleModalUser(null);
      await fetchUsers(page);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Không thể cập nhật vai trò người dùng.");
    } finally {
      setMutating(false);
    }
  };

  const handleConfirmStatusChange = async (userId: string, newStatus: UserStatus) => {
    setMutating(true);
    setActionSuccess(null);
    setActionError(null);
    try {
      const api = createBrowserApiClient(session);
      await api.patch(`/api/v1/users/${userId}/status`, { body: { status: newStatus } });
      setActionSuccess(
        newStatus === "LOCKED"
          ? "Đã khóa tài khoản người dùng thành công."
          : newStatus === "ACTIVE"
          ? "Đã mở khóa / kích hoạt tài khoản thành công."
          : "Đã cập nhật trạng thái người dùng thành công."
      );
      setStatusModalUser(null);
      setStatusModalTarget(undefined);
      await fetchUsers(page);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Không thể cập nhật trạng thái người dùng.");
    } finally {
      setMutating(false);
    }
  };

  // Auth / Role Verification
  if (session.status === "loading") {
    return <LoadingState message="Đang kiểm tra quyền quản trị..." />;
  }

  if (!isAdmin) {
    return (
      <PermissionDeniedState
        title="Không có quyền quản lý tài khoản"
        message="Chỉ Quản trị viên (ADMIN) mới có quyền truy cập trang quản lý tài khoản người dùng và phân quyền hệ thống."
        action={{ label: "Về trang chủ", href: "/" }}
      />
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Quản lý tài khoản</h1>
          <p className={styles.subtitle}>
            Quản trị danh sách người dùng, phân quyền vai trò và kiểm soát trạng thái hoạt động tài khoản.
          </p>
        </div>
      </header>

      {/* Top Alerts */}
      {actionSuccess && (
        <Alert variant="success" title="Thành công" onClose={() => setActionSuccess(null)}>
          {actionSuccess}
        </Alert>
      )}

      {actionError && (
        <Alert variant="danger" title="Lỗi thao tác" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {error && (
        <Alert variant="danger" title="Lỗi tải dữ liệu">
          {error}
        </Alert>
      )}

      {/* Filter and Search Bar */}
      <div className={styles.filterBar}>
        <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
          <input
            type="text"
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên, email, số điện thoại..."
            aria-label="Tìm kiếm người dùng"
          />
          <Button type="submit" variant="primary" size="md">
            Tìm
          </Button>
        </form>

        <select
          className={styles.select}
          value={roleFilter}
          aria-label="Lọc theo vai trò"
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả vai trò</option>
          <option value="PATIENT">Bệnh nhân (PATIENT)</option>
          <option value="DOCTOR">Bác sĩ (DOCTOR)</option>
          <option value="STAFF">Nhân viên tiếp đón (STAFF)</option>
          <option value="ADMIN">Quản trị viên (ADMIN)</option>
        </select>

        <select
          className={styles.select}
          value={statusFilter}
          aria-label="Lọc theo trạng thái"
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Hoạt động (ACTIVE)</option>
          <option value="INACTIVE">Chưa kích hoạt (INACTIVE)</option>
          <option value="LOCKED">Bị khóa (LOCKED)</option>
        </select>
      </div>

      {/* Data Table */}
      <UserTable
        users={users}
        loading={loading}
        page={page}
        limit={10}
        total={total}
        onPageChange={(newPage) => {
          setPage(newPage);
          void fetchUsers(newPage);
        }}
        onEditRole={(user) => setRoleModalUser(user)}
        onEditStatus={(user, target) => {
          setStatusModalUser(user);
          setStatusModalTarget(target);
        }}
      />

      {/* Role Change Modal with Confirmation */}
      <UserRoleModal
        isOpen={roleModalUser !== null}
        user={roleModalUser}
        isLoading={mutating}
        onClose={() => setRoleModalUser(null)}
        onConfirm={handleConfirmRoleChange}
      />

      {/* Status Change Modal with Confirmation */}
      <UserStatusModal
        isOpen={statusModalUser !== null}
        user={statusModalUser}
        targetStatus={statusModalTarget}
        isLoading={mutating}
        onClose={() => {
          setStatusModalUser(null);
          setStatusModalTarget(undefined);
        }}
        onConfirm={handleConfirmStatusChange}
      />
    </div>
  );
}
