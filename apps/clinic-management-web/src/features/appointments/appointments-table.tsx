import React from "react";
import type { ClinicRole } from "../../lib/session/session";
import type { Appointment } from "./appointment-api";
import { StatusBadge, Alert } from "../../components/ui";
import { AppointmentActionMenu } from "./appointment-action-menu";
import styles from "./appointments-panel.module.css";

export interface AppointmentsTableProps {
  appointments: Appointment[];
  role?: ClinicRole;
  patientsMap: Record<string, string>;
  doctorsMap: Record<string, string>;
  specialtiesMap: Record<string, string>;
  actionLoadingId: string | null;
  rowConflicts: Record<string, string>;
  onClearConflict?: (appointmentId: string) => void;
  onConfirm: (appointment: Appointment) => void;
  onRequestCancel: (appointment: Appointment) => void;
  onCheckIn: (appointment: Appointment) => void;
  onRequestNoShow: (appointment: Appointment) => void;
  onViewRecord: (appointment: Appointment) => void;
}

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatTime(startIso: string, endIso: string) {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const timeRange = `${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
    const dateStr = dateFormatter.format(start);
    return { timeRange, dateStr };
  } catch {
    return { timeRange: startIso, dateStr: "" };
  }
}

function getPatientDisplay(patientId: string, name?: string): { name: string; sub: string } {
  if (name && name.trim()) {
    return { name, sub: `Mã: #${patientId.slice(-4).toUpperCase()}` };
  }
  return {
    name: `Bệnh nhân #${patientId.slice(-4).toUpperCase()}`,
    sub: "Chưa có tên hồ sơ",
  };
}

export function AppointmentsTable({
  appointments,
  role,
  patientsMap,
  doctorsMap,
  specialtiesMap,
  actionLoadingId,
  rowConflicts,
  onClearConflict,
  onConfirm,
  onRequestCancel,
  onCheckIn,
  onRequestNoShow,
  onViewRecord,
}: AppointmentsTableProps) {
  const isDoctor = role === "DOCTOR";
  const colCount = isDoctor ? 4 : 6;

  return (
    <div className={styles.tableCard}>
      <div
        className={styles.tableWrapper}
        tabIndex={0}
        role="region"
        aria-label="Danh sách lịch hẹn"
      >
        <table className={styles.table} aria-label="Danh sách lịch hẹn">
          <thead>
            <tr>
              <th scope="col" style={{ width: "160px" }}>Giờ khám</th>
              <th scope="col">Bệnh nhân</th>
              {!isDoctor && <th scope="col">Bác sĩ</th>}
              {!isDoctor && <th scope="col">Chuyên khoa</th>}
              <th scope="col" style={{ width: "140px" }}>Trạng thái</th>
              <th scope="col" style={{ textAlign: "right", minWidth: "180px" }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((appointment) => {
              const { timeRange, dateStr } = formatTime(
                appointment.scheduledStartAt,
                appointment.scheduledEndAt
              );
              const patient = getPatientDisplay(
                appointment.patientId,
                patientsMap[appointment.patientId]
              );
              const doctorName = doctorsMap[appointment.doctorId] || `Bác sĩ #${appointment.doctorId.slice(-4).toUpperCase()}`;
              const specialtyName = appointment.specialtyId
                ? specialtiesMap[appointment.specialtyId] || "Chuyên khoa"
                : "Đa khoa";
              const inFlight = actionLoadingId === appointment.id;
              const conflict = rowConflicts[appointment.id];

              return (
                <React.Fragment key={appointment.id}>
                  <tr
                    tabIndex={0}
                    className={styles.tableRow}
                    aria-busy={inFlight ? "true" : undefined}
                    aria-label={`Lịch hẹn ${patient.name}`}
                  >
                    <td className={styles.appointmentTime}>
                      <div className={styles.timeCell}>
                        <span className={styles.timeHours}>{timeRange}</span>
                        <span className={styles.timeDate}>{dateStr} · UTC+7</span>
                      </div>
                    </td>
                    <td className={styles.appointmentPatient}>
                      <div className={styles.patientCell}>
                        <span className={styles.patientName}>{patient.name}</span>
                        <span className={styles.patientSub}>{patient.sub}</span>
                      </div>
                    </td>
                    {!isDoctor && (
                      <td className={styles.appointmentDoctor} data-label="Bác sĩ">
                        <div className={styles.doctorCell}>
                          <span className={styles.doctorName}>{doctorName}</span>
                        </div>
                      </td>
                    )}
                    {!isDoctor && (
                      <td className={styles.appointmentSpecialty} data-label="Chuyên khoa">
                        <span className={styles.specialtyBadge}>{specialtyName}</span>
                      </td>
                    )}
                    <td className={styles.appointmentStatus}>
                      <StatusBadge status={appointment.status} />
                    </td>
                    <td className={styles.appointmentActions}>
                      <AppointmentActionMenu
                        appointment={appointment}
                        role={role}
                        inFlight={inFlight}
                        onConfirm={onConfirm}
                        onRequestCancel={onRequestCancel}
                        onCheckIn={onCheckIn}
                        onRequestNoShow={onRequestNoShow}
                        onViewRecord={onViewRecord}
                      />
                    </td>
                  </tr>

                  {/* Inline 409 Conflict Alert if present */}
                  {conflict && (
                    <tr>
                      <td colSpan={colCount} className={styles.conflictAlert}>
                        <Alert
                          variant="warning"
                          title="Xung đột trạng thái lịch hẹn (409)"
                          onClose={onClearConflict ? () => onClearConflict(appointment.id) : undefined}
                        >
                          {conflict}
                        </Alert>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
