"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, PermissionDeniedState, SkeletonPage } from "../../components/states";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { ApiClientError, createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import { AppointmentSelector, type AppointmentOption } from "./appointment-selector";
import { PrescriptionForm, type PrescriptionItem, type PrescriptionItemErrors } from "./prescription-form";
import { PageHeader } from "../../components/page-header";
import styles from "./medical-records-panel.module.css";

export interface MedicalRecordItem {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  symptoms?: string;
  diagnosis?: string;
  notes?: string;
  treatmentPlan?: string;
  prescription: PrescriptionItem[];
  status: "DRAFT" | "FINAL";
  createdAt: string;
}

function formatPatientDisplayName(patientId: string, fullName?: string): string {
  if (fullName && fullName.trim()) {
    return fullName.trim();
  }
  const clean = patientId.replace(/-/g, "");
  return `Bệnh nhân #${clean.length >= 4 ? clean.slice(-4) : clean}`;
}

export function MedicalRecordsPanel() {
  const session = useSession();
  const client = useMemo(() => createBrowserApiClient(session), [session]);

  const [appointments, setAppointments] = useState<AppointmentOption[]>([]);
  const [records, setRecords] = useState<MedicalRecordItem[]>([]);
  const [patientNames, setPatientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<ApiClientError | null>(null);

  // Form State
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [prescription, setPrescription] = useState<PrescriptionItem[]>([
    { medicineName: "", dosage: "", frequency: "", duration: "" },
  ]);
  const [recordStatus, setRecordStatus] = useState<"DRAFT" | "FINAL">("FINAL");
  const [submitting, setSubmitting] = useState(false);

  // Status & Validation Alerts
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [appointmentError, setAppointmentError] = useState<string | null>(null);
  const [prescriptionErrors, setPrescriptionErrors] = useState<Record<number, PrescriptionItemErrors>>({});
  const [hasValidationSummary, setHasValidationSummary] = useState(false);

  // URL Target Record ID
  const [targetRecordId, setTargetRecordId] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setTargetRecordId(new URLSearchParams(window.location.search).get("recordId") ?? "");
    }
  }, []);

  // Fetch patient name for an appointment
  const resolvePatientName = useCallback(
    async (patientId: string, appointmentId: string) => {
      if (patientNames[patientId]) return;
      try {
        const res = await client.get<{ fullName?: string; full_name?: string }>(
          `/api/v1/patients/${encodeURIComponent(patientId)}`,
          { query: { appointmentId } }
        );
        const name = res.data?.fullName || res.data?.full_name;
        if (name) {
          setPatientNames((prev) => ({ ...prev, [patientId]: name }));
        }
      } catch {
        // Fallback silently to masked ID
      }
    },
    [client, patientNames]
  );

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const result = await client.get<{ items: AppointmentOption[] }>("/api/v1/appointments");
      const items = result.data.items || [];
      setAppointments(items);

      // Resolve patient names for checked-in appointments
      const checkedIn = items.filter((a) => a.status === "CHECKED_IN");
      for (const appt of checkedIn) {
        void resolvePatientName(appt.patientId, appt.id);
      }
    } catch (caught) {
      setFetchError(
        caught instanceof ApiClientError
          ? caught
          : new ApiClientError("Không thể tải danh sách lịch hẹn.", 0, "UNKNOWN_ERROR")
      );
    } finally {
      setLoading(false);
    }
  }, [client, resolvePatientName]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const result = await client.get<{ items: MedicalRecordItem[] }>("/api/v1/medical-records", {
        query: { page: 1, limit: 20 },
      });
      const items = result.data.items || [];
      setRecords(items);

      // Resolve names for patient history
      for (const rec of items) {
        if (rec.patientId && rec.appointmentId) {
          void resolvePatientName(rec.patientId, rec.appointmentId);
        }
      }
    } catch {
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  }, [client, resolvePatientName]);

  useEffect(() => {
    if (session.status === "authenticated") {
      void loadAppointments();
      void loadRecords();
    }
  }, [session.status, loadAppointments, loadRecords]);

  const resetForm = () => {
    setEditingRecordId(null);
    setSelectedAppointmentId("");
    setSymptoms("");
    setDiagnosis("");
    setNotes("");
    setTreatmentPlan("");
    setPrescription([{ medicineName: "", dosage: "", frequency: "", duration: "" }]);
    setRecordStatus("FINAL");
    setAppointmentError(null);
    setPrescriptionErrors({});
    setHasValidationSummary(false);
  };

  const handleEditRecord = (record: MedicalRecordItem) => {
    setEditingRecordId(record.id);
    setSelectedAppointmentId(record.appointmentId);
    setSymptoms(record.symptoms ?? "");
    setDiagnosis(record.diagnosis ?? "");
    setNotes(record.notes ?? "");
    setTreatmentPlan(record.treatmentPlan ?? "");
    setPrescription(
      record.prescription.length > 0
        ? record.prescription
        : [{ medicineName: "", dosage: "", frequency: "", duration: "" }]
    );
    setRecordStatus(record.status);
    setSuccessMessage(null);
    setServerError(null);
    setAppointmentError(null);
    setPrescriptionErrors({});
    setHasValidationSummary(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setServerError(null);
    setAppointmentError(null);
    setPrescriptionErrors({});
    setHasValidationSummary(false);

    let hasError = false;

    // Validate appointment selection if creating new
    if (!editingRecordId && !selectedAppointmentId) {
      setAppointmentError("Vui lòng chọn một lịch hẹn đã tiếp nhận (CHECKED_IN)");
      hasError = true;
    }

    const appt = appointments.find((a) => a.id === selectedAppointmentId);
    if (!editingRecordId && selectedAppointmentId && !appt) {
      setAppointmentError("Không tìm thấy thông tin lịch hẹn đã chọn");
      hasError = true;
    }

    // Validate prescription rows
    const rowErrors: Record<number, PrescriptionItemErrors> = {};
    const filteredPrescriptions = prescription.filter((p) => p.medicineName.trim() !== "");

    prescription.forEach((p, index) => {
      const hasAnyField = p.medicineName.trim() || p.dosage.trim() || p.frequency.trim() || p.duration.trim();
      if (hasAnyField) {
        const itemError: PrescriptionItemErrors = {};
        if (!p.medicineName.trim()) itemError.medicineName = "Thiếu tên thuốc";
        if (!p.dosage.trim()) itemError.dosage = "Thiếu liều lượng";
        if (!p.frequency.trim()) itemError.frequency = "Thiếu tần suất";
        if (!p.duration.trim()) itemError.duration = "Thiếu thời gian";

        if (Object.keys(itemError).length > 0) {
          rowErrors[index] = itemError;
          hasError = true;
        }
      }
    });

    if (hasError) {
      setPrescriptionErrors(rowErrors);
      setHasValidationSummary(true);
      return;
    }

    setSubmitting(true);
    try {
      const clinicalBody = {
        symptoms: symptoms.trim() || undefined,
        diagnosis: diagnosis.trim() || undefined,
        notes: notes.trim() || undefined,
        treatmentPlan: treatmentPlan.trim() || undefined,
        prescription: filteredPrescriptions,
        status: recordStatus,
      };

      if (editingRecordId) {
        await client.patch(`/api/v1/medical-records/${encodeURIComponent(editingRecordId)}`, {
          body: clinicalBody,
        });
        setSuccessMessage("Đã cập nhật hồ sơ khám bệnh thành công.");
      } else if (appt) {
        await client.post("/api/v1/medical-records", {
          body: {
            appointmentId: selectedAppointmentId,
            patientId: appt.patientId,
            doctorId: appt.doctorId,
            ...clinicalBody,
          },
        });
        setSuccessMessage("Đã tạo mới và lưu hồ sơ khám bệnh thành công.");
      }

      resetForm();
      await loadRecords();
    } catch (caught) {
      setServerError(
        caught instanceof ApiClientError
          ? caught.message
          : caught instanceof Error
          ? caught.message
          : "Không thể lưu hồ sơ khám bệnh. Vui lòng thử lại."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Auth / Permission Verification
  if (session.status === "loading") {
    return (
      <section className="page-stack" aria-busy="true">
        <PageHeader pathname="/medical-records" />
        <div className={styles.panel}>
          <Skeleton height={24} width="40%" className={styles.fieldGroup} />
          <div style={{ marginTop: 16 }}>
            <Skeleton height={42} width="100%" />
          </div>
          <div style={{ marginTop: 16 }}>
            <Skeleton height={80} width="100%" />
          </div>
          <div style={{ marginTop: 16 }}>
            <Skeleton height={120} width="100%" />
          </div>
        </div>
      </section>
    );
  }

  const userRole = session.identity?.role;
  if (session.status !== "authenticated" || (userRole !== "DOCTOR" && userRole !== "ADMIN")) {
    return (
      <PermissionDeniedState
        title="Không có quyền truy cập hồ sơ khám"
        message="Chỉ bác sĩ được phân công hoặc quản trị viên mới có quyền lập và quản lý bệnh án khám bệnh."
        action={{ label: "Về trang chủ", href: "/" }}
      />
    );
  }

  if (loading) {
    return (
      <section className="page-stack">
        <PageHeader pathname="/medical-records" />
        <div className={styles.panel}>
          <Skeleton height={24} width="40%" className={styles.fieldGroup} />
          <div style={{ marginTop: 16 }}>
            <Skeleton height={42} width="100%" />
          </div>
          <div style={{ marginTop: 16 }}>
            <Skeleton height={80} width="100%" />
          </div>
          <div style={{ marginTop: 16 }}>
            <Skeleton height={120} width="100%" />
          </div>
        </div>
      </section>
    );
  }

  if (fetchError) {
    return (
      <ErrorState
        message={fetchError.message}
        requestId={fetchError.requestId}
        onRetry={() => void loadAppointments()}
      />
    );
  }

  const checkedInCount = appointments.filter((a) => a.status === "CHECKED_IN").length;

  return (
    <section className="page-stack">
      <PageHeader pathname="/medical-records" />

      {/* Top Notification Alerts */}
      {successMessage && (
        <Alert variant="success" title="Thành công" onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {serverError && (
        <Alert variant="danger" title="Lỗi hệ thống" onClose={() => setServerError(null)}>
          {serverError}
        </Alert>
      )}

      {hasValidationSummary && (
        <Alert variant="warning" title="Dữ liệu chưa hoàn thiện" onClose={() => setHasValidationSummary(false)}>
          Vui lòng kiểm tra và điền đầy đủ các thông tin bắt buộc được đánh dấu đỏ bên dưới.
        </Alert>
      )}

      {/* Main Clinical Record Form */}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>
              {editingRecordId ? "Cập nhật kết quả khám" : "Lập hồ sơ khám bệnh mới"}
            </h2>
            <p className={styles.panelSubtitle}>
              {editingRecordId
                ? "Chỉnh sửa thông tin bệnh án đã lưu"
                : "Chọn lịch hẹn đã check-in để bắt đầu khám và lưu kết quả"}
            </p>
          </div>
          {editingRecordId && (
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              Hủy chỉnh sửa
            </Button>
          )}
        </div>

        <form onSubmit={handleSubmit} className={styles.formGrid}>
          {/* Appointment Selector */}
          <AppointmentSelector
            appointments={appointments}
            selectedAppointmentId={selectedAppointmentId}
            disabled={editingRecordId !== null || submitting}
            patientNames={patientNames}
            error={appointmentError}
            onSelect={(id) => {
              setSelectedAppointmentId(id);
              if (appointmentError) setAppointmentError(null);
            }}
          />

          {/* Clinical Symptoms */}
          <div className={styles.fieldGroup}>
            <label htmlFor="symptoms-input" className={styles.fieldLabel}>
              Triệu chứng lâm sàng
            </label>
            <textarea
              id="symptoms-input"
              className={styles.textarea}
              placeholder="Mô tả triệu chứng bệnh nhân phản ánh (ví dụ: Đau đầu, sốt 38.5 độ C kéo dài 2 ngày...)"
              rows={2}
              value={symptoms}
              disabled={submitting}
              readOnly={submitting}
              onChange={(e) => setSymptoms(e.target.value)}
            />
          </div>

          {/* Clinical Diagnosis */}
          <div className={styles.fieldGroup}>
            <label htmlFor="diagnosis-input" className={styles.fieldLabel}>
              Chẩn đoán sơ bộ / xác định
            </label>
            <textarea
              id="diagnosis-input"
              className={styles.textarea}
              placeholder="Chẩn đoán bệnh lý của bác sĩ..."
              rows={2}
              value={diagnosis}
              disabled={submitting}
              readOnly={submitting}
              onChange={(e) => setDiagnosis(e.target.value)}
            />
          </div>

          {/* Doctor Notes */}
          <div className={styles.fieldGroup}>
            <label htmlFor="notes-input" className={styles.fieldLabel}>
              Ghi chú bác sĩ & Lời dặn
            </label>
            <textarea
              id="notes-input"
              className={styles.textarea}
              placeholder="Ghi chú thêm về tiền sử dị ứng, dặn dò tái khám..."
              rows={2}
              value={notes}
              disabled={submitting}
              readOnly={submitting}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Treatment Plan */}
          <div className={styles.fieldGroup}>
            <label htmlFor="treatment-input" className={styles.fieldLabel}>
              Kế hoạch điều trị
            </label>
            <textarea
              id="treatment-input"
              className={styles.textarea}
              placeholder="Hướng can thiệp y khoa, chăm sóc dinh dưỡng, nghỉ ngơi..."
              rows={2}
              value={treatmentPlan}
              disabled={submitting}
              readOnly={submitting}
              onChange={(e) => setTreatmentPlan(e.target.value)}
            />
          </div>

          {/* Prescription Sub-Form */}
          <PrescriptionForm
            items={prescription}
            disabled={submitting}
            errors={prescriptionErrors}
            onChange={(items) => {
              setPrescription(items);
              if (hasValidationSummary) setHasValidationSummary(false);
            }}
          />

          {/* Record Status (DRAFT vs FINAL) */}
          <div className={styles.fieldGroup}>
            <label htmlFor="status-select" className={styles.fieldLabel}>
              Trạng thái hồ sơ bệnh án
            </label>
            <select
              id="status-select"
              className={styles.select}
              value={recordStatus}
              disabled={submitting}
              onChange={(e) => setRecordStatus(e.target.value as "DRAFT" | "FINAL")}
            >
              <option value="FINAL">FINAL (Chốt bệnh án & hoàn tất lượt khám)</option>
              <option value="DRAFT">DRAFT (Lưu nháp tạm thời, có thể sửa sau)</option>
            </select>
            <span className={styles.fieldHelp}>
              {recordStatus === "FINAL"
                ? "Lưu ý: Khi chọn FINAL, ca khám sẽ được đánh dấu hoàn thành và kích hoạt outbox event."
                : "Hồ sơ ở dạng DRAFT sẽ cho phép bác sĩ cập nhật lại trước khi chốt chính thức."}
            </span>
          </div>

          {/* Form Actions */}
          <div className={styles.formActions}>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={submitting || (!editingRecordId && checkedInCount === 0)}
            >
              {submitting ? "Đang lưu..." : editingRecordId ? "Cập nhật hồ sơ" : "Lưu hồ sơ khám"}
            </Button>
          </div>
        </form>
      </section>

      {/* History Records Section */}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>Hồ sơ bệnh án gần đây</h2>
            <p className={styles.panelSubtitle}>Danh sách các ca khám đã ghi nhận trong hệ thống</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void loadRecords()}
            loading={recordsLoading}
          >
            Làm mới
          </Button>
        </div>

        {records.length === 0 && !recordsLoading ? (
          <EmptyState
            title="Chưa có hồ sơ khám bệnh nào"
            message="Các kết quả khám sau khi bác sĩ chốt sẽ xuất hiện tại đây."
            action={{ label: "Tải lại danh sách", onClick: () => void loadRecords() }}
          />
        ) : (
          <div className={styles.historyList}>
            {records.map((rec) => {
              const patientDisplay = formatPatientDisplayName(rec.patientId, patientNames[rec.patientId]);
              const formattedDate = new Date(rec.createdAt).toLocaleString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              });

              return (
                <article key={rec.id} className={styles.recordCard}>
                  <div className={styles.recordHeader}>
                    <div>
                      <h3 className={styles.recordDiagnosis}>{rec.diagnosis || "Chưa ghi nhận chẩn đoán"}</h3>
                      <div className={styles.recordMeta}>
                        <span>{patientDisplay}</span>
                        <span>•</span>
                        <span>{formattedDate}</span>
                      </div>
                    </div>
                    <div>
                      <Badge variant={rec.status === "FINAL" ? "success" : "warning"}>
                        {rec.status === "FINAL" ? "Đã chốt (FINAL)" : "Bản nháp (DRAFT)"}
                      </Badge>
                    </div>
                  </div>

                  {rec.prescription && rec.prescription.length > 0 && (
                    <div className={styles.prescriptionTagList}>
                      <span style={{ fontSize: "0.8125rem", color: "var(--muted)", alignSelf: "center" }}>
                        Đơn thuốc:
                      </span>
                      {rec.prescription.map((p, idx) => (
                        <span key={idx} className={styles.prescriptionTag}>
                          {p.medicineName} ({p.dosage})
                        </span>
                      ))}
                    </div>
                  )}

                  <details className={styles.recordDetails} open={targetRecordId === rec.id}>
                    <summary>Xem chi tiết bệnh án</summary>
                    <div className={styles.recordDetailContent}>
                      {rec.symptoms && (
                        <p className={styles.recordDetailItem}>
                          <strong>Triệu chứng:</strong> {rec.symptoms}
                        </p>
                      )}
                      {rec.notes && (
                        <p className={styles.recordDetailItem}>
                          <strong>Ghi chú:</strong> {rec.notes}
                        </p>
                      )}
                      {rec.treatmentPlan && (
                        <p className={styles.recordDetailItem}>
                          <strong>Kế hoạch điều trị:</strong> {rec.treatmentPlan}
                        </p>
                      )}
                      {rec.prescription && rec.prescription.length > 0 && (
                        <div className={styles.recordDetailItem}>
                          <strong>Chi tiết đơn thuốc:</strong>
                          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                            {rec.prescription.map((p, pIdx) => (
                              <li key={pIdx}>
                                {p.medicineName}: {p.dosage}, {p.frequency}, {p.duration}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>

                  <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditRecord(rec)}
                    >
                      Cập nhật hồ sơ
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
