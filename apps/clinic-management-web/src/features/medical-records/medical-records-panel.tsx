"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, PermissionDeniedState } from "../../components/states";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ConfirmModal } from "../../components/ui/confirm-modal";
import { Skeleton } from "../../components/ui/skeleton";
import { ApiClientError, createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import { formatVietnamDateTime } from "../../lib/formatting/date-time";
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

export interface PatientDetails {
  id: string;
  userId?: string;
  fullName?: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  insuranceNumber?: string;
  emergencyContact?: string;
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
  const [patientProfiles, setPatientProfiles] = useState<Record<string, PatientDetails>>({});
  const [patientNames, setPatientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsFetched, setRecordsFetched] = useState(false);
  const [patientLoading, setPatientLoading] = useState(false);
  const [fetchError, setFetchError] = useState<ApiClientError | null>(null);
  const [recordsError, setRecordsError] = useState<ApiClientError | null>(null);

  // Form State
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [isRecordFinalized, setIsRecordFinalized] = useState(false);
  const [symptoms, setSymptoms] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [prescription, setPrescription] = useState<PrescriptionItem[]>([
    { medicineName: "", dosage: "", frequency: "", duration: "" },
  ]);
  const [recordStatus, setRecordStatus] = useState<"DRAFT" | "FINAL">("DRAFT");
  const [submitting, setSubmitting] = useState(false);
  const [isConfirmFinalOpen, setIsConfirmFinalOpen] = useState(false);
  const [lastAttemptedStatus, setLastAttemptedStatus] = useState<"DRAFT" | "FINAL">("FINAL");

  // Status & Validation Alerts
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [appointmentError, setAppointmentError] = useState<string | null>(null);
  const [prescriptionErrors, setPrescriptionErrors] = useState<Record<number, PrescriptionItemErrors>>({});
  const [hasValidationSummary, setHasValidationSummary] = useState(false);

  // URL Query Parameters
  const [targetRecordId, setTargetRecordId] = useState("");
  const [initialApptFromUrl, setInitialApptFromUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlRecordId = params.get("recordId");
      const urlApptId = params.get("appointmentId");
      if (urlRecordId) {
        setTargetRecordId(urlRecordId);
      }
      if (urlApptId) {
        setInitialApptFromUrl(urlApptId);
        setSelectedAppointmentId(urlApptId);
      }
    }
  }, []);

  const isDoctor = session.status === "authenticated" && session.identity?.role === "DOCTOR";

  // Fetch patient profile for an appointment
  const resolvePatientDetails = useCallback(
    async (patientId: string, appointmentId: string) => {
      if (patientProfiles[patientId]) return;
      try {
        setPatientLoading(true);
        const res = await client.get<PatientDetails>(
          `/api/v1/patients/${encodeURIComponent(patientId)}`,
          { query: { appointmentId } }
        );
        if (res.data) {
          setPatientProfiles((prev) => ({ ...prev, [patientId]: res.data }));
          const name = res.data.fullName;
          if (name) {
            setPatientNames((prev) => ({ ...prev, [patientId]: name }));
          }
        }
      } catch {
        // Fallback silently to masked ID
      } finally {
        setPatientLoading(false);
      }
    },
    [client, patientProfiles]
  );

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const result = await client.get<{ items: AppointmentOption[] }>("/api/v1/appointments");
      const items = result.data.items || [];
      setAppointments(items);

      // Resolve patient profiles for checked-in appointments
      const checkedIn = items.filter((a) => a.status === "CHECKED_IN");
      for (const appt of checkedIn) {
        void resolvePatientDetails(appt.patientId, appt.id);
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
  }, [client, resolvePatientDetails]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      const result = await client.get<{ items: MedicalRecordItem[] }>("/api/v1/medical-records", {
        query: { page: 1, limit: 20 },
      });
      const items = result.data.items || [];
      setRecords(items);
      setRecordsFetched(true);

      // Resolve patient profiles for records
      for (const rec of items) {
        if (rec.patientId && rec.appointmentId) {
          void resolvePatientDetails(rec.patientId, rec.appointmentId);
        }
      }
    } catch (caught) {
      setRecordsError(
        caught instanceof ApiClientError
          ? caught
          : new ApiClientError("Không thể tải danh sách hồ sơ khám.", 0, "UNKNOWN_ERROR")
      );
    } finally {
      setRecordsLoading(false);
    }
  }, [client, resolvePatientDetails]);

  // Only call APIs when authenticated as DOCTOR
  useEffect(() => {
    if (isDoctor) {
      void loadAppointments();
      void loadRecords();
    }
  }, [isDoctor, loadAppointments, loadRecords]);

  // When initial appointment from URL or records load, see if there is an existing record
  useEffect(() => {
    if (!selectedAppointmentId || records.length === 0) return;
    const existing = records.find((r) => r.appointmentId === selectedAppointmentId);
    if (existing && !editingRecordId) {
      setEditingRecordId(existing.id);
      setSymptoms(existing.symptoms ?? "");
      setDiagnosis(existing.diagnosis ?? "");
      setNotes(existing.notes ?? "");
      setTreatmentPlan(existing.treatmentPlan ?? "");
      setPrescription(
        existing.prescription && existing.prescription.length > 0
          ? existing.prescription
          : [{ medicineName: "", dosage: "", frequency: "", duration: "" }]
      );
      setRecordStatus(existing.status);
      setIsRecordFinalized(existing.status === "FINAL");
    }
  }, [selectedAppointmentId, records, editingRecordId]);

  // Auto-load record if targetRecordId is provided in URL
  useEffect(() => {
    if (!targetRecordId || records.length === 0) return;
    const target = records.find((r) => r.id === targetRecordId);
    if (target && editingRecordId !== target.id) {
      setEditingRecordId(target.id);
      setSelectedAppointmentId(target.appointmentId);
      setSymptoms(target.symptoms ?? "");
      setDiagnosis(target.diagnosis ?? "");
      setNotes(target.notes ?? "");
      setTreatmentPlan(target.treatmentPlan ?? "");
      setPrescription(
        target.prescription && target.prescription.length > 0
          ? target.prescription
          : [{ medicineName: "", dosage: "", frequency: "", duration: "" }]
      );
      setRecordStatus(target.status);
      setIsRecordFinalized(target.status === "FINAL");
    }
  }, [targetRecordId, records, editingRecordId]);

  // When doctor selects an appointment, trigger patient details lookup
  useEffect(() => {
    if (!selectedAppointmentId || appointments.length === 0) return;
    const appt = appointments.find((a) => a.id === selectedAppointmentId);
    if (appt) {
      void resolvePatientDetails(appt.patientId, appt.id);
    }
  }, [selectedAppointmentId, appointments, resolvePatientDetails]);

  const resetForm = () => {
    setEditingRecordId(null);
    setIsRecordFinalized(false);
    setSelectedAppointmentId("");
    setSymptoms("");
    setDiagnosis("");
    setNotes("");
    setTreatmentPlan("");
    setPrescription([{ medicineName: "", dosage: "", frequency: "", duration: "" }]);
    setRecordStatus("DRAFT");
    setAppointmentError(null);
    setPrescriptionErrors({});
    setHasValidationSummary(false);
    setSuccessMessage(null);
    setServerError(null);
  };

  const handleEditRecord = (record: MedicalRecordItem) => {
    setEditingRecordId(record.id);
    setSelectedAppointmentId(record.appointmentId);
    setSymptoms(record.symptoms ?? "");
    setDiagnosis(record.diagnosis ?? "");
    setNotes(record.notes ?? "");
    setTreatmentPlan(record.treatmentPlan ?? "");
    setPrescription(
      record.prescription && record.prescription.length > 0
        ? record.prescription
        : [{ medicineName: "", dosage: "", frequency: "", duration: "" }]
    );
    setRecordStatus(record.status);
    setIsRecordFinalized(record.status === "FINAL");
    setSuccessMessage(null);
    setServerError(null);
    setAppointmentError(null);
    setPrescriptionErrors({});
    setHasValidationSummary(false);

    const appt = appointments.find((a) => a.id === record.appointmentId);
    if (appt) {
      void resolvePatientDetails(appt.patientId, appt.id);
    } else if (record.patientId) {
      void resolvePatientDetails(record.patientId, record.appointmentId);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const validateForm = (isFinal: boolean): boolean => {
    let hasError = false;

    // Validate appointment selection
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
      return false;
    }

    return true;
  };

  const handleSaveDraft = async () => {
    setSuccessMessage(null);
    setServerError(null);
    setAppointmentError(null);
    setPrescriptionErrors({});
    setHasValidationSummary(false);
    setLastAttemptedStatus("DRAFT");

    if (!validateForm(false)) return;

    await executeSubmit("DRAFT");
  };

  const handleRequestFinal = () => {
    setSuccessMessage(null);
    setServerError(null);
    setAppointmentError(null);
    setPrescriptionErrors({});
    setHasValidationSummary(false);
    setLastAttemptedStatus("FINAL");

    if (!validateForm(true)) return;

    // Open confirmation dialog before completing FINAL
    setIsConfirmFinalOpen(true);
  };

  const executeSubmit = async (targetStatus: "DRAFT" | "FINAL") => {
    const appt = appointments.find((a) => a.id === selectedAppointmentId);
    const filteredPrescriptions = prescription.filter((p) => p.medicineName.trim() !== "");

    setIsConfirmFinalOpen(false);
    setSubmitting(true);
    setServerError(null);

    try {
      const clinicalBody = {
        symptoms: symptoms.trim() || undefined,
        diagnosis: diagnosis.trim() || undefined,
        notes: notes.trim() || undefined,
        treatmentPlan: treatmentPlan.trim() || undefined,
        prescription: filteredPrescriptions,
        status: targetStatus,
      };

      if (editingRecordId) {
        await client.patch(`/api/v1/medical-records/${encodeURIComponent(editingRecordId)}`, {
          body: clinicalBody,
        });
      } else if (appt) {
        const createRes = await client.post<{ id?: string; data?: { id?: string } }>("/api/v1/medical-records", {
          body: {
            appointmentId: selectedAppointmentId,
            patientId: appt.patientId,
            doctorId: appt.doctorId,
            ...clinicalBody,
          },
        });
        const createdId = (createRes.data as { id?: string })?.id || (createRes as unknown as { id?: string })?.id;
        if (createdId) {
          setEditingRecordId(createdId);
        }
      }

      setRecordStatus(targetStatus);

      if (targetStatus === "FINAL") {
        // Form is locked (readonly) ONLY after server confirmation
        setIsRecordFinalized(true);
        setSuccessMessage(
          "Hồ sơ khám bệnh đã được chốt hoàn tất (FINAL). Ca khám đã hoàn thành và hồ sơ được chuyển sang trạng thái chỉ đọc."
        );
      } else {
        setIsRecordFinalized(false);
        setSuccessMessage(
          "Đã lưu nháp hồ sơ khám bệnh thành công. Bác sĩ có thể tiếp tục chỉnh sửa và chốt bệnh án khi hoàn thành ca khám."
        );
      }

      await loadRecords();
    } catch (caught) {
      // Preserve form data on error; form remains unlocked so doctor can fix or retry
      setServerError(
        caught instanceof ApiClientError
          ? caught.message
          : caught instanceof Error
          ? caught.message
          : "Không thể lưu hồ sơ khám bệnh. Dữ liệu đã nhập được giữ nguyên, vui lòng thử lại."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Auth / Role Guard
  if (session.status === "loading") {
    return (
      <section className="page-stack" aria-label="Đang nạp hồ sơ khám">
        <PageHeader pathname="/medical-records" />
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Lập hồ sơ khám bệnh mới</h2>
              <p className={styles.panelSubtitle}>Chọn lịch hẹn đã check-in để bắt đầu khám và lưu kết quả</p>
            </div>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup} aria-busy="true">
              <span className={styles.fieldLabel}>Lịch hẹn khám đã check-in</span>
              <Skeleton height={42} width="100%" />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="symptoms-input-loading" className={styles.fieldLabel}>
                Triệu chứng lâm sàng
              </label>
              <textarea
                id="symptoms-input-loading"
                className={styles.textarea}
                placeholder="Mô tả triệu chứng bệnh nhân phản ánh (ví dụ: Đau đầu, sốt 38.5 độ C kéo dài 2 ngày...)"
                rows={2}
                disabled
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="diagnosis-input-loading" className={styles.fieldLabel}>
                Chẩn đoán sơ bộ / xác định
              </label>
              <textarea
                id="diagnosis-input-loading"
                className={styles.textarea}
                placeholder="Chẩn đoán bệnh lý của bác sĩ..."
                rows={2}
                disabled
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="notes-input-loading" className={styles.fieldLabel}>
                Ghi chú bác sĩ & Lời dặn
              </label>
              <textarea
                id="notes-input-loading"
                className={styles.textarea}
                placeholder="Ghi chú thêm về tiền sử dị ứng, dặn dò tái khám..."
                rows={2}
                disabled
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="treatment-input-loading" className={styles.fieldLabel}>
                Kế hoạch điều trị
              </label>
              <textarea
                id="treatment-input-loading"
                className={styles.textarea}
                placeholder="Hướng can thiệp y khoa, chăm sóc dinh dưỡng, nghỉ ngơi..."
                rows={2}
                disabled
              />
            </div>

            <PrescriptionForm
              items={[{ medicineName: "", dosage: "", frequency: "", duration: "" }]}
              disabled
              onChange={() => {}}
            />

            <div className={styles.formActions}>
              <Button type="button" variant="secondary" disabled>
                Lưu nháp (DRAFT)
              </Button>
              <Button type="button" variant="primary" disabled>
                Chốt bệnh án (FINAL)
              </Button>
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Hồ sơ bệnh án gần đây</h2>
              <p className={styles.panelSubtitle}>Danh sách các ca khám đã ghi nhận trong hệ thống</p>
            </div>
            <Button type="button" variant="secondary" size="sm" disabled>
              Làm mới
            </Button>
          </div>
          <div className={styles.historyList} aria-busy="true">
            <Skeleton height={100} width="100%" />
            <Skeleton height={100} width="100%" />
          </div>
        </div>
      </section>
    );
  }

  // Deny ADMIN and STAFF from viewing or acting on clinical data
  if (session.status !== "authenticated" || session.identity?.role !== "DOCTOR") {
    return (
      <PermissionDeniedState
        title="Không có quyền truy cập hồ sơ khám"
        message="Chỉ bác sĩ được phân công mới có quyền lập và quản lý bệnh án khám bệnh. Quản trị viên và nhân viên phòng khám không có quyền truy cập hồ sơ lâm sàng."
        action={{ label: "Về trang chủ", href: "/" }}
      />
    );
  }

  const selectedAppt = appointments.find((a) => a.id === selectedAppointmentId);
  const patientProfile = selectedAppt ? patientProfiles[selectedAppt.patientId] : undefined;
  const checkedInCount = appointments.filter((a) => a.status === "CHECKED_IN").length;

  return (
    <section className="page-stack">
      <PageHeader pathname="/medical-records" />

      {/* Top Feedback Alerts */}
      {successMessage && (
        <Alert variant="success" title="Thành công" onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {serverError && (
        <Alert variant="danger" title="Lỗi hệ thống" onClose={() => setServerError(null)}>
          <div>{serverError}</div>
          <div style={{ marginTop: 8 }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void executeSubmit(lastAttemptedStatus)}
            >
              Thử lại thao tác
            </Button>
          </div>
        </Alert>
      )}

      {hasValidationSummary && (
        <Alert variant="warning" title="Dữ liệu chưa hoàn thiện" onClose={() => setHasValidationSummary(false)}>
          Vui lòng kiểm tra và điền đầy đủ các thông tin bắt buộc được đánh dấu đỏ bên dưới.
        </Alert>
      )}

      {/* Main Clinical Record Form */}
      <section className={styles.panel} aria-labelledby="form-heading">
        <div className={styles.panelHeader}>
          <div>
            <h2 id="form-heading" className={styles.panelTitle}>
              {isRecordFinalized
                ? "Bệnh án đã chốt (FINAL) · Chỉ đọc"
                : editingRecordId
                ? "Cập nhật kết quả khám (DRAFT)"
                : "Lập hồ sơ khám bệnh mới"}
            </h2>
            <p className={styles.panelSubtitle}>
              {isRecordFinalized
                ? "Hồ sơ khám đã được chốt và hoàn tất. Toàn bộ thông tin lâm sàng đã niêm phong."
                : editingRecordId
                ? "Chỉnh sửa thông tin bệnh án dạng nháp trước khi chốt chính thức"
                : "Chọn lịch hẹn đã tiếp nhận để bắt đầu khám và lưu kết quả"}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge variant={recordStatus === "FINAL" ? "success" : "warning"}>
              {recordStatus === "FINAL" ? "Đã chốt (FINAL)" : "Bản nháp (DRAFT)"}
            </Badge>

            {(editingRecordId || isRecordFinalized) && (
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                Lập hồ sơ mới
              </Button>
            )}
          </div>
        </div>

        {/* Finalized Banner */}
        {isRecordFinalized && (
          <div className={styles.finalizedBanner} style={{ marginBottom: 16 }}>
            <div>
              <p className={styles.finalizedTitle}>Hồ sơ đã được chốt hoàn tất (FINAL)</p>
              <p className={styles.finalizedDesc}>
                Bệnh án đã niêm phong và ca khám chuyển sang trạng thái COMPLETED. Biểu mẫu đã khóa chỉnh sửa.
              </p>
            </div>
            <Button type="button" variant="primary" size="sm" onClick={resetForm}>
              + Lập hồ sơ ca khám tiếp theo
            </Button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRequestFinal();
          }}
          className={styles.formGrid}
        >
          {/* Appointment Selector */}
          {loading && appointments.length === 0 ? (
            <div className={styles.fieldGroup} aria-busy="true">
              <span className={styles.fieldLabel}>Lịch hẹn khám đã check-in</span>
              <Skeleton height={42} width="100%" />
            </div>
          ) : fetchError && appointments.length === 0 ? (
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Lịch hẹn khám đã check-in</span>
              <ErrorState
                message={fetchError.message}
                requestId={fetchError.requestId}
                onRetry={() => void loadAppointments()}
              />
            </div>
          ) : (
            <>
              {fetchError && (
                <Alert variant="warning" title="Không cập nhật được lịch hẹn">
                  Đang giữ danh sách đã tải trước đó. {fetchError.message}{" "}
                  <Button type="button" variant="secondary" size="sm" onClick={() => void loadAppointments()}>
                    Thử lại
                  </Button>
                </Alert>
              )}
              {loading && appointments.length > 0 && (
                <div
                  className={styles.staleNotice}
                  role="status"
                  aria-live="polite"
                  aria-label="Đang làm mới danh sách lịch hẹn"
                >
                  <Badge variant="warning" size="sm">
                    Đang làm mới…
                  </Badge>
                  <span className={styles.staleText}>
                    Đang cập nhật danh sách lịch hẹn tiếp nhận mới nhất.
                  </span>
                </div>
              )}
              <AppointmentSelector
                appointments={appointments}
                selectedAppointmentId={selectedAppointmentId}
                disabled={isRecordFinalized || editingRecordId !== null || submitting || loading}
                patientNames={patientNames}
                error={appointmentError}
                onSelect={(id) => {
                  setSelectedAppointmentId(id);
                  if (appointmentError) setAppointmentError(null);
                }}
              />
            </>
          )}

          {/* Patient Details Card (Luồng DOCTOR: tải thông tin bệnh nhân) */}
          {selectedAppt && (
            <div className={styles.patientCard} aria-label="Thông tin bệnh nhân ca khám">
              <div className={styles.patientCardHeader}>
                <div>
                  <h3 className={styles.patientName}>
                    {formatPatientDisplayName(
                      selectedAppt.patientId,
                      patientProfile?.fullName || patientNames[selectedAppt.patientId]
                    )}
                  </h3>
                  <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                    Mã bệnh nhân: #{selectedAppt.patientId.replace(/-/g, "").slice(-6)}
                  </span>
                </div>
                <Badge variant={selectedAppt.status === "CHECKED_IN" ? "info" : "neutral"}>
                  {selectedAppt.status === "CHECKED_IN" ? "Đã tiếp nhận (CHECKED_IN)" : selectedAppt.status}
                </Badge>
              </div>

              {patientLoading && !patientProfile ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Skeleton height={18} width="60%" />
                  <Skeleton height={18} width="40%" />
                </div>
              ) : (
                <div className={styles.patientGrid}>
                  <div className={styles.patientItem}>
                    <span className={styles.patientItemLabel}>Giờ hẹn khám</span>
                    <span className={styles.patientItemValue}>
                      {formatVietnamDateTime(selectedAppt.scheduledStartAt)}
                    </span>
                  </div>
                  {patientProfile?.gender && (
                    <div className={styles.patientItem}>
                      <span className={styles.patientItemLabel}>Giới tính</span>
                      <span className={styles.patientItemValue}>{patientProfile.gender}</span>
                    </div>
                  )}
                  {patientProfile?.phone && (
                    <div className={styles.patientItem}>
                      <span className={styles.patientItemLabel}>Số điện thoại</span>
                      <span className={styles.patientItemValue}>{patientProfile.phone}</span>
                    </div>
                  )}
                  {patientProfile?.insuranceNumber && (
                    <div className={styles.patientItem}>
                      <span className={styles.patientItemLabel}>Số BHYT</span>
                      <span className={styles.patientItemValue}>{patientProfile.insuranceNumber}</span>
                    </div>
                  )}
                  {selectedAppt.reason && (
                    <div className={styles.patientItem} style={{ gridColumn: "1 / -1" }}>
                      <span className={styles.patientItemLabel}>Lý do tiếp nhận khám</span>
                      <span className={styles.patientItemValue}>{selectedAppt.reason}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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
              readOnly={isRecordFinalized || submitting}
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
              readOnly={isRecordFinalized || submitting}
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
              readOnly={isRecordFinalized || submitting}
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
              readOnly={isRecordFinalized || submitting}
              onChange={(e) => setTreatmentPlan(e.target.value)}
            />
          </div>

          {/* Prescription Sub-Form */}
          <PrescriptionForm
            items={prescription}
            disabled={submitting}
            readOnly={isRecordFinalized}
            errors={prescriptionErrors}
            onChange={(items) => {
              if (isRecordFinalized) return;
              setPrescription(items);
              if (hasValidationSummary) setHasValidationSummary(false);
            }}
          />

          {/* Form Actions */}
          <div className={styles.formActions}>
            {isRecordFinalized ? (
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Badge variant="success" size="md">
                  FINAL · ĐÃ CHỐT HOÀN TẤT
                </Badge>
                <Button type="button" variant="primary" onClick={resetForm}>
                  Lập hồ sơ ca khám mới
                </Button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Button
                  type="button"
                  variant="secondary"
                  loading={submitting && lastAttemptedStatus === "DRAFT"}
                  disabled={submitting || (!editingRecordId && checkedInCount === 0 && !selectedAppointmentId)}
                  onClick={() => void handleSaveDraft()}
                >
                  {submitting && lastAttemptedStatus === "DRAFT" ? "Đang lưu nháp..." : "Lưu nháp (DRAFT)"}
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting && lastAttemptedStatus === "FINAL"}
                  disabled={submitting || (!editingRecordId && checkedInCount === 0 && !selectedAppointmentId)}
                >
                  {submitting && lastAttemptedStatus === "FINAL" ? "Đang chốt..." : "Chốt bệnh án (FINAL)"}
                </Button>
              </div>
            )}
          </div>
        </form>
      </section>

      {/* History Records Section */}
      <section className={styles.panel} aria-labelledby="history-heading">
        <div className={styles.panelHeader}>
          <div>
            <h2 id="history-heading" className={styles.panelTitle}>Hồ sơ bệnh án gần đây</h2>
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

        {recordsError && records.length === 0 ? (
          <ErrorState
            message={recordsError.message}
            requestId={recordsError.requestId}
            onRetry={() => void loadRecords()}
          />
        ) : (recordsLoading && records.length === 0) || !recordsFetched ? (
          <div className={styles.historyList} aria-busy="true">
            <Skeleton height={100} width="100%" />
            <Skeleton height={100} width="100%" />
          </div>
        ) : records.length === 0 ? (
          <EmptyState
            title="Chưa có hồ sơ khám bệnh nào"
            message="Các kết quả khám sau khi bác sĩ lập sẽ xuất hiện tại đây."
            action={{ label: "Tải lại danh sách", onClick: () => void loadRecords() }}
          />
        ) : (
          <>
            {recordsLoading && records.length > 0 && (
              <div
                className={styles.staleNotice}
                role="status"
                aria-live="polite"
                aria-label="Đang làm mới danh sách hồ sơ khám"
              >
                <Badge variant="warning" size="sm">
                  Đang làm mới…
                </Badge>
                <span className={styles.staleText}>
                  Đang tải dữ liệu hồ sơ mới nhất. Đang hiển thị kết quả từ lần tải trước.
                </span>
              </div>
            )}

            {recordsError && (
              <Alert variant="warning" title="Không thể cập nhật hồ sơ gần đây">
                Đang giữ dữ liệu đã tải trước đó. {recordsError.message}{" "}
                <Button type="button" variant="secondary" size="sm" onClick={() => void loadRecords()}>
                  Thử lại
                </Button>
              </Alert>
            )}
            <div className={styles.historyList}>
              {records.map((rec) => {
                const patientDisplay = formatPatientDisplayName(
                  rec.patientId,
                  patientProfiles[rec.patientId]?.fullName || patientNames[rec.patientId]
                );
                const formattedDate = formatVietnamDateTime(rec.createdAt);

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
                        variant={rec.status === "FINAL" ? "outline" : "primary"}
                        size="sm"
                        onClick={() => handleEditRecord(rec)}
                      >
                        {rec.status === "FINAL" ? "Xem hồ sơ (Chỉ đọc)" : "Tiếp tục chỉnh sửa"}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Confirmation Modal for FINAL status */}
      <ConfirmModal
        isOpen={isConfirmFinalOpen}
        onClose={() => setIsConfirmFinalOpen(false)}
        onConfirm={() => void executeSubmit("FINAL")}
        title="Xác nhận chốt bệnh án (FINAL)"
        message="Sau khi chốt bệnh án ở trạng thái FINAL, ca khám sẽ được đánh dấu hoàn thành (COMPLETED) và kích hoạt thông báo kết quả cho bệnh nhân. Bạn có chắc chắn muốn chốt hồ sơ khám này?"
        confirmLabel="Xác nhận chốt bệnh án"
        cancelLabel="Quay lại kiểm tra"
        variant="primary"
        loading={submitting}
      />
    </section>
  );
}