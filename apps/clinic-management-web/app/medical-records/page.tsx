"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../src/components/states";
import { ApiClientError, createBrowserApiClient } from "../../src/lib/api/client";
import { useSession } from "../../src/lib/session/session-context";

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

export default function MedicalRecordsPage() {
  const session = useSession();
  const client = useMemo(() => createBrowserApiClient(session), [session]);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);

  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [prescription, setPrescription] = useState([{ medicineName: "", dosage: "", frequency: "", duration: "" }]);
  const [recordStatus, setRecordStatus] = useState<"DRAFT" | "FINAL">("FINAL");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.get<{ items: Appointment[] }>("/api/v1/appointments");
      setAppointments(result.data.items);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught : new ApiClientError("Không thể tải lịch hẹn.", 0, "UNKNOWN_ERROR"));
    } finally {
      setLoading(false);
    }
  }, [client]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const q = session.status === "authenticated" && session.identity?.role === "DOCTOR"
        ? { doctorId: session.identity.id, page: 1, limit: 20 }
        : { page: 1, limit: 20 };
      const result = await client.get<{ items: MedicalRecord[] }>("/api/v1/medical-records", { query: q as Record<string, string | number> });
      setRecords(result.data.items);
    } catch {
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  }, [client, session]);

  useEffect(() => {
    if (session.status === "authenticated") {
      void loadAppointments();
      void loadRecords();
    }
  }, [session.status, loadAppointments, loadRecords]);

  const checkedInAppointments = appointments.filter((a) => a.status === "CHECKED_IN");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAppointmentId) {
      setMessage("Vui lòng chọn lịch hẹn đã check-in");
      return;
    }
    const appt = appointments.find((a) => a.id === selectedAppointmentId);
    if (!appt) {
      setMessage("Không tìm thấy lịch hẹn");
      return;
    }
    if (appt.status !== "CHECKED_IN" && appt.status !== "COMPLETED") {
      setMessage("Chỉ tạo hồ sơ cho lịch đã CHECKED_IN");
      return;
    }
    setSubmitting(true);
    try {
      const filteredPres = prescription.filter((p) => p.medicineName.trim() !== "");
      if (filteredPres.some((p) => !p.dosage || !p.frequency || !p.duration)) {
        throw new Error("Vui lòng điền đầy đủ liều dùng/tần suất/thời gian cho mỗi thuốc");
      }
      await client.post("/api/v1/medical-records", {
        body: {
          appointmentId: selectedAppointmentId,
          patientId: appt.patientId,
          doctorId: appt.doctorId,
          symptoms: symptoms || undefined,
          diagnosis: diagnosis || undefined,
          notes: notes || undefined,
          treatmentPlan: treatmentPlan || undefined,
          prescription: filteredPres,
          status: recordStatus
        }
      });
      setMessage("Đã lưu hồ sơ khám thành công");
      setSymptoms("");
      setDiagnosis("");
      setNotes("");
      setTreatmentPlan("");
      setPrescription([{ medicineName: "", dosage: "", frequency: "", duration: "" }]);
      await loadRecords();
    } catch (caught) {
      setMessage(caught instanceof ApiClientError ? caught.message : caught instanceof Error ? caught.message : "Không thể lưu hồ sơ khám");
    } finally {
      setSubmitting(false);
    }
  }

  if (session.status === "loading") return <LoadingState message="Đang kiểm tra phiên..." />;
  if (session.status !== "authenticated" || (session.identity?.role !== "DOCTOR" && session.identity?.role !== "ADMIN")) {
    return <ErrorState message="Chỉ bác sĩ hoặc quản trị viên mới được lập hồ sơ khám." />;
  }
  if (loading) return <LoadingState message="Đang tải lịch hẹn..." />;
  if (error) return <ErrorState message={error.message} requestId={error.requestId} onRetry={() => void loadAppointments()} />;

  return (
    <section className="page-stack">
      <header className="page-heading">
        <p className="eyebrow">Medical Record Service</p>
        <h1>Hồ sơ khám</h1>
        <p>Chỉ tạo hồ sơ cho lịch hẹn đã CHECKED_IN. Sau khi lưu FINAL, hệ thống sẽ thử hoàn thành buổi khám (RECORD-007).</p>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <h2>Lập / Cập nhật kết quả khám</h2>
          <button type="button" onClick={() => void loadRecords()} disabled={recordsLoading}>{recordsLoading ? "Đang tải..." : "Tải hồ sơ"}</button>
        </div>
        <form onSubmit={handleCreate} style={{ display: "grid", gap: 12, marginTop: 16 }}>
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
          <button type="submit" disabled={submitting} style={{ background: "#0F766E", color: "#fff", opacity: submitting ? 0.6 : 1 }}>{submitting ? "Đang lưu..." : "Lưu hồ sơ khám"}</button>
        </form>
        {message && <p className="message" role="status">{message}</p>}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Hồ sơ gần đây</h2>
        {records.length === 0 && !recordsLoading && <EmptyState title="Chưa có hồ sơ" message="Chưa có hồ sơ khám nào được tạo." />}
        {records.map((r) => (
          <article key={r.id} style={{ borderTop: "1px solid #e5e9f0", padding: "12px 0" }}>
            <strong>{r.diagnosis || "Chưa có chẩn đoán"} </strong> <span style={{ color: "#647083", fontSize: 12 }}>({r.status})</span>
            <div style={{ fontSize: 13, color: "#334155" }}>BN: {r.patientId} • {new Date(r.createdAt).toLocaleString("vi-VN")}</div>
            {r.prescription.length > 0 && <div style={{ fontSize: 13 }}>Đơn: {r.prescription.map((p) => p.medicineName).join(", ")}</div>}
          </article>
        ))}
      </section>
    </section>
  );
}
