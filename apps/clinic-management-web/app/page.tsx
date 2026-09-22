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

type MedicalRecord = {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  symptoms?: string;
  diagnosis?: string;
  notes?: string;
  treatmentPlan?: string;
  prescription: { medicineName: string; dosage: string; frequency: string; duration: string }[];
  status: "DRAFT" | "FINAL";
  createdAt: string;
};

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  status: "UNREAD" | "READ" | "FAILED";
  createdAt: string;
  payload?: unknown;
};

async function api<T>(path: string, role: Role, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: "Bearer dev-token",
      "X-User-Id": role === "DOCTOR" ? "user-doctor-1" : role === "STAFF" ? "user-staff-1" : "user-admin-1",
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
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRecordsLoading, setIsRecordsLoading] = useState(false);
  const [isNotifLoading, setIsNotifLoading] = useState(false);

  // Medical record form state (RECORD-005)
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [prescription, setPrescription] = useState([{ medicineName: "", dosage: "", frequency: "", duration: "" }]);
  const [recordStatus, setRecordStatus] = useState<"DRAFT" | "FINAL">("FINAL");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  async function loadRecords() {
    setIsRecordsLoading(true);
    try {
      // Doctor views records assigned to self; Admin/Staff filtered logic in backend
      const q = role === "DOCTOR" ? "?doctorId=user-doctor-1&page=1&limit=20" : "?page=1&limit=20";
      const data = await api<{ items: MedicalRecord[] }>(`/api/v1/medical-records${q}`, role);
      setRecords(data.items);
    } catch {
      // Silently ignore for STAFF (403 per policy)
      if (role !== "STAFF") setRecords([]);
    } finally {
      setIsRecordsLoading(false);
    }
  }

  async function loadNotifications() {
    setIsNotifLoading(true);
    try {
      const data = await api<{ items: Notification[] }>("/api/v1/notifications?page=1&limit=20", role);
      setNotifications(data.items);
    } catch {
      setNotifications([]);
    } finally {
      setIsNotifLoading(false);
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

  async function handleMarkRead(id: string) {
    try {
      await api(`/api/v1/notifications/${id}/read`, role, { method: "PATCH", body: JSON.stringify({}) });
      await loadNotifications();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đánh dấu đã đọc");
    }
  }

  async function handleCreateRecord(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAppointmentId) {
      setMessage("Vui lòng chọn lịch hẹn đã check-in");
      return;
    }
    // Find appointment to get patientId/doctorId
    const appt = appointments.find((a) => a.id === selectedAppointmentId);
    if (!appt) {
      setMessage("Không tìm thấy lịch hẹn");
      return;
    }
    if (appt.status !== "CHECKED_IN" && appt.status !== "COMPLETED") {
      setMessage("Chỉ tạo hồ sơ cho lịch đã CHECKED_IN");
      return;
    }
    if (role !== "DOCTOR" && role !== "ADMIN") {
      setMessage("Chỉ bác sĩ mới được tạo hồ sơ khám");
      return;
    }
    setIsSubmitting(true);
    try {
      const filteredPres = prescription.filter((p) => p.medicineName.trim() !== "");
      if (filteredPres.some((p) => !p.dosage || !p.frequency || !p.duration)) {
        throw new Error("Vui lòng điền đầy đủ liều dùng/tần suất/thời gian cho mỗi thuốc");
      }
      await api("/api/v1/medical-records", role, {
        method: "POST",
        body: JSON.stringify({
          appointmentId: selectedAppointmentId,
          patientId: appt.patientId,
          doctorId: appt.doctorId,
          symptoms: symptoms || undefined,
          diagnosis: diagnosis || undefined,
          notes: notes || undefined,
          treatmentPlan: treatmentPlan || undefined,
          prescription: filteredPres,
          status: recordStatus
        })
      });
      setMessage("Đã lưu hồ sơ khám thành công");
      setSymptoms("");
      setDiagnosis("");
      setNotes("");
      setTreatmentPlan("");
      setPrescription([{ medicineName: "", dosage: "", frequency: "", duration: "" }]);
      await loadRecords();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu hồ sơ khám");
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    void loadAppointments();
    void loadRecords();
    void loadNotifications();
  }, [role]);

  const checkedInAppointments = appointments.filter((a) => a.status === "CHECKED_IN");

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
                {role === "DOCTOR" && appointment.status === "CHECKED_IN" && (
                  <button onClick={() => setSelectedAppointmentId(appointment.id)} style={{ background: "#0F766E", color: "#fff" }}>
                    Tạo hồ sơ
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>

        <aside className="panel">
          <p className="eyebrow">Role Workspace</p>
          <h2>{role === "ADMIN" ? "Quản trị" : role === "DOCTOR" ? "Buổi khám" : "Vận hành"}</h2>
          <p>
            {role === "STAFF" && "Xác nhận lịch, check-in bệnh nhân và quản lý lịch trong ngày."}
            {role === "DOCTOR" && "Xem bệnh nhân đã check-in và tạo kết quả khám. Chọn lịch CHECKED_IN để lập hồ sơ."}
            {role === "ADMIN" && "Quản lý tài khoản, bác sĩ, chuyên khoa và lịch làm việc."}
          </p>
          <div style={{ marginTop: 16 }}>
            <p className="eyebrow">Thông báo</p>
            {isNotifLoading ? <p>Đang tải...</p> : notifications.length === 0 ? <p>Chưa có thông báo.</p> : notifications.slice(0, 5).map((n) => (
              <div key={n.id} style={{ borderTop: "1px solid #e5e9f0", padding: "8px 0", opacity: n.status === "UNREAD" ? 1 : 0.6 }}>
                <strong style={{ fontSize: 13 }}>{n.title}</strong>
                <p style={{ margin: "4px 0", fontSize: 13 }}>{n.message}</p>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#647083" }}>{new Date(n.createdAt).toLocaleString("vi-VN")}</span>
                  {n.status === "UNREAD" && <button onClick={() => void handleMarkRead(n.id)} style={{ fontSize: 12, padding: "4px 8px" }}>Đã đọc</button>}
                </div>
              </div>
            ))}
            <button onClick={() => void loadNotifications()} style={{ marginTop: 8, width: "100%" }}>Tải thông báo</button>
          </div>
        </aside>
      </section>

      {/* RECORD-005: Medical Record Form for DOCTOR */}
      {(role === "DOCTOR" || role === "ADMIN") && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Medical Record Service</p>
              <h2>Lập / Cập nhật kết quả khám</h2>
            </div>
            <button type="button" onClick={() => void loadRecords()} disabled={isRecordsLoading}>{isRecordsLoading ? "Đang tải..." : "Tải hồ sơ"}</button>
          </div>
          <p style={{ color: "#647083", fontSize: 14 }}>Chỉ tạo hồ sơ cho lịch hẹn đã CHECKED_IN. Sau khi lưu FINAL, hệ thống sẽ thử hoàn thành buổi khám (RECORD-007).</p>

          <form onSubmit={handleCreateRecord} style={{ display: "grid", gap: 12, marginTop: 16 }}>
            <label className="role-picker">
              Lịch hẹn (CHECKED_IN)
              <select value={selectedAppointmentId} onChange={(e) => setSelectedAppointmentId(e.target.value)}>
                <option value="">-- Chọn lịch hẹn --</option>
                {checkedInAppointments.map((a) => (
                  <option key={a.id} value={a.id}>{a.patientId} — {new Date(a.scheduledStartAt).toLocaleString("vi-VN")} ({a.status})</option>
                ))}
              </select>
            </label>
            {checkedInAppointments.length === 0 && <span style={{ color: "#b42318", fontSize: 13 }}>Không có lịch CHECKED_IN. Vui lòng check-in trước.</span>}

            <label className="role-picker">Triệu chứng <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Đau đầu, sốt..." rows={2} style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: 10 }} /></label>
            <label className="role-picker">Chẩn đoán <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Chẩn đoán..." rows={2} style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: 10 }} /></label>
            <label className="role-picker">Ghi chú <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ghi chú bác sĩ..." rows={2} style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: 10 }} /></label>
            <label className="role-picker">Kế hoạch điều trị <textarea value={treatmentPlan} onChange={(e) => setTreatmentPlan(e.target.value)} placeholder="Điều trị..." rows={2} style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: 10 }} /></label>

            <div>
              <p className="eyebrow">Đơn thuốc</p>
              {prescription.map((item, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 8 }}>
                  <input placeholder="Tên thuốc" value={item.medicineName} onChange={(e) => setPrescription((prev) => prev.map((p, i) => i === idx ? { ...p, medicineName: e.target.value } : p))} style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: 8 }} />
                  <input placeholder="Liều" value={item.dosage} onChange={(e) => setPrescription((prev) => prev.map((p, i) => i === idx ? { ...p, dosage: e.target.value } : p))} style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: 8 }} />
                  <input placeholder="Tần suất" value={item.frequency} onChange={(e) => setPrescription((prev) => prev.map((p, i) => i === idx ? { ...p, frequency: e.target.value } : p))} style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: 8 }} />
                  <input placeholder="Thời gian" value={item.duration} onChange={(e) => setPrescription((prev) => prev.map((p, i) => i === idx ? { ...p, duration: e.target.value } : p))} style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: 8 }} />
                  <button type="button" onClick={() => setPrescription((prev) => prev.filter((_, i) => i !== idx))}>Xóa</button>
                </div>
              ))}
              <button type="button" onClick={() => setPrescription((prev) => [...prev, { medicineName: "", dosage: "", frequency: "", duration: "" }])}>+ Thêm thuốc</button>
            </div>

            <label className="role-picker">Trạng thái
              <select value={recordStatus} onChange={(e) => setRecordStatus(e.target.value as "DRAFT" | "FINAL")}>
                <option value="FINAL">FINAL</option>
                <option value="DRAFT">DRAFT</option>
              </select>
            </label>

            <button type="submit" disabled={isSubmitting} style={{ background: "#0F766E", color: "#fff", opacity: isSubmitting ? 0.6 : 1 }}>{isSubmitting ? "Đang lưu..." : "Lưu hồ sơ khám"}</button>
          </form>

          <div style={{ marginTop: 20 }}>
            <h3 style={{ margin: "0 0 8px" }}>Hồ sơ gần đây</h3>
            {records.length === 0 && !isRecordsLoading && <p>Chưa có hồ sơ.</p>}
            {records.map((r) => (
              <article key={r.id} style={{ borderTop: "1px solid #e5e9f0", padding: "12px 0" }}>
                <strong>{r.diagnosis || "Chưa có chẩn đoán"} </strong> <span style={{ color: "#647083", fontSize: 12 }}>({r.status})</span>
                <div style={{ fontSize: 13, color: "#334155" }}>BN: {r.patientId} • {new Date(r.createdAt).toLocaleString("vi-VN")}</div>
                {r.prescription.length > 0 && <div style={{ fontSize: 13 }}>Đơn: {r.prescription.map((p) => p.medicineName).join(", ")}</div>}
                <details style={{ marginTop: 6 }}><summary>Xem chi tiết</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#f8fafc", padding: 8, borderRadius: 6 }}>{JSON.stringify(r, null, 2)}</pre></details>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* NOTIFY-005: Notification Center expanded */}
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading">
          <div><p className="eyebrow">Notification Service</p><h2>Thông báo</h2></div>
          <button type="button" onClick={() => void loadNotifications()} disabled={isNotifLoading}>{isNotifLoading ? "Đang tải..." : "Làm mới"}</button>
        </div>
        {notifications.length === 0 && !isNotifLoading && <p>Chưa có thông báo.</p>}
        {notifications.map((n) => (
          <article key={n.id} style={{ borderTop: "1px solid #e5e9f0", padding: "12px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
            <div>
              <strong style={{ opacity: n.status === "UNREAD" ? 1 : 0.7 }}>{n.title} {n.status === "UNREAD" && <span style={{ background: "#0F766E", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 10 }}>UNREAD</span>}</strong>
              <p style={{ margin: "4px 0", fontSize: 14 }}>{n.message}</p>
              <span style={{ fontSize: 12, color: "#647083" }}>{new Date(n.createdAt).toLocaleString("vi-VN")} • {n.type}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {n.status === "UNREAD" && <button onClick={() => void handleMarkRead(n.id)}>Đánh dấu đã đọc</button>}
            </div>
          </article>
        ))}
      </section>

      {message && <p className="message" role="status">{message}</p>}
    </main>
  );
}
