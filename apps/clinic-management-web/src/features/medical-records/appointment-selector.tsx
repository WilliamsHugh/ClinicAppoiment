import React from "react";
import styles from "./medical-records-panel.module.css";

export interface AppointmentOption {
  id: string;
  patientId: string;
  doctorId: string;
  scheduledStartAt: string;
  status: string;
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

function formatAppointmentDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

export function AppointmentSelector({
  appointments,
  selectedAppointmentId,
  onSelect,
  disabled = false,
  patientNames = {},
  error,
}: AppointmentSelectorProps) {
  const checkedInList = appointments.filter((a) => a.status === "CHECKED_IN");

  return (
    <div className={styles.fieldGroup}>
      <label htmlFor="appointment-select" className={styles.fieldLabel}>
        Lịch hẹn khám đã Check-in <span style={{ color: "var(--danger)" }}>*</span>
      </label>
      <select
        id="appointment-select"
        className={`${styles.select} ${error ? styles.inputError : ""}`.trim()}
        value={selectedAppointmentId}
        disabled={disabled || checkedInList.length === 0}
        aria-label="Chọn lịch hẹn đã check-in"
        aria-invalid={Boolean(error)}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">-- Chọn lịch hẹn đã tiếp nhận --</option>
        {checkedInList.map((appt) => {
          const displayName = formatShortPatientName(
            appt.patientId,
            patientNames[appt.patientId]
          );
          const formattedDate = formatAppointmentDate(appt.scheduledStartAt);
          return (
            <option key={appt.id} value={appt.id}>
              {displayName} — {formattedDate} ({appt.status})
            </option>
          );
        })}
      </select>

      {error && (
        <span className={styles.fieldError} role="alert">
          {error}
        </span>
      )}

      {checkedInList.length === 0 && (
        <p className={styles.fieldHelp} style={{ color: "var(--warning)" }}>
          Không có lịch hẹn nào đang ở trạng thái CHECKED_IN. Bệnh nhân cần được nhân viên lễ tân tiếp nhận (Check-in) trước khi lập bệnh án.
        </p>
      )}
    </div>
  );
}
