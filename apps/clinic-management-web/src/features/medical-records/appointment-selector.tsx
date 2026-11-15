import React from "react";
import { formatVietnamDateTime } from "../../lib/formatting/date-time";
import styles from "./medical-records-panel.module.css";

export interface AppointmentOption {
  id: string;
  patientId: string;
  doctorId: string;
  scheduledStartAt: string;
  status: string;
  reason?: string;
}

export interface AppointmentSelectorProps {
  appointments: AppointmentOption[];
  selectedAppointmentId: string;
  onSelect: (appointmentId: string) => void;
  disabled?: boolean;
  patientNames?: Record<string, string>;
  error?: string | null;
}

function formatShortPatientName(patientId: string, fullName?: string): string {
  if (fullName && fullName.trim()) {
    return fullName.trim();
  }
  const cleanId = patientId.replace(/-/g, "");
  const suffix = cleanId.length >= 4 ? cleanId.slice(-4) : cleanId;
  return `Bệnh nhân #${suffix}`;
}

export function AppointmentSelector({
  appointments,
  selectedAppointmentId,
  onSelect,
  disabled = false,
  patientNames = {},
  error,
}: AppointmentSelectorProps) {
  const visibleAppointments = appointments.filter(
    (a) => a.status === "CHECKED_IN" || a.id === selectedAppointmentId
  );
  const checkedInList = appointments.filter((a) => a.status === "CHECKED_IN");

  return (
    <div className={styles.fieldGroup}>
      <label htmlFor="appointment-select" className={styles.fieldLabel}>
        Lịch hẹn đã tiếp nhận
      </label>
      <select
        id="appointment-select"
        className={`${styles.select} ${error ? styles.inputError : ""}`.trim()}
        value={selectedAppointmentId}
        disabled={disabled || (visibleAppointments.length === 0)}
        aria-label="Chọn lịch hẹn đã check-in"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "appointment-select-error" : "appointment-select-help"}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">-- Chọn lịch hẹn đã tiếp nhận --</option>
        {visibleAppointments.map((appt) => {
          const displayName = formatShortPatientName(
            appt.patientId,
            patientNames[appt.patientId]
          );
          const formattedDate = formatVietnamDateTime(appt.scheduledStartAt);
          const statusText = appt.status === "CHECKED_IN" ? "Đã tiếp nhận" : appt.status;
          return (
            <option key={appt.id} value={appt.id}>
              {displayName} — {formattedDate} ({statusText})
            </option>
          );
        })}
      </select>

      {error && (
        <span id="appointment-select-error" className={styles.fieldError} role="alert">
          {error}
        </span>
      )}

      {checkedInList.length === 0 && !selectedAppointmentId ? (
        <p id="appointment-select-help" className={styles.fieldHelp}>
          Không có lịch hẹn nào đang ở trạng thái CHECKED_IN. Bệnh nhân cần được nhân viên lễ tân tiếp nhận (Check-in) trước khi lập bệnh án.
        </p>
      ) : <p id="appointment-select-help" className={styles.fieldHelp}>Chọn đúng ca trước khi nhập kết quả khám.</p>}
    </div>
  );
}
