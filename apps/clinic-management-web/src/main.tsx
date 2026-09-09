import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

type Appointment = {
  id: string;
  patientId: string;
  doctorId: string;
  scheduledStartAt: string;
  status: string;
};

async function api<T>(path: string, role: string, options?: RequestInit): Promise<T> {
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
  if (!response.ok || !body.success) throw new Error(body.error?.message ?? "Request failed");
  return body.data;
}

function App() {
  const [role, setRole] = useState<"STAFF" | "DOCTOR" | "ADMIN">("STAFF");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [message, setMessage] = useState("");

  async function loadAppointments() {
    const data = await api<{ items: Appointment[] }>("/api/v1/appointments", role);
    setAppointments(data.items);
  }

  async function updateStatus(id: string, action: "confirm" | "check-in" | "complete" | "cancel" | "no-show") {
    await api(`/api/v1/appointments/${id}/${action}`, role, { method: "PATCH", body: JSON.stringify({}) });
    setMessage("Da cap nhat trang thai lich hen");
    await loadAppointments();
  }

  useEffect(() => {
    void loadAppointments().catch((error) => setMessage(error.message));
  }, [role]);

  return (
    <main className="layout">
      <header>
        <h1>Clinic Management Web</h1>
        <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
          <option value="STAFF">Nhan vien phong kham</option>
          <option value="DOCTOR">Bac si</option>
          <option value="ADMIN">Quan tri vien</option>
        </select>
      </header>

      <section className="grid">
        <div className="panel wide">
          <h2>Lich hen</h2>
          {appointments.length === 0 && <p>Chua co lich hen.</p>}
          {appointments.map((appointment) => (
            <article key={appointment.id} className="appointment">
              <div>
                <strong>{appointment.patientId}</strong>
                <span>{new Date(appointment.scheduledStartAt).toLocaleString("vi-VN")}</span>
              </div>
              <strong>{appointment.status}</strong>
              <div className="actions">
                {role !== "DOCTOR" && <button onClick={() => updateStatus(appointment.id, "confirm")}>Xac nhan</button>}
                {role !== "DOCTOR" && <button onClick={() => updateStatus(appointment.id, "check-in")}>Check-in</button>}
                {role === "DOCTOR" && <button onClick={() => updateStatus(appointment.id, "complete")}>Hoan thanh</button>}
                {role !== "DOCTOR" && <button onClick={() => updateStatus(appointment.id, "cancel")}>Huy</button>}
              </div>
            </article>
          ))}
          {message && <p>{message}</p>}
        </div>

        <div className="panel">
          <h2>{role === "ADMIN" ? "Quan tri" : role === "DOCTOR" ? "Buoi kham" : "Van hanh"}</h2>
          {role === "STAFF" && <p>Xac nhan lich, check-in benh nhan va quan ly lich hen trong ngay.</p>}
          {role === "DOCTOR" && <p>Xem benh nhan da check-in va tao ket qua kham trong Medical Record Service.</p>}
          {role === "ADMIN" && <p>Quan ly tai khoan, bac si, chuyen khoa, lich lam viec va health co ban.</p>}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

