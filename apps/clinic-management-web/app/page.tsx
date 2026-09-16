"use client";

import { useEffect, useState } from "react";

import "./page.css";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

type Role = "STAFF" | "DOCTOR" | "ADMIN";
type Action = "confirm" | "check-in" | "complete" | "cancel";

type Appointment = {
  id: string;
  patientId: string;
  doctorId: string;
  scheduledStartAt: string;
  status: string;
};

async function api<T>(path: string, role: Role, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: "Bearer dev-token",
      "X-User-Id": role === "DOCTOR" ? "user-doctor-1" : "user-admin-1",
      "X-Role": role,
      "Content-Type": "application/json",
      ...options?.headers
    }
  });

  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(body.error?.message ?? "Không thể thực hiện yêu cầu");
  }

  return body.data;
}

export default function ClinicManagementPage() {
  const [role, setRole] = useState<Role>("STAFF");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadAppointments() {
    setIsLoading(true);
    try {
      const data = await api<{ items: Appointment[] }>("/api/v1/appointments", role);
      setAppointments(data.items);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải lịch hẹn");
    } finally {
      setIsLoading(false);
    }
  }

  async function updateStatus(id: string, action: Action) {
    try {
      await api(`/api/v1/appointments/${id}/${action}`, role, {
        method: "PATCH",
        body: JSON.stringify({})
      });
      setMessage("Đã cập nhật trạng thái lịch hẹn");
      await loadAppointments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật lịch hẹn");
    }
  }

  useEffect(() => {
    void loadAppointments();
  }, [role]);

  return (
    <main className="layout">
      <header className="page-header">
        <div>
          <p className="eyebrow">Clinic Management</p>
          <h1>Quản lý phòng khám</h1>
        </div>
        <label className="role-picker">
          Vai trò
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="STAFF">Nhân viên phòng khám</option>
            <option value="DOCTOR">Bác sĩ</option>
            <option value="ADMIN">Quản trị viên</option>
          </select>
        </label>
      </header>

      <section className="grid">
        <div className="panel wide">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Appointment Service</p>
              <h2>Lịch hẹn hôm nay</h2>
            </div>
            <button type="button" onClick={() => void loadAppointments()} disabled={isLoading}>
              {isLoading ? "Đang tải..." : "Tải lại"}
            </button>
          </div>

          {appointments.length === 0 && !isLoading && <p>Chưa có lịch hẹn.</p>}
          {appointments.map((appointment) => (
            <article key={appointment.id} className="appointment">
              <div>
                <strong>{appointment.patientId}</strong>
                <span>{new Date(appointment.scheduledStartAt).toLocaleString("vi-VN")}</span>
              </div>
              <strong className="status">{appointment.status}</strong>
              <div className="actions">
                {role !== "DOCTOR" && <button onClick={() => void updateStatus(appointment.id, "confirm")}>Xác nhận</button>}
                {role !== "DOCTOR" && <button onClick={() => void updateStatus(appointment.id, "check-in")}>Check-in</button>}
                {role === "DOCTOR" && <button onClick={() => void updateStatus(appointment.id, "complete")}>Hoàn thành</button>}
                {role !== "DOCTOR" && <button onClick={() => void updateStatus(appointment.id, "cancel")}>Hủy</button>}
              </div>
            </article>
          ))}
          {message && <p className="message" role="status">{message}</p>}
        </div>

        <aside className="panel">
          <p className="eyebrow">Role Workspace</p>
          <h2>{role === "ADMIN" ? "Quản trị" : role === "DOCTOR" ? "Buổi khám" : "Vận hành"}</h2>
          <p>
            {role === "STAFF" && "Xác nhận lịch, check-in bệnh nhân và quản lý lịch trong ngày."}
            {role === "DOCTOR" && "Xem bệnh nhân đã check-in và tạo kết quả khám."}
            {role === "ADMIN" && "Quản lý tài khoản, bác sĩ, chuyên khoa và lịch làm việc."}
          </p>
        </aside>
      </section>
    </main>
  );
}
