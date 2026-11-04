import React from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { SkeletonTable } from "../../components/states";
import { EmptyState } from "../../components/states";
import { Pagination } from "../../components/pagination";
import type { ClinicRole } from "../../lib/session/session";
import type { UserStatus } from "./user-status-modal";
import styles from "./users-panel.module.css";

export interface UserItem {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: ClinicRole;
  status: UserStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserTableProps {
  users: UserItem[];
  loading: boolean;
  page: number;
  limit: number;
  total: number;
  onPageChange: (newPage: number) => void;
  onEditRole: (user: UserItem) => void;
  onEditStatus: (user: UserItem, targetStatus?: UserStatus) => void;
}

function RoleBadge({ role }: { role: ClinicRole }) {
  switch (role) {
    case "ADMIN":
      return <Badge variant="primary">Quản trị viên</Badge>;
    case "DOCTOR":
      return <Badge variant="info">Bác sĩ</Badge>;
    case "STAFF":
      return <Badge variant="warning">Nhân viên tiếp đón</Badge>;
    case "PATIENT":
    default:
      return <Badge variant="neutral">Bệnh nhân</Badge>;
  }
}

function StatusBadge({ status }: { status: UserStatus }) {
  switch (status) {
    case "ACTIVE":
      return <Badge variant="success">Hoạt động</Badge>;
    case "LOCKED":
      return <Badge variant="danger">Bị khóa</Badge>;
    case "INACTIVE":
    default:
      return <Badge variant="neutral">Chưa kích hoạt</Badge>;
  }
}

export function UserTable({
  users,
  loading,
  page,
  limit,
  total,
  onPageChange,
  onEditRole,
  onEditStatus,
}: UserTableProps) {
  if (loading && users.length === 0) {
    return (
      <div className={styles.tableCard}>
        <SkeletonTable
          rows={8}
          headers={["Họ và tên", "Email / Số điện thoại", "Vai trò", "Trạng thái", "Thao tác"]}
        />
      </div>
    );
  }

  if (!loading && users.length === 0) {
    return (
      <EmptyState
        title="Không tìm thấy người dùng"
        message="Không có tài khoản nào phù hợp với điều kiện tìm kiếm hoặc bộ lọc hiện tại."
      />
    );
  }

  return (
    <div
      className={styles.tableCard}
      aria-busy={loading ? "true" : undefined}
      style={{ opacity: loading ? 0.8 : 1, transition: "opacity 0.2s ease" }}
    >
      <div className={styles.tableContainer}>
        <table className={styles.table} aria-label="Danh sách tài khoản người dùng">
          <thead>
            <tr>
              <th className={styles.th}>Họ và tên</th>
              <th className={styles.th}>Email / Số điện thoại</th>
              <th className={styles.th}>Vai trò</th>
              <th className={styles.th}>Trạng thái</th>
              <th className={styles.th}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={styles.tr}>
                <td className={styles.td}>
                  <div className={styles.userName}>{user.fullName}</div>
                </td>
                <td className={styles.td}>
                  <div className={styles.userEmail}>{user.email}</div>
                  {user.phone && <div className={styles.userPhone}>{user.phone}</div>}
                </td>
                <td className={styles.td}>
                  <RoleBadge role={user.role} />
                </td>
                <td className={styles.td}>
                  <StatusBadge status={user.status} />
                </td>
                <td className={styles.td}>
                  <div className={styles.cellActions}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onEditRole(user)}
                    >
                      Đổi vai trò
                    </Button>

                    {user.status === "LOCKED" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onEditStatus(user, "ACTIVE")}
                      >
                        Mở khóa
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => onEditStatus(user, "LOCKED")}
                      >
                        Khóa
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.paginationFooter}>
        <Pagination
          page={page}
          limit={limit}
          total={total}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}
