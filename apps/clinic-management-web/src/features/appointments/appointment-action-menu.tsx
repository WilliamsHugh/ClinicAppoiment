import React, { useId, useState } from "react";
import type { ClinicRole } from "../../lib/session/session";
import type { Appointment } from "./appointment-api";
import { allowedActions } from "./queue-api";
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
  const actions = role ? allowedActions(role, appointment.status) : [];
  const [expanded, setExpanded] = useState(false);
  const secondaryId = useId();
  const { status } = appointment;

  return (
    <div className={styles.actionGroup} role="group" aria-label="Thao tác lịch hẹn">
      {/* STAFF & ADMIN: Xác nhận khi status = PENDING */}
      {actions.includes("confirm") && (
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
      {actions.includes("check-in") && (
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

      {actions.includes("cancel") && <button type="button" className={styles.moreActions}
        aria-expanded={expanded} aria-controls={secondaryId} disabled={inFlight}
        onClick={() => setExpanded((value) => !value)}>Thao tác khác</button>}
      <div id={secondaryId} className={styles.secondaryActions} data-expanded={expanded}>
      {actions.includes("cancel") && (
        <button
          type="button"
          disabled={inFlight}
          onClick={() => onRequestCancel(appointment)}
          className={`${styles.actionBtn} ${styles.actionBtnCancel}`}
          title="Hủy lịch hẹn này"
        >
          {inFlight ? "Đang xử lý..." : "Hủy"}
        </button>
      )}

      {/* STAFF & ADMIN: Không đến khi status = CONFIRMED */}
      {actions.includes("no-show") && (
        <button
          type="button"
          disabled={inFlight}
          onClick={() => onRequestNoShow(appointment)}
          className={`${styles.actionBtn} ${styles.actionBtnNoShow}`}
          title="Đánh dấu bệnh nhân không đến khám"
        >
          {inFlight ? "Đang xử lý..." : "Không đến"}
        </button>
      )}
      </div>

      {/* DOCTOR: Xem hồ sơ hoặc khám bệnh khi status = CHECKED_IN hoặc COMPLETED */}
      {isDoctor && (status === "CHECKED_IN" || status === "COMPLETED") && (
        <button
          type="button"
          disabled={inFlight}
          onClick={() => onViewRecord(appointment)}
          className={`${styles.actionBtn} ${styles.actionBtnRecord}`}
          title={status === "CHECKED_IN" ? "Tiến hành khám bệnh" : "Xem hồ sơ bệnh án"}
        >
          {status === "CHECKED_IN" ? "Khám bệnh" : "Xem hồ sơ"}
        </button>
      )}
    </div>
  );
}
