import React, { useState, useEffect } from "react";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import { ConfirmModal } from "../../components/ui/confirm-modal";
import styles from "./users-panel.module.css";

export type UserStatus = "ACTIVE" | "INACTIVE" | "LOCKED";

export interface UserStatusModalProps {
  isOpen: boolean;
  user: {
    id: string;
    fullName: string;
    email: string;
    status: UserStatus;
  } | null;
  targetStatus?: UserStatus;
  currentUserId?: string;
  onClose: () => void;
  onConfirm: (userId: string, newStatus: UserStatus) => Promise<void>;
  isLoading?: boolean;
}

export function UserStatusModal({
  isOpen,
  user,
  targetStatus,
  currentUserId,
  onClose,
  onConfirm,
  isLoading = false,
}: UserStatusModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<UserStatus>(
    () => targetStatus ?? user?.status ?? "ACTIVE"
  );

  useEffect(() => {
    if (targetStatus) {
      setSelectedStatus(targetStatus);
    } else if (user) {
      setSelectedStatus(user.status);
    }
  }, [user, targetStatus]);

  if (!user) return null;

  const isLocking = selectedStatus === "LOCKED";
  const isUnchanged = selectedStatus === user.status;
  const isSelf = Boolean(currentUserId && user.id === currentUserId);
  const cannotLockSelf = isSelf && isLocking;

  const handleConfirm = async () => {
    if (cannotLockSelf) {
      return;
    }
    if (isUnchanged) {
      onClose();
      return;
    }
    await onConfirm(user.id, selectedStatus);
  };

  const modalTitle = isLocking
    ? "Khóa tài khoản người dùng"
    : selectedStatus === "ACTIVE"
    ? "Kích hoạt tài khoản"
    : "Thay đổi trạng thái tài khoản";

  const confirmLabel = isUnchanged
    ? "Đóng"
    : isLocking
    ? "Xác nhận khóa tài khoản"
    : selectedStatus === "ACTIVE"
    ? "Kích hoạt tài khoản"
    : "Lưu thay đổi";

  return (
    <ConfirmModal
      isOpen={isOpen}
      title={modalTitle}
      confirmLabel={confirmLabel}
      cancelLabel="Hủy"
      variant={isLocking ? "danger" : "primary"}
      isLoading={isLoading}
      confirmDisabled={cannotLockSelf}
      onConfirm={handleConfirm}
      onCancel={onClose}
    >
      <div className={styles.modalForm}>
        <p className={styles.modalDescription}>
          Thực hiện thay đổi trạng thái hoạt động cho tài khoản <strong>{user.fullName}</strong> ({user.email}).
        </p>

        <div className={styles.modalField}>
          <label htmlFor="user-status-select" className={styles.modalLabel}>
            Trạng thái tài khoản
          </label>
          <select
            id="user-status-select"
            className={styles.select}
            value={selectedStatus}
            disabled={isLoading}
            onChange={(e) => setSelectedStatus(e.target.value as UserStatus)}
          >
            <option value="ACTIVE">Hoạt động (ACTIVE)</option>
            <option value="INACTIVE">Chưa kích hoạt (INACTIVE)</option>
            <option value="LOCKED" disabled={isSelf}>
              Bị khóa (LOCKED){isSelf ? " — Không áp dụng cho chính bạn" : ""}
            </option>
          </select>
        </div>

        {cannotLockSelf ? (
          <div className={styles.dangerBox} role="alert">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ShieldAlert size={16} aria-hidden="true" />
              <strong>Không được phép:</strong>
            </span>{" "}
            Bạn không thể tự khóa tài khoản của chính mình.
          </div>
        ) : isLocking ? (
          <div className={styles.dangerBox} role="alert">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ShieldAlert size={16} aria-hidden="true" />
              <strong>Cảnh báo khóa tài khoản:</strong>
            </span>{" "}
            Tài khoản bị khóa sẽ lập tức mất quyền đăng nhập và không thể thực hiện bất kỳ thao tác nào trên toàn bộ hệ thống.
          </div>
        ) : null}

        {selectedStatus === "INACTIVE" && (
          <div className={styles.warningBox}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={16} aria-hidden="true" />
              <strong>Lưu ý:</strong>
            </span>{" "}
            Tài khoản ở trạng thái chưa kích hoạt sẽ cần xác thực hoặc kích hoạt lại để sử dụng.
          </div>
        )}
      </div>
    </ConfirmModal>
  );
}
