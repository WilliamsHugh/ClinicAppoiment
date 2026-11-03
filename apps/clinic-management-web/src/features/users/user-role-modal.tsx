import React, { useState, useEffect } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { ConfirmModal } from "../../components/ui/confirm-modal";
import type { ClinicRole } from "../../lib/session/session";
import styles from "./users-panel.module.css";

export interface UserRoleModalProps {
  isOpen: boolean;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: ClinicRole;
  } | null;
  onClose: () => void;
  onConfirm: (userId: string, newRole: ClinicRole) => Promise<void>;
  isLoading?: boolean;
}

export function UserRoleModal({
  isOpen,
  user,
  onClose,
  onConfirm,
  isLoading = false,
}: UserRoleModalProps) {
  const [selectedRole, setSelectedRole] = useState<ClinicRole>(() => user?.role ?? "PATIENT");

  useEffect(() => {
    if (user) {
      setSelectedRole(user.role);
    }
  }, [user]);

  if (!user) return null;

  const isUnchanged = selectedRole === user.role;

  const handleConfirm = async () => {
    if (isUnchanged) {
      onClose();
      return;
    }
    await onConfirm(user.id, selectedRole);
  };

  return (
    <ConfirmModal
      isOpen={isOpen}
      title="Thay đổi vai trò người dùng"
      confirmLabel={isUnchanged ? "Đóng" : "Xác nhận thay đổi"}
      cancelLabel="Hủy"
      variant="primary"
      isLoading={isLoading}
      onConfirm={handleConfirm}
      onCancel={onClose}
    >
      <div className={styles.modalForm}>
        <p className={styles.modalDescription}>
          Thay đổi vai trò hệ thống cho người dùng <strong>{user.fullName}</strong> ({user.email}).
        </p>

        <div className={styles.modalField}>
          <label htmlFor="user-role-select" className={styles.modalLabel}>
            Chọn vai trò mới
          </label>
          <select
            id="user-role-select"
            className={styles.select}
            value={selectedRole}
            disabled={isLoading}
            onChange={(e) => setSelectedRole(e.target.value as ClinicRole)}
          >
            <option value="PATIENT">Bệnh nhân (PATIENT)</option>
            <option value="DOCTOR">Bác sĩ (DOCTOR)</option>
            <option value="STAFF">Nhân viên tiếp đón (STAFF)</option>
            <option value="ADMIN">Quản trị viên (ADMIN)</option>
          </select>
        </div>

        {selectedRole === "ADMIN" && (
          <div className={styles.warningBox} role="alert">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={16} aria-hidden="true" />
              <strong>Cảnh báo quyền hạn:</strong>
            </span>{" "}
            Vai trò Quản trị viên (ADMIN) có toàn quyền cấu hình hệ thống, quản lý tài khoản người dùng và xem thông tin kiểm toán.
          </div>
        )}

        {selectedRole === "DOCTOR" && (
          <div className={styles.warningBox}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Info size={16} aria-hidden="true" />
              <strong>Lưu ý:</strong>
            </span>{" "}
            Bác sĩ cần được phân công chuyên khoa và lịch trực tại Doctor Service để có thể nhận lịch khám.
          </div>
        )}
      </div>
    </ConfirmModal>
  );
}
