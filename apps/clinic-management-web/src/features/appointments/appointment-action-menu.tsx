import React from "react";
import type { ClinicRole } from "../../lib/session/session";
import type { Appointment } from "./appointment-api";
import styles from "./appointments-panel.module.css";

export interface AppointmentActionMenuProps {
  appointment: Appointment;
  role?: ClinicRole;
  inFlight: boolean;
  onConfirm: (appointment: Appointment) => void;
  onRequestCancel: (appointment: Appointment) => void;
  onCheckIn: (appointment: Appointment) => void;
  onRequestNoShow: (appointment: Appointment) => void;
  onViewRecord: (appointment: Appointment) => void;
}

export function AppointmentActionMenu({
  appointment,
  role,
  inFlight,
  onConfirm,
  onRequestCancel,
  onCheckIn,
  onRequestNoShow,
  onViewRecord,
}: AppointmentActionMenuProps) {
  const isDoctor = role === "DOCTOR";
  const isStaffOrAdmin = role === "STAFF" || role === "ADMIN";
  const { status } = appointment;

  return (
    <div className={styles.actionGroup} role="group" aria-label="Thao tác lịch hẹn">
      {/* STAFF & ADMIN: Xác nhận khi status = PENDING */}
      {isStaffOrAdmin && status === "PENDING" && (
        <button
          type="button"
          disabled={inFlight}
          onClick={() => onConfirm(appointment)}
          className={`${styles.actionBtn} ${styles.actionBtnConfirm}`}
          title="Xác nhận lịch hẹn này"
        >
          {inFlight ? "Đang xử lý..." : "Xác nhận"}
        </button>
      )}

      {/* STAFF & ADMIN: Check-in khi status = CONFIRMED */}
      {isStaffOrAdmin && status === "CONFIRMED" && (
        <button
          type="button"
          disabled={inFlight}
          onClick={() => onCheckIn(appointment)}
          className={`${styles.actionBtn} ${styles.actionBtnCheckIn}`}
          title="Check-in cho bệnh nhân"
        >
          {inFlight ? "Đang xử lý..." : "Check-in"}
        </button>
      )}

      {/* STAFF & ADMIN: Hủy khi status = PENDING hoặc CONFIRMED */}
      {isStaffOrAdmin && (status === "PENDING" || status === "CONFIRMED") && (
        <button
          type="button"
          disabled={inFlight}
          onClick={() => onRequestCancel(appointment)}
          className={`${styles.actionBtn} ${styles.actionBtnCancel}`}
          title="Hủy lịch hẹn này"
        >
          Hủy
        </button>
      )}

      {/* STAFF & ADMIN: Không đến khi status = CONFIRMED */}
      {isStaffOrAdmin && status === "CONFIRMED" && (
        <button
          type="button"
          disabled={inFlight}
          onClick={() => onRequestNoShow(appointment)}
          className={`${styles.actionBtn} ${styles.actionBtnNoShow}`}
          title="Đánh dấu bệnh nhân không đến khám"
        >
          Không đến
        </button>
      )}

      {/* DOCTOR & ADMIN: Xem hồ sơ khi status = CHECKED_IN hoặc COMPLETED */}
      {(isDoctor || role === "ADMIN") && (status === "CHECKED_IN" || status === "COMPLETED") && (
        <button
          type="button"
          disabled={inFlight}
          onClick={() => onViewRecord(appointment)}
          className={`${styles.actionBtn} ${styles.actionBtnRecord}`}
          title={isDoctor && status === "CHECKED_IN" ? "Tiến hành khám bệnh" : "Xem hồ sơ bệnh án"}
        >
          {isDoctor && status === "CHECKED_IN" ? "Khám bệnh" : "Xem hồ sơ"}
        </button>
      )}
    </div>
  );
}
