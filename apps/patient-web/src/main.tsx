import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

type Specialty = { id: string; name: string; description?: string };
type Doctor = { id: string; displayName: string; bio?: string; specialtyId: string };
type Slot = { startAt: string; endAt: string };
type Appointment = {
  id: string;
  doctorId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: string;
  reason?: string;
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: "Bearer dev-token",
      "X-User-Id": "user-patient-1",
      "X-Role": "PATIENT",
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error?.message ?? "Request failed");
  return body.data;
}

function App() {
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("doctor-1");
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const [specialtyData, doctorData, appointmentPage] = await Promise.all([
      api<Specialty[]>("/api/v1/specialties"),
      api<Doctor[]>("/api/v1/doctors"),
      api<{ items: Appointment[] }>("/api/v1/appointments?patientId=patient-1")
    ]);
    setSpecialties(specialtyData);
    setDoctors(doctorData);
    setAppointments(appointmentPage.items);
  }

  async function loadSlots() {
    const date = new Date().toISOString().slice(0, 10);
    const data = await api<Slot[]>(`/api/v1/doctors/${selectedDoctorId}/available-slots?date=${date}`);
    setSlots(data);
  }

  async function createAppointment() {
    if (!selectedSlot) return;
    await api<Appointment>("/api/v1/appointments", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        patientId: "patient-1",
        doctorId: selectedDoctorId,
        scheduledStartAt: selectedSlot.startAt,
        scheduledEndAt: selectedSlot.endAt,
        reason: "Kham tu Patient Web"
      })
    });
    setMessage("Da gui yeu cau dat lich");
    await load();
  }

  useEffect(() => {
    void load().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    void loadSlots().catch(() => setSlots([]));
  }, [selectedDoctorId]);

  return (
    <main className="layout">
      <header>
        <h1>Patient Web</h1>
        <p>Dat lich kham qua API Gateway, khong goi truc tiep service noi bo.</p>
      </header>

      <section className="grid">
        <div className="panel">
          <h2>Chuyen khoa</h2>
          {specialties.map((specialty) => (
            <article key={specialty.id} className="row">
              <strong>{specialty.name}</strong>
              <span>{specialty.description}</span>
            </article>
          ))}
        </div>

        <div className="panel">
          <h2>Bac si</h2>
          <select value={selectedDoctorId} onChange={(event) => setSelectedDoctorId(event.target.value)}>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.displayName}
              </option>
            ))}
          </select>
          <div className="slots">
            {slots.map((slot) => (
              <button key={slot.startAt} type="button" onClick={() => setSelectedSlot(slot)}>
                {new Date(slot.startAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
              </button>
            ))}
          </div>
          <button type="button" className="primary" onClick={createAppointment} disabled={!selectedSlot}>
            Dat lich
          </button>
          {message && <p className="message">{message}</p>}
        </div>

        <div className="panel wide">
          <h2>Lich hen cua toi</h2>
          {appointments.map((appointment) => (
            <article key={appointment.id} className="row">
              <strong>{appointment.status}</strong>
              <span>{new Date(appointment.scheduledStartAt).toLocaleString("vi-VN")}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

