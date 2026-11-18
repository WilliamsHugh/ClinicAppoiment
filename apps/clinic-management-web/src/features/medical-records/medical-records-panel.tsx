"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, ErrorState, PermissionDeniedState } from "../../components/states";
import { Alert, Badge, Button, ConfirmModal, Input, Modal, Skeleton } from "../../components/ui";
import { Pagination } from "../../components/pagination";
import { PageHeader } from "../../components/page-header";
import { ApiClientError, createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import type { Session } from "../../lib/session/session";
import { formatVietnamDateTime } from "../../lib/formatting/date-time";
import { AppointmentSelector, type AppointmentOption } from "./appointment-selector";
import { PrescriptionForm, type PrescriptionItem, type PrescriptionItemErrors } from "./prescription-form";
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
  version?: number;
  createdAt: string;
  appointmentCompletion?: "NOT_REQUESTED" | "PENDING" | "COMPLETED";
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

interface RecordForm {
  symptoms: string;
  diagnosis: string;
  notes: string;
  treatmentPlan: string;
  prescription: PrescriptionItem[];
}

interface Page<T> {
  items: T[];
  total?: number;
}

type ClinicalBody = Pick<RecordForm, "symptoms" | "diagnosis" | "notes" | "treatmentPlan" | "prescription">;
type ClinicalChallenge = {
  challengeId: string;
  purpose: "OPEN_CLINICAL_RECORDS" | "FINALIZE_MEDICAL_RECORD";
  appointmentId: string;
  patientId: string;
  contextId?: string;
  expectedVersion?: number;
  body?: ClinicalBody;
  readTarget?: "record" | "history";
  recordId?: string;
};

const pageSize = 20;
const emptyForm = (): RecordForm => ({
  symptoms: "", diagnosis: "", notes: "", treatmentPlan: "",
  prescription: [{ medicineName: "", dosage: "", frequency: "", duration: "" }],
});

function formFrom(record: MedicalRecordItem): RecordForm {
  return {
    symptoms: record.symptoms ?? "", diagnosis: record.diagnosis ?? "",
    notes: record.notes ?? "", treatmentPlan: record.treatmentPlan ?? "",
    prescription: record.prescription?.length ? record.prescription : emptyForm().prescription,
  };
}

function patientName(patientId: string, name?: string): string {
  return name?.trim() || `Bệnh nhân #${patientId.replace(/-/g, "").slice(-4)}`;
}

function apiError(caught: unknown, message: string): ApiClientError {
  return caught instanceof ApiClientError ? caught : new ApiClientError(message, 0, "UNKNOWN_ERROR");
}

export function MedicalRecordsPanel() {
  const session = useSession();
  return <MedicalRecordsPanelWorkspace key={`${session.status}:${session.identity?.id ?? ""}:${session.identity?.role ?? ""}`} session={session} />;
}

function MedicalRecordsPanelWorkspace({ session }: { session: Session }) {
  const currentSession = useRef(session);
  currentSession.current = session;
  const client = useMemo(() => createBrowserApiClient({
    getAccessToken: () => currentSession.current.getAccessToken(),
    handleUnauthorized: async () => { await currentSession.current.handleUnauthorized?.(); },
  }), []);
  const isDoctor = session.status === "authenticated" && session.identity?.role === "DOCTOR";
  const [appointments, setAppointments] = useState<AppointmentOption[]>([]);
  const [appointmentPage, setAppointmentPage] = useState(1);
  const [hasMoreAppointments, setHasMoreAppointments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<ApiClientError | null>(null);
  const [records, setRecords] = useState<MedicalRecordItem[]>([]);
  const [recordPage, setRecordPage] = useState(1);
  const [recordTotal, setRecordTotal] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<ApiClientError | null>(null);
  const [selection, setSelection] = useState<{ appointmentId: string; record?: MedicalRecordItem; recordId?: string }>({ appointmentId: "" });
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentOption | null>(null);
  const [record, setRecord] = useState<MedicalRecordItem | null>(null);
  const [recordVerified, setRecordVerified] = useState(false);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [selectionError, setSelectionError] = useState<ApiClientError | null>(null);
  const [selectionRetry, setSelectionRetry] = useState(0);
  const [patientProfile, setPatientProfile] = useState<PatientDetails | null>(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientError, setPatientError] = useState(false);
  const [form, setForm] = useState<RecordForm>(emptyForm);
  const [dirty, setDirty] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<typeof selection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitInFlight = useRef(false);
  const draftIdempotencyKeyRef = useRef<string>("");
  const finalizeIdempotencyKeyRef = useRef<string>("");
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [lastAttemptedStatus, setLastAttemptedStatus] = useState<"DRAFT" | "FINAL">("DRAFT");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<ApiClientError | null>(null);
  const [prescriptionErrors, setPrescriptionErrors] = useState<Record<number, PrescriptionItemErrors>>({});
  const [clinicalChallenge, setClinicalChallenge] = useState<ClinicalChallenge | null>(null);
  const [clinicalCode, setClinicalCode] = useState("");
  const [clinicalBusy, setClinicalBusy] = useState(false);
  const [clinicalError, setClinicalError] = useState<string | null>(null);
  const [historyRecords, setHistoryRecords] = useState<MedicalRecordItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const finalized = record?.status === "FINAL";
  const selectedAppointmentId = selection.appointmentId || record?.appointmentId || "";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const appointmentId = params.get("appointmentId") || "";
    const recordId = params.get("recordId") || undefined;
    if (appointmentId || recordId) setSelection({ appointmentId, recordId });
  }, []);

  const loadAppointments = useCallback(async (page = 1) => {
    setLoading(true);
    setFetchError(null);
    try {
      const result = await client.get<Page<AppointmentOption>>("/api/v1/appointments", {
        query: { status: "CHECKED_IN", page, limit: pageSize },
      });
      const items = result.data.items || [];
      setAppointments((previous) => page === 1 ? items : [...previous, ...items.filter((item) => !previous.some((a) => a.id === item.id))]);
      setAppointmentPage(page);
      setHasMoreAppointments(typeof result.data.total === "number" ? page * pageSize < result.data.total : items.length === pageSize);
    } catch (caught) {
      setFetchError(apiError(caught, "Không thể tải danh sách lịch hẹn."));
    } finally {
      setLoading(false);
    }
  }, [client]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      const result = await client.get<Page<MedicalRecordItem>>("/api/v1/medical-records", {
        query: { page: recordPage, limit: pageSize },
      });
      setRecords(result.data.items || []);
      setRecordTotal(result.data.total ?? result.data.items.length);
    } catch (caught) {
      setRecordsError(apiError(caught, "Không thể tải danh sách hồ sơ khám."));
    } finally {
      setRecordsLoading(false);
    }
  }, [client, recordPage]);

  useEffect(() => { if (isDoctor) void loadAppointments(); }, [isDoctor, loadAppointments]);
  useEffect(() => { if (isDoctor) void loadRecords(); }, [isDoctor, loadRecords]);

  useEffect(() => {
    if (!isDoctor) return;
    if (!selection.appointmentId && !selection.recordId && !selection.record) {
      setRecord(null);
      setSelectedAppointment(null);
      setSelectionLoading(false);
      setSelectionError(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setSelectionLoading(true);
    setSelectionError(null);
    setPatientProfile(null);
    setPatientError(false);
    setSelectedAppointment(null);
    setRecord(null);
    setRecordVerified(false);
    setForm(emptyForm());
    setDirty(false);
    setSuccessMessage(null);
    setServerError(null);
    setPrescriptionErrors({});
    setHistoryRecords(null);
    setHistoryError(null);
    const load = async () => {
      try {
        let selectedRecord = selection.record ?? null;
        if (selection.recordId) {
          const result = await client.get<MedicalRecordItem>(`/api/v1/medical-records/${encodeURIComponent(selection.recordId)}`, { query: { view: "summary" }, signal: controller.signal });
          selectedRecord = result.data;
        } else if (!selectedRecord) {
          const result = await client.get<Page<MedicalRecordItem>>("/api/v1/medical-records", {
            query: { appointmentId: selection.appointmentId, page: 1, limit: 1 }, signal: controller.signal,
          });
          // Keep the appointment boundary even if an older provider ignores the filter.
          selectedRecord = result.data.items.find((item) => item.appointmentId === selection.appointmentId) ?? null;
        }
        if (!active) return;
        const appointmentId = selectedRecord?.appointmentId || selection.appointmentId;
        setRecord(selectedRecord);
        // The authored list and deep link contain metadata only. Clinical fields load after TOTP.
        setSelectionLoading(false);
        const localAppointment = appointments.find((a) => a.id === appointmentId);
        let appointment = localAppointment;
        if (!appointment) {
          try {
            const result = await client.get<AppointmentOption>(`/api/v1/appointments/${encodeURIComponent(appointmentId)}`, { signal: controller.signal });
            appointment = result.data;
          } catch (caught) {
            if (!selectedRecord) throw caught;
          }
        }
        if (!active) return;
        setSelectedAppointment(appointment ?? null);
        const patientId = selectedRecord?.patientId || appointment?.patientId;
        if (patientId) {
          setPatientLoading(true);
          try {
            const result = await client.get<PatientDetails>(`/api/v1/patients/${encodeURIComponent(patientId)}`, {
              query: { appointmentId }, signal: controller.signal,
            });
            if (active) setPatientProfile(result.data);
          } catch {
            if (active) setPatientError(true);
          } finally {
            if (active) setPatientLoading(false);
          }
        }
      } catch (caught) {
        if (active) setSelectionError(apiError(caught, "Không thể tải hồ sơ của ca đã chọn. Vui lòng thử lại."));
      } finally {
        if (active) setSelectionLoading(false);
      }
    };
    void load();
    return () => { active = false; controller.abort(); };
    // Pagination and background refresh must never replace an open draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, isDoctor, selection, selectionRetry]);

  const changeSelection = (next: typeof selection) => {
    if (submitting) return;
    if (dirty) { setPendingSelection(next); return; }
    draftIdempotencyKeyRef.current = "";
    finalizeIdempotencyKeyRef.current = "";
    setSelection(next);
    setClinicalChallenge(null);
    setHistoryRecords(null);
    setRecordVerified(false);
    if (!next.appointmentId && !next.recordId && !next.record) {
      setRecord(null);
      setForm(emptyForm());
      setSuccessMessage(null);
      setServerError(null);
      setSelectionError(null);
    }
  };

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const updateForm = (patch: Partial<RecordForm>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setDirty(true);
    setSuccessMessage(null);
  };

  const validate = () => {
    const errors: Record<number, PrescriptionItemErrors> = {};
    form.prescription.forEach((item, index) => {
      if (Object.values(item).some((value) => value.trim())) {
        const row: PrescriptionItemErrors = {};
        if (!item.medicineName.trim()) row.medicineName = "Thiếu tên thuốc";
        if (!item.dosage.trim()) row.dosage = "Thiếu liều lượng";
        if (!item.frequency.trim()) row.frequency = "Thiếu tần suất";
        if (!item.duration.trim()) row.duration = "Thiếu thời gian";
        if (Object.keys(row).length) errors[index] = row;
      }
    });
    setPrescriptionErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const clinicalBody = (): ClinicalBody => ({
    symptoms: form.symptoms.trim(), diagnosis: form.diagnosis.trim(),
    notes: form.notes.trim(), treatmentPlan: form.treatmentPlan.trim(),
    prescription: form.prescription.filter((item) => item.medicineName.trim()),
  });

  const beginChallenge = async (purpose: ClinicalChallenge["purpose"], context: Record<string, unknown>): Promise<string> => {
    const factors = await client.get<{ items: Array<{ factorId: string; type: string; status: string }> }>("/api/v1/auth/mfa/factors");
    const factor = factors.data.items.find((item) => item.type === "totp" && item.status === "verified");
    if (!factor) throw new Error("Chưa có TOTP đã xác minh cho tài khoản bác sĩ. Cần thiết lập TOTP trước khi tiếp tục.");
    const challenge = await client.post<{ challengeId: string }>("/api/v1/auth/mfa/challenges", {
      body: { factorId: factor.factorId, purpose, context },
    });
    return challenge.data.challengeId;
  };

  const startClinicalOperation = async (purpose: ClinicalChallenge["purpose"], readTarget: "record" | "history" = "history") => {
    const appointmentId = selectedAppointmentId;
    const patientId = record?.patientId || selectedAppointment?.patientId;
    if (!appointmentId || !patientId || clinicalBusy) return;
    setClinicalBusy(true);
    setClinicalError(null);
    setHistoryError(null);
    try {
      if (purpose === "OPEN_CLINICAL_RECORDS") {
        if (readTarget === "history" && selectedAppointment?.status !== "CHECKED_IN") throw new Error("Chỉ mở tiền sử khi ca khám đã được tiếp nhận.");
        if (readTarget === "record" && !record?.id) throw new Error("Chưa chọn hồ sơ cần mở.");
        const accessMode = readTarget === "record" ? "AUTHORED_HISTORY" : "CURRENT_ENCOUNTER";
        const recordId = readTarget === "record" ? record?.id : undefined;
        const challengeId = await beginChallenge(purpose, { appointmentId, patientId, accessMode,
          ...(recordId ? { recordId } : {}) });
        setClinicalChallenge({ challengeId, purpose, appointmentId, patientId, readTarget, recordId });
      } else {
        const body = clinicalBody();
        const expectedVersion = record?.version ?? (record ? 1 : 0);
        const context = await client.post<{ contextId: string; contentDigest: string }>("/api/v1/medical-records/finalization-contexts", {
          body: { appointmentId, ...(record ? { recordId: record.id } : {}), expectedVersion, record: body },
        });
        const challengeContext = { contextId: context.data.contextId, contentDigest: context.data.contentDigest,
          ...(record ? { recordId: record.id } : {}) };
        const challengeId = await beginChallenge(purpose, challengeContext);
        setClinicalChallenge({ challengeId, purpose, appointmentId, patientId, contextId: context.data.contextId, expectedVersion, body });
      }
      setClinicalCode("");
      setConfirmFinal(false);
    } catch (caught) {
      setClinicalError(caught instanceof Error ? caught.message : "Không thể bắt đầu xác minh TOTP.");
      setConfirmFinal(false);
    } finally {
      setClinicalBusy(false);
    }
  };

  const verifyClinicalCode = async () => {
    const challenge = clinicalChallenge;
    if (!challenge || clinicalBusy || !/^\d{6}$/.test(clinicalCode)) return;
    setClinicalBusy(true);
    setClinicalError(null);
    try {
      const verified = await client.post<{ authorization?: { proofId: string } }>("/api/v1/auth/mfa/verify", {
        body: { challengeId: challenge.challengeId, code: clinicalCode },
      });
      const proofId = verified.data.authorization?.proofId;
      if (!proofId) throw new Error("Máy chủ chưa cấp bằng chứng xác minh. Vui lòng thử lại.");
      if (challenge.purpose === "OPEN_CLINICAL_RECORDS") {
        const grant = await client.post<{ id?: string; grantId?: string }>("/api/v1/medical-records/access-grants", {
          body: { verificationProofId: proofId, accessMode: challenge.readTarget === "record" ? "AUTHORED_HISTORY" : "CURRENT_ENCOUNTER",
            appointmentId: challenge.appointmentId, patientId: challenge.patientId,
            ...(challenge.recordId ? { recordId: challenge.recordId } : {}) },
        });
        const grantId = grant.data.grantId || grant.data.id;
        if (!grantId) throw new Error("Máy chủ chưa trả mã quyền đọc bệnh án.");
        setClinicalChallenge(null);
        if (challenge.readTarget === "record" && challenge.recordId) {
          const detail = await client.get<MedicalRecordItem>(`/api/v1/medical-records/${encodeURIComponent(challenge.recordId)}`, {
            headers: { "X-Clinical-Grant": grantId },
          });
          setRecord(detail.data);
          setForm(formFrom(detail.data));
          setRecordVerified(true);
          return;
        }
        setHistoryLoading(true);
        try {
          const history = await client.get<Page<MedicalRecordItem>>("/api/v1/medical-records", {
            query: { scope: "patient-history", view: "detail", patientId: challenge.patientId, page: 1, limit: pageSize },
            headers: { "X-Clinical-Grant": grantId },
          });
          setHistoryRecords(history.data.items);
        } catch (caught) {
          setHistoryError(caught instanceof Error ? caught.message : "Không thể tải tiền sử bệnh án.");
        } finally {
          setHistoryLoading(false);
        }
      } else {
        setClinicalChallenge(null);
        await executeSubmit("FINAL", { proofId, contextId: challenge.contextId!, expectedVersion: challenge.expectedVersion!, body: challenge.body! });
      }
    } catch (caught) {
      setClinicalError(caught instanceof Error ? caught.message : "Mã TOTP không hợp lệ hoặc đã hết hạn.");
    } finally {
      setClinicalBusy(false);
      setClinicalCode("");
    }
  };

  const canSave = !submitting && !selectionLoading && !selectionError && ((Boolean(record) && recordVerified) || (!record && selectedAppointment?.status === "CHECKED_IN"));

  const handleResolveConflict = async () => {
    if (!record?.id) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const result = await client.get<MedicalRecordItem>(`/api/v1/medical-records/${encodeURIComponent(record.id)}`, {
        query: { view: "summary" },
      });
      setRecord((prev) => prev ? { ...prev, ...result.data, version: result.data.version ?? ((prev.version ?? 1) + 1) } : result.data);
      draftIdempotencyKeyRef.current = "";
      setSuccessMessage("Đã đồng bộ phiên bản mới nhất từ máy chủ. Dữ liệu bạn vừa nhập vẫn được giữ nguyên, bạn có thể bấm lưu nháp ngay bây giờ.");
    } catch (caught) {
      setServerError(apiError(caught, "Không thể tải phiên bản mới từ máy chủ. Vui lòng thử lại."));
    } finally {
      setSubmitting(false);
    }
  };

  const executeSubmit = async (status: "DRAFT" | "FINAL", authorization?: { proofId: string; contextId: string; expectedVersion: number; body: ClinicalBody }) => {
    if (status === "FINAL" && !authorization) return;
    if (submitInFlight.current || finalized || selectionError || selectionLoading || !selectedAppointmentId) return;
    if (!record && selectedAppointment?.status !== "CHECKED_IN") return;
    submitInFlight.current = true;
    setConfirmFinal(false);
    setSubmitting(true);
    setServerError(null);
    setSuccessMessage(null);
    setLastAttemptedStatus(status);
    try {
      let idempotencyKey = status === "FINAL" ? finalizeIdempotencyKeyRef.current : draftIdempotencyKeyRef.current;
      if (!idempotencyKey) {
        idempotencyKey = `${status.toLowerCase()}-${selectedAppointmentId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        if (status === "FINAL") {
          finalizeIdempotencyKeyRef.current = idempotencyKey;
        } else {
          draftIdempotencyKeyRef.current = idempotencyKey;
        }
      }

      const expectedVersion = authorization?.expectedVersion ?? (record ? (record.version ?? 1) : undefined);
      const submittedBody = {
        ...(authorization?.body ?? clinicalBody()),
        status,
        ...(expectedVersion !== undefined ? { expectedVersion } : {}),
        ...(authorization ? { verificationProofId: authorization.proofId, contextId: authorization.contextId } : {}),
      };

      const headers: Record<string, string> = { "Idempotency-Key": idempotencyKey };

      const result = record
        ? await client.patch<Partial<MedicalRecordItem>>(`/api/v1/medical-records/${encodeURIComponent(record.id)}`, { body: submittedBody, headers })
        : await client.post<Partial<MedicalRecordItem>>("/api/v1/medical-records", {
          body: { appointmentId: selectedAppointmentId, patientId: selectedAppointment!.patientId, doctorId: selectedAppointment!.doctorId, ...submittedBody },
          headers,
        });
      // Older responses may omit unchanged fields; never erase the submitted draft.
      const saved = {
        ...record, appointmentId: selectedAppointmentId,
        patientId: record?.patientId || selectedAppointment!.patientId,
        doctorId: record?.doctorId || selectedAppointment!.doctorId,
        createdAt: record?.createdAt || "", ...clinicalBody(), status, ...result.data,
      };
      if (!saved.id) throw new ApiClientError("Máy chủ chưa trả mã hồ sơ. Hãy tải lại ca trước khi lưu tiếp.", 502, "UPSTREAM_INVALID_RESPONSE");

      if (status === "FINAL") {
        finalizeIdempotencyKeyRef.current = "";
      } else {
        draftIdempotencyKeyRef.current = "";
      }

      setRecord({ ...saved, id: saved.id });
      setRecordVerified(true);
      setForm(formFrom({ ...saved, id: saved.id }));
      setDirty(false);
      setSuccessMessage(saved.status === "FINAL"
        ? `Hồ sơ khám bệnh đã được chốt (FINAL) và chuyển sang chỉ đọc. ${saved.appointmentCompletion === "COMPLETED" ? "Lịch hẹn đã hoàn thành (COMPLETED)." : saved.appointmentCompletion === "PENDING" ? "Đang đồng bộ trạng thái lịch hẹn." : "Trạng thái hoàn thành lịch hẹn chưa được xác nhận."}`
        : "Đã lưu nháp hồ sơ khám bệnh thành công. Bạn có thể tiếp tục chỉnh sửa.");
      void loadRecords();
    } catch (caught) {
      setServerError(apiError(caught, "Không thể lưu hồ sơ khám bệnh. Dữ liệu đã nhập được giữ nguyên, vui lòng thử lại."));
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  };

  // Autosave draft every 30s when dirty && canSave && !submitting && !finalized && Boolean(record)
  useEffect(() => {
    if (!dirty || !canSave || submitting || finalized || !record || !recordVerified) return;
    const timer = setTimeout(() => {
      if (validate()) {
        void executeSubmit("DRAFT");
      }
    }, 30000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, canSave, submitting, finalized, record, recordVerified]);

  if (session.status !== "loading" && !isDoctor) {
    return <PermissionDeniedState title="Không có quyền truy cập hồ sơ khám" message="Chỉ bác sĩ được phân công mới có quyền lập và quản lý bệnh án khám bệnh. Quản trị viên và nhân viên phòng khám không có quyền truy cập hồ sơ lâm sàng." action={{ label: "Về trang chủ", href: "/" }} />;
  }

  const sessionLoading = session.status === "loading";
  const hasSelection = Boolean(selection.appointmentId || selection.recordId || selection.record);
  const displayedAppointments = selectedAppointment && !appointments.some((a) => a.id === selectedAppointment.id)
    ? [selectedAppointment, ...appointments] : appointments;
  const selectedPatientId = record?.patientId || selectedAppointment?.patientId;

  return (
    <section className="page-stack">
      <PageHeader pathname="/medical-records" />
      <div className={styles.workspace}>
        <aside className={styles.index} aria-label="Chọn ca và hồ sơ">
          <section className={styles.panel} aria-labelledby="picker-heading">
            <div className={styles.panelHeader}>
              <div><h2 id="picker-heading" className={styles.panelTitle}>Chọn ca khám</h2><p className={styles.panelSubtitle}>Ca đã tiếp nhận được phân công cho bạn</p></div>
            </div>
            {sessionLoading || (loading && !appointments.length) ? (
              <div className={styles.fieldGroup} aria-busy="true" aria-label="Đang tải ca khám"><span className={styles.fieldLabel}>Lịch hẹn đã tiếp nhận</span><Skeleton height={44} width="100%" /></div>
            ) : (
              <AppointmentSelector appointments={displayedAppointments} selectedAppointmentId={selectedAppointmentId} disabled={submitting || loading} patientNames={patientProfile?.fullName && selectedPatientId ? { [selectedPatientId]: patientProfile.fullName } : {}} onSelect={(appointmentId) => changeSelection({ appointmentId })} />
            )}
            {fetchError && <ErrorState message={fetchError.message} requestId={fetchError.requestId} onRetry={() => void loadAppointments(hasMoreAppointments ? appointmentPage + 1 : 1)} />}
            {hasMoreAppointments && <Button variant="secondary" loading={loading} disabled={submitting} onClick={() => void loadAppointments(appointmentPage + 1)}>Tải thêm ca đã tiếp nhận</Button>}
          </section>

          <section className={styles.panel} aria-labelledby="history-heading">
            <div className={styles.panelHeader}>
              <div><h2 id="history-heading" className={styles.panelTitle}>Hồ sơ bệnh án gần đây</h2><p className={styles.panelSubtitle}>Hồ sơ trong phạm vi được phép xem</p></div>
              <Button variant="ghost" size="sm" disabled={sessionLoading} loading={recordsLoading && !sessionLoading} onClick={() => void loadRecords()}>Làm mới</Button>
            </div>
            {recordsLoading && records.length > 0 && <p className={styles.fieldHelp} role="status">Đang làm mới… Đang tải dữ liệu hồ sơ mới nhất. Đang hiển thị kết quả từ lần tải trước.</p>}
            {recordsError && <ErrorState message={recordsError.message} requestId={recordsError.requestId} onRetry={() => void loadRecords()} />}
            <div className={styles.historyList} aria-busy={sessionLoading || recordsLoading}>
              {(sessionLoading || recordsLoading) && !records.length ? <><Skeleton height={100} width="100%" /><Skeleton height={100} width="100%" /></> : !records.length && !recordsError ? (
                <EmptyState title="Chưa có hồ sơ khám bệnh nào" message="Các kết quả khám sau khi bác sĩ lập sẽ xuất hiện tại đây." action={{ label: "Tải lại danh sách", onClick: () => void loadRecords() }} />
              ) : records.map((item) => (
                <article key={item.id} className={styles.recordCard} aria-current={record?.id === item.id ? "true" : undefined}>
                  <div className={styles.recordHeader}>
                    <h3 className={styles.recordDiagnosis}>{patientName(item.patientId, item.patientId === selectedPatientId ? patientProfile?.fullName : undefined)}</h3>
                    <Badge variant={item.status === "FINAL" ? "success" : "warning"}>{item.status === "FINAL" ? "Đã chốt (FINAL)" : "Bản nháp (DRAFT)"}</Badge>
                  </div>
                  <p className={styles.recordMeta}>{formatVietnamDateTime(item.createdAt)}</p>
                  <p className={styles.historyDiagnosis}>{item.diagnosis || "Chưa ghi nhận chẩn đoán"}</p>
                  <Button variant="ghost" size="sm" disabled={submitting} onClick={() => changeSelection({ appointmentId: item.appointmentId, record: item })}>{item.status === "FINAL" ? "Xem hồ sơ (Chỉ đọc)" : "Tiếp tục chỉnh sửa"}</Button>
                </article>
              ))}
            </div>
            {recordTotal > pageSize && <Pagination page={recordPage} limit={pageSize} total={recordTotal} disabled={recordsLoading || submitting} onPageChange={(page) => { setRecords([]); setRecordsLoading(true); setRecordPage(page); }} />}
          </section>
        </aside>

        <section className={styles.panel} aria-labelledby="form-heading">
          <div className={styles.panelHeader}>
            <div><h2 id="form-heading" className={styles.panelTitle}>Ca đang khám</h2><p className={styles.panelSubtitle}>Ghi nhận kết quả khám và đơn thuốc của ca đã chọn</p></div>
            {hasSelection && <Button variant="ghost" size="sm" disabled={submitting} onClick={() => changeSelection({ appointmentId: "" })}>Lập hồ sơ ca khám mới</Button>}
          </div>
          {!hasSelection ? <div className={styles.selectionPrompt}><h3 className={styles.prescriptionTitle}>Chọn ca để bắt đầu</h3><p className={styles.fieldHelp}>Chọn lịch hẹn đã tiếp nhận hoặc mở một hồ sơ trong danh sách để tiếp tục làm việc.</p></div> : selectionLoading ? (
            <div className={styles.formGrid} aria-busy="true" aria-label="Đang tải hồ sơ ca đã chọn"><Skeleton height={80} width="100%" /><Skeleton height={120} width="100%" /></div>
          ) : selectionError ? <ErrorState message={selectionError.message} requestId={selectionError.requestId} onRetry={() => setSelectionRetry((value) => value + 1)} /> : record && !recordVerified ? <div className={styles.selectionPrompt}>
            <h3 className={styles.prescriptionTitle}>Xác minh để mở hồ sơ</h3>
            <p className={styles.fieldHelp}>Thông tin lâm sàng chỉ hiển thị sau khi bác sĩ nhập mã TOTP. Quyền mở hồ sơ gắn với phiên đăng nhập và hồ sơ đã chọn.</p>
            {clinicalError && <Alert variant="danger" title="Không thể mở hồ sơ">{clinicalError}</Alert>}
            <Button disabled={clinicalBusy} loading={clinicalBusy} onClick={() => void startClinicalOperation("OPEN_CLINICAL_RECORDS", "record")}>Xác minh TOTP để mở hồ sơ</Button>
          </div> : (
            <div className={styles.formGrid}>
              <div className={styles.recordHeader}><h3 className={styles.prescriptionTitle}>{finalized ? "Bệnh án đã chốt (FINAL) · Chỉ đọc" : record ? "Cập nhật kết quả khám (DRAFT)" : "Lập hồ sơ khám bệnh mới"}</h3><Badge variant={finalized ? "success" : "warning"}>{finalized ? "Đã chốt (FINAL)" : record ? "Bản nháp (DRAFT)" : "Chưa lưu hồ sơ"}</Badge></div>
              {selectedPatientId && <div className={styles.patientCard} aria-label="Thông tin bệnh nhân ca khám">
                <div className={styles.patientCardHeader}><h3 className={styles.patientName}>{patientName(selectedPatientId, patientProfile?.fullName)}</h3>{selectedAppointment && <Badge variant={selectedAppointment.status === "CHECKED_IN" ? "info" : "neutral"}>{selectedAppointment.status === "CHECKED_IN" ? "Đã tiếp nhận (CHECKED_IN)" : selectedAppointment.status}</Badge>}</div>
                {selectedAppointment && <p className={styles.fieldHelp}>Giờ hẹn khám: {formatVietnamDateTime(selectedAppointment.scheduledStartAt)}</p>}
                {patientLoading && !patientProfile ? <div aria-busy="true" aria-label="Đang tải thông tin bệnh nhân"><Skeleton height={20} width="60%" /></div> : <div className={styles.patientGrid}>{patientProfile?.gender && <div className={styles.patientItem}><span className={styles.patientItemLabel}>Giới tính</span><span className={styles.patientItemValue}>{patientProfile.gender}</span></div>}{patientProfile?.phone && <div className={styles.patientItem}><span className={styles.patientItemLabel}>Số điện thoại</span><span className={styles.patientItemValue}>{patientProfile.phone}</span></div>}{patientProfile?.insuranceNumber && <div className={styles.patientItem}><span className={styles.patientItemLabel}>Số BHYT</span><span className={styles.patientItemValue}>{patientProfile.insuranceNumber}</span></div>}</div>}
                {patientError && <p className={styles.fieldHelp}>Chưa tải được thông tin bệnh nhân. Đang hiển thị mã rút gọn.</p>}
                {selectedAppointment?.reason && <p className={styles.fieldHelp}>Lý do khám: {selectedAppointment.reason}</p>}
              </div>}
              {successMessage && <Alert variant="success" title="Đã lưu hồ sơ">{successMessage}</Alert>}
              {serverError && (
                <Alert variant="danger" title={serverError.status === 409 ? "Hồ sơ có xung đột phiên bản" : "Không thể lưu hồ sơ"}>
                  <p>{serverError.message} Dữ liệu đã nhập được giữ nguyên.</p>
                  {serverError.status === 409 ? (
                    <div className={styles.fieldGroup} style={{ marginTop: "0.5rem" }}>
                      <p className={styles.fieldHelp}>Phiên bản trên máy chủ đã thay đổi. Bạn có thể làm mới phiên bản máy chủ để lưu tiếp mà không làm mất nội dung vừa nhập.</p>
                      <Button variant="secondary" size="sm" disabled={submitting} onClick={() => void handleResolveConflict()}>
                        Đồng bộ phiên bản máy chủ & thử lưu lại
                      </Button>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" disabled={submitting} onClick={() => lastAttemptedStatus === "FINAL" ? setConfirmFinal(true) : void executeSubmit("DRAFT")}>Thử lại thao tác</Button>
                  )}
                </Alert>
              )}
              {clinicalError && <Alert variant="danger" title="Không thể xác minh TOTP">{clinicalError}</Alert>}
              {selectedAppointment?.status === "CHECKED_IN" && selectedPatientId && <section className={styles.fieldGroup} aria-labelledby="patient-history-heading">
                <div className={styles.recordHeader}><h3 id="patient-history-heading" className={styles.prescriptionTitle}>Tiền sử bệnh án của bệnh nhân</h3><Button type="button" variant="secondary" size="sm" disabled={submitting || clinicalBusy} loading={historyLoading} onClick={() => void startClinicalOperation("OPEN_CLINICAL_RECORDS")}>Xác minh TOTP để xem</Button></div>
                {historyError && <Alert variant="danger" title="Không thể tải tiền sử">{historyError} Xác minh lại để lấy quyền truy cập mới.</Alert>}
                {historyLoading && <Skeleton height={80} width="100%" />}
                {historyRecords && !historyLoading && (historyRecords.length ? <div className={styles.historyList}>{historyRecords.map((item) => <article className={styles.recordCard} key={item.id}><p className={styles.recordMeta}>{formatVietnamDateTime(item.createdAt)} · {item.status}</p><p className={styles.historyDiagnosis}>{item.diagnosis || "Chưa có chẩn đoán"}</p>{item.notes && <p className={styles.fieldHelp}>Ghi chú: {item.notes}</p>}{item.treatmentPlan && <p className={styles.fieldHelp}>Điều trị: {item.treatmentPlan}</p>}{item.prescription?.length > 0 && <ul>{item.prescription.map((medicine, index) => <li key={`${item.id}-${index}`}>{medicine.medicineName} · {medicine.dosage} · {medicine.frequency} · {medicine.duration}</li>)}</ul>}</article>)}</div> : <p className={styles.fieldHelp}>Chưa có bệnh án trước đó trong phạm vi được phép xem.</p>)}
              </section>}
              {finalized && <div className={styles.finalizedBanner}><p className={styles.finalizedTitle}>Hồ sơ đã được chốt hoàn tất (FINAL)</p><p className={styles.finalizedDesc}>Nội dung ở chế độ chỉ đọc. {record?.appointmentCompletion === "COMPLETED" || selectedAppointment?.status === "COMPLETED" ? "Lịch hẹn đã hoàn thành (COMPLETED)." : record?.appointmentCompletion === "PENDING" ? "Đang đồng bộ trạng thái lịch hẹn." : "Trạng thái hoàn thành lịch hẹn chưa được xác nhận."}</p></div>}
              <form className={styles.formGrid} onSubmit={(event) => { event.preventDefault(); if (canSave && validate()) { setLastAttemptedStatus("FINAL"); setConfirmFinal(true); } }}>
                {([
                  ["symptoms", "symptoms-input", "Triệu chứng lâm sàng", "Mô tả triệu chứng bệnh nhân phản ánh"],
                  ["diagnosis", "diagnosis-input", "Chẩn đoán sơ bộ / xác định", "Nhập chẩn đoán"],
                  ["notes", "notes-input", "Ghi chú bác sĩ & Lời dặn", "Ghi chú và dặn dò tái khám"],
                  ["treatmentPlan", "treatment-input", "Kế hoạch điều trị", "Nhập kế hoạch điều trị"],
                ] as const).map(([field, id, label, placeholder]) => <div key={field} className={styles.fieldGroup}><label htmlFor={id} className={styles.fieldLabel}>{label}</label><textarea id={id} className={styles.textarea} rows={3} placeholder={placeholder} value={form[field]} disabled={submitting} readOnly={finalized} onChange={(event) => updateForm({ [field]: event.target.value })} /></div>)}
                <PrescriptionForm items={form.prescription} errors={prescriptionErrors} disabled={submitting} readOnly={finalized} onChange={(prescription) => updateForm({ prescription })} />
                {Object.keys(prescriptionErrors).length > 0 && <Alert variant="warning" title="Dữ liệu chưa hoàn thiện">Điền đủ tên thuốc, liều lượng, tần suất và thời gian ở các hàng đã nhập.</Alert>}
                <div className={styles.formActions}>{finalized ? <Badge variant="success">FINAL · ĐÃ CHỐT HOÀN TẤT</Badge> : <><span className={styles.fieldHelp}>{dirty ? "Có thay đổi chưa lưu" : record ? "Đã lưu bản nháp" : "Chưa lưu hồ sơ"}</span><Button type="button" variant="secondary" disabled={!canSave} loading={submitting && lastAttemptedStatus === "DRAFT"} onClick={() => { if (validate()) void executeSubmit("DRAFT"); }}>Lưu nháp (DRAFT)</Button><Button type="submit" disabled={!canSave} loading={submitting && lastAttemptedStatus === "FINAL"}>Chốt bệnh án (FINAL)</Button></>}</div>
              </form>
            </div>
          )}
        </section>
      </div>
      <ConfirmModal isOpen={confirmFinal} onClose={() => setConfirmFinal(false)} onConfirm={() => void startClinicalOperation("FINALIZE_MEDICAL_RECORD")} title="Xác nhận chốt bệnh án (FINAL)" message="Sau khi chốt bệnh án ở trạng thái FINAL, nội dung và đơn thuốc sẽ chuyển sang chỉ đọc. Trạng thái hoàn thành lịch hẹn cần được hệ thống xác nhận riêng. Bạn có chắc chắn muốn chốt hồ sơ này?" confirmLabel="Xác nhận chốt bệnh án" cancelLabel="Quay lại kiểm tra" variant="primary" loading={clinicalBusy} />
      <Modal isOpen={clinicalChallenge !== null} onClose={() => { if (!clinicalBusy) { setClinicalChallenge(null); setClinicalCode(""); } }} title={clinicalChallenge?.purpose === "FINALIZE_MEDICAL_RECORD" ? "Xác minh TOTP để chốt bệnh án" : clinicalChallenge?.readTarget === "record" ? "Xác minh TOTP để mở hồ sơ" : "Xác minh TOTP để xem tiền sử"} footer={<><Button variant="secondary" disabled={clinicalBusy} onClick={() => setClinicalChallenge(null)}>Hủy</Button><Button disabled={clinicalBusy || !/^\d{6}$/.test(clinicalCode)} loading={clinicalBusy} onClick={() => void verifyClinicalCode()}>Xác minh</Button></>}>
        <p className={styles.fieldHelp}>Nhập mã 6 số hiện tại từ ứng dụng xác thực. Yêu cầu xác minh hết hạn sau 5 phút.</p>
        <Input label="Mã TOTP 6 số" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={clinicalCode} onChange={(event) => setClinicalCode(event.target.value.replace(/\D/g, ""))} />
        {clinicalError && <Alert variant="danger" title="Không thể xác minh">{clinicalError}</Alert>}
      </Modal>
      <ConfirmModal isOpen={pendingSelection !== null} onClose={() => setPendingSelection(null)} onConfirm={() => { setDirty(false); setSelection(pendingSelection!); setPendingSelection(null); }} title="Đổi ca khi chưa lưu?" message="Nội dung chưa lưu của ca hiện tại sẽ bị bỏ. Chọn quay lại để lưu nháp trước khi đổi ca." confirmLabel="Bỏ thay đổi và đổi ca" cancelLabel="Quay lại hồ sơ" variant="danger" />
    </section>
  );
}
