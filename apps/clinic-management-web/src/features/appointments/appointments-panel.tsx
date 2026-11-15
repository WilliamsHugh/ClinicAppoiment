"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { AppointmentStatus } from "@clinic/shared-types";
import { getVietnamTodayISO } from "../../lib/formatting/date-time";
import { useSession } from "../../lib/session/session-context";
import { createBrowserApiClient, ApiClientError, toUserFriendlyError } from "../../lib/api/client";
import {
  EmptyState,
  ErrorState,
  PermissionDeniedState,
  SkeletonTable,
  ConfirmModal,
  Button,
  Alert,
} from "../../components/ui";
import { appointmentApi, type Appointment } from "./appointment-api";
import { AppointmentFilterBar } from "./appointment-filter-bar";
import { AppointmentsTable } from "./appointments-table";
import { PageHeader } from "../../components/page-header";
import styles from "./appointments-panel.module.css";

interface ConfirmDialogState {
  isOpen: boolean;
  appointment: Appointment | null;
  action: "confirm" | "check-in" | "cancel" | "no-show" | null;
  title: string;
  description: string;
  confirmLabel: string;
  variant: "primary" | "danger";
}

export function AppointmentsPanel({ onOpenQueue }: { onOpenQueue?: () => void } = {}) {
  const router = useRouter();
  const session = useSession();
  const role = session.identity?.role;
  const isAuthorized = role === "DOCTOR" || role === "STAFF" || role === "ADMIN";

  // Filter states
  const todayStr = useMemo(() => getVietnamTodayISO(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedStatus, setSelectedStatus] = useState<AppointmentStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  // Data states
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadedQuery, setLoadedQuery] = useState("");
  const requestRef = useRef(0);
  const queryKey = `${selectedDate}:${selectedStatus}:${page}`;
  const currentAppointments = loadedQuery === queryKey ? appointments : [];
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isStaleData, setIsStaleData] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | undefined>();

  // Resolution maps
  const [patientsMap, setPatientsMap] = useState<Record<string, string>>({});
  const [doctorsMap, setDoctorsMap] = useState<Record<string, string>>({});
  const [specialtiesMap, setSpecialtiesMap] = useState<Record<string, string>>({});

  // Action states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const actionBusyRef = useRef(false);
  const [rowConflicts, setRowConflicts] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: "success" | "warning" | "error" } | null>(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    appointment: null,
    action: null,
    title: "",
    description: "",
    confirmLabel: "",
    variant: "danger",
  });

  const api = useMemo(() => appointmentApi(createBrowserApiClient(session)), [session]);

  // Show auto-dismissing toast
  const showToast = useCallback((message: string, type: "success" | "warning" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((cur) => (cur?.message === message ? null : cur));
    }, 4000);
  }, []);

  // Preload doctors and specialties for name resolution
  useEffect(() => {
    if (!isAuthorized) return;

    let isMounted = true;
    async function loadMetadata() {
      try {
        const [docsRes, specsRes] = await Promise.allSettled([
          api.doctors(),
          api.specialties(),
        ]);

        if (isMounted) {
          if (docsRes.status === "fulfilled") {
            const map: Record<string, string> = {};
            for (const doc of docsRes.value.data.items) {
              map[doc.id] = doc.displayName;
            }
            setDoctorsMap(map);
          }
          if (specsRes.status === "fulfilled") {
            const map: Record<string, string> = {};
            for (const spec of specsRes.value.data.items) {
              map[spec.id] = spec.name;
            }
            setSpecialtiesMap(map);
          }
        }
      } catch {
        // Non-blocking metadata preload
      }
    }
    loadMetadata();

    return () => {
      isMounted = false;
    };
  }, [api, isAuthorized]);

  // Load appointments
  const fetchAppointments = useCallback(
    async (isRefresh = false) => {
      if (!isAuthorized) return;
      const request = ++requestRef.current;
      if (isRefresh && currentAppointments.length > 0) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      setErrorRequestId(undefined);

      try {
        // Create local day boundaries for from/to in Vietnam timezone (GMT+7)
        const from = new Date(`${selectedDate}T00:00:00+07:00`).toISOString();
        const to = new Date(Date.parse(from) + 86400_000).toISOString();

        const res = await api.list({
          from,
          to,
          status: selectedStatus === "ALL" ? undefined : selectedStatus,
          page,
          limit: 20,
        });

        if (request !== requestRef.current) return;
        const items = res.data.items;
        setAppointments(items);
        setLoadedQuery(queryKey);
        setTotalCount(res.data.total ?? items.length);
        setIsStaleData(false);

        // Resolve patient names asynchronously
        const unresolvedPatientIds = items
          .map((a) => a.patientId)
          .filter((id) => !patientsMap[id]);

        if (unresolvedPatientIds.length > 0) {
          const uniqueIds = Array.from(new Set(unresolvedPatientIds));
          Promise.allSettled(
            uniqueIds.map((pid) => {
              const appt =
                items.find(
                  (a) =>
                    a.patientId === pid &&
                    a.status !== "CANCELLED" &&
                    a.status !== "NO_SHOW"
                ) ?? items.find((a) => a.patientId === pid);
              return api.getPatient(pid, appt?.id);
            })
          ).then((results) => {
            if (request !== requestRef.current) return;
            setPatientsMap((prev) => {
              const updated = { ...prev };
              results.forEach((r, idx) => {
                const pid = uniqueIds[idx];
                if (r.status === "fulfilled" && r.value.data.fullName) {
                  updated[pid] = r.value.data.fullName;
                }
              });
              return updated;
            });
          });
        }
      } catch (err: unknown) {
        if (request !== requestRef.current) return;
        if (currentAppointments.length > 0) {
          setIsStaleData(true);
          showToast(
            "Không thể cập nhật danh sách lịch hẹn mới nhất. Đang hiển thị kết quả gần nhất.",
            "warning"
          );
        } else {
          if (err instanceof ApiClientError) {
            setError(toUserFriendlyError(err));
            setErrorRequestId(err.requestId);
          } else {
            setError("Không thể tải danh sách lịch hẹn. Vui lòng kiểm tra kết nối.");
          }
        }
      } finally {
        if (request === requestRef.current) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [api, isAuthorized, selectedDate, selectedStatus, page, patientsMap, currentAppointments.length, queryKey, showToast]
  );

  useEffect(() => {
    fetchAppointments(false);
    return () => { requestRef.current++; };
  }, [api, isAuthorized, selectedDate, selectedStatus, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter client-side search query
  const filteredAppointments = useMemo(() => {
    if (!searchQuery.trim()) return currentAppointments;
    const q = searchQuery.trim().toLowerCase();

    return currentAppointments.filter((appt) => {
      const patientName = patientsMap[appt.patientId]?.toLowerCase() || "";
      const doctorName = doctorsMap[appt.doctorId]?.toLowerCase() || "";
      const reason = appt.reason?.toLowerCase() || "";
      const shortId = appt.patientId.slice(-4).toLowerCase();

      return (
        patientName.includes(q) ||
        doctorName.includes(q) ||
        reason.includes(q) ||
        shortId.includes(q)
      );
    });
  }, [appointments, loadedQuery, queryKey, searchQuery, patientsMap, doctorsMap]);

  // Handlers for status transitions
  const handleExecuteConfirm = async () => {
    const appointment = confirmDialog.appointment;
    if (!appointment || actionBusyRef.current) return;
    actionBusyRef.current = true;

    setActionLoadingId(appointment.id);
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
    setRowConflicts((prev) => {
      const copy = { ...prev };
      delete copy[appointment.id];
      return copy;
    });

    try {
      const updated = await api.confirm(appointment.id);
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointment.id ? updated.data : a))
      );
      showToast("Đã xác nhận lịch hẹn thành công", "success");
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 409) {
        setRowConflicts((prev) => ({
          ...prev,
          [appointment.id]: "Xung đột trạng thái: Lịch hẹn đã được cập nhật hoặc không thể xác nhận ở trạng thái hiện tại.",
        }));
        showToast("Xung đột trạng thái (409)", "warning");
      } else {
        showToast(toUserFriendlyError(err, "Không thể xác nhận lịch hẹn"), "error");
      }
    } finally {
      actionBusyRef.current = false;
      setActionLoadingId(null);
    }
  };

  const handleExecuteCheckIn = async () => {
    const appointment = confirmDialog.appointment;
    if (!appointment || actionBusyRef.current) return;
    actionBusyRef.current = true;

    setActionLoadingId(appointment.id);
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
    setRowConflicts((prev) => {
      const copy = { ...prev };
      delete copy[appointment.id];
      return copy;
    });

    try {
      const updated = await api.checkIn(appointment.id);
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointment.id ? updated.data : a))
      );
      showToast("Check-in cho bệnh nhân thành công", "success");
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 409) {
        setRowConflicts((prev) => ({
          ...prev,
          [appointment.id]: "Xung đột trạng thái: Lịch hẹn không ở trạng thái 'Đã xác nhận' để check-in.",
        }));
        showToast("Xung đột trạng thái (409)", "warning");
      } else {
        showToast(toUserFriendlyError(err, "Không thể thực hiện check-in"), "error");
      }
    } finally {
      actionBusyRef.current = false;
      setActionLoadingId(null);
    }
  };

  const handleConfirm = (appointment: Appointment) => {
    const pName = patientsMap[appointment.patientId] || `Bệnh nhân #${appointment.patientId.slice(-4).toUpperCase()}`;
    setConfirmDialog({
      isOpen: true,
      appointment,
      action: "confirm",
      title: "Xác nhận lịch hẹn",
      description: `Bạn có chắc chắn muốn xác nhận lịch hẹn khám cho ${pName}? ${reviewContext(appointment)} Trạng thái sẽ chuyển từ Chờ xác nhận sang Đã xác nhận.`,
      confirmLabel: "Xác nhận lịch hẹn",
      variant: "primary",
    });
  };

  const handleCheckIn = (appointment: Appointment) => {
    const pName = patientsMap[appointment.patientId] || `Bệnh nhân #${appointment.patientId.slice(-4).toUpperCase()}`;
    setConfirmDialog({
      isOpen: true,
      appointment,
      action: "check-in",
      title: "Xác nhận tiếp đón (Check-in)",
      description: `Ghi nhận ${pName} đã có mặt tại phòng khám và chuyển vào hàng đợi chờ bác sĩ khám? ${reviewContext(appointment)}`,
      confirmLabel: "Xác nhận Check-in",
      variant: "primary",
    });
  };

  const handleExecuteCancel = async () => {
    const appointment = confirmDialog.appointment;
    if (!appointment || actionBusyRef.current) return;
    actionBusyRef.current = true;

    setActionLoadingId(appointment.id);
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
    setRowConflicts((prev) => {
      const copy = { ...prev };
      delete copy[appointment.id];
      return copy;
    });

    try {
      const updated = await api.cancel(appointment.id, "Hủy bởi nhân viên quản trị");
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointment.id ? updated.data : a))
      );
      showToast("Đã hủy lịch hẹn", "success");
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 409) {
        setRowConflicts((prev) => ({
          ...prev,
          [appointment.id]: "Xung đột trạng thái: Không thể hủy lịch hẹn ở trạng thái hiện tại.",
        }));
        showToast("Xung đột trạng thái (409)", "warning");
      } else {
        showToast(toUserFriendlyError(err, "Không thể hủy lịch hẹn"), "error");
      }
    } finally {
      actionBusyRef.current = false;
      setActionLoadingId(null);
    }
  };

  const handleExecuteNoShow = async () => {
    const appointment = confirmDialog.appointment;
    if (!appointment || actionBusyRef.current) return;
    actionBusyRef.current = true;

    setActionLoadingId(appointment.id);
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
    setRowConflicts((prev) => {
      const copy = { ...prev };
      delete copy[appointment.id];
      return copy;
    });

    try {
      const updated = await api.noShow(appointment.id, "Bệnh nhân không đến theo lịch hẹn");
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointment.id ? updated.data : a))
      );
      showToast("Đã ghi nhận bệnh nhân không đến", "success");
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 409) {
        setRowConflicts((prev) => ({
          ...prev,
          [appointment.id]: "Xung đột trạng thái: Lịch hẹn không ở trạng thái 'Đã xác nhận' để ghi nhận vắng mặt.",
        }));
        showToast("Xung đột trạng thái (409)", "warning");
      } else {
        showToast(toUserFriendlyError(err, "Không thể cập nhật trạng thái"), "error");
      }
    } finally {
      actionBusyRef.current = false;
      setActionLoadingId(null);
    }
  };

  const handleRequestCancel = (appointment: Appointment) => {
    const pName = patientsMap[appointment.patientId] || `Bệnh nhân #${appointment.patientId.slice(-4).toUpperCase()}`;
    setConfirmDialog({
      isOpen: true,
      appointment,
      action: "cancel",
      title: "Xác nhận hủy lịch hẹn",
      description: `Bạn có chắc chắn muốn hủy lịch hẹn của ${pName}? ${reviewContext(appointment)} Thao tác này sẽ cập nhật trạng thái sang "Đã hủy" và không thể hoàn tác.`,
      confirmLabel: "Hủy lịch hẹn",
      variant: "danger",
    });
  };

  const handleRequestNoShow = (appointment: Appointment) => {
    const pName = patientsMap[appointment.patientId] || `Bệnh nhân #${appointment.patientId.slice(-4).toUpperCase()}`;
    setConfirmDialog({
      isOpen: true,
      appointment,
      action: "no-show",
      title: "Xác nhận bệnh nhân không đến",
      description: `Đánh dấu ${pName} không đến phòng khám theo giờ hẹn đã đăng ký? ${reviewContext(appointment)}`,
      confirmLabel: "Xác nhận vắng mặt",
      variant: "danger",
    });
  };

  const handleViewRecord = (appointment: Appointment) => {
    router.push(`/medical-records?appointmentId=${encodeURIComponent(appointment.id)}`);
  };

  function reviewContext(appointment: Appointment) {
    const dateTime = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short", hourCycle: "h23",
    }).format(new Date(appointment.scheduledStartAt));
    return `${doctorsMap[appointment.doctorId] ?? "Chưa có tên bác sĩ"} · ${dateTime} (UTC+7).`;
  }

  const handleResetFilters = () => {
    setSelectedDate(todayStr);
    setSelectedStatus("ALL");
    setSearchQuery("");
    setPage(1);
  };

  const handleClearConflict = (appointmentId: string) => {
    setRowConflicts((prev) => {
      const copy = { ...prev };
      delete copy[appointmentId];
      return copy;
    });
  };

  // Permission check
  if (!isAuthorized) {
    return (
      <div className={`page-stack ${styles.panel}`}>
        <PageHeader pathname="/appointments" />
        <PermissionDeniedState
          title="Quyền truy cập hạn chế"
          message="Trang quản lý lịch hẹn chỉ dành cho Bác sĩ, Nhân viên phòng khám và Quản trị viên."
          action={{ label: "Về bảng điều khiển", href: "/dashboard" }}
        />
      </div>
    );
  }

  const isFiltered =
    selectedStatus !== "ALL" ||
    searchQuery.trim().length > 0 ||
    selectedDate !== todayStr;

  return (
    <div className={`page-stack ${styles.panel}`}>
      {/* Page Header */}
      <PageHeader
        pathname="/appointments"
        actions={onOpenQueue ? <Button variant="secondary" type="button" onClick={onOpenQueue}>Bảng hàng đợi</Button> : undefined}
      />

      {/* Filter Bar */}
      <AppointmentFilterBar
        date={selectedDate}
        onDateChange={(d) => {
          setSelectedDate(d);
          setPage(1);
        }}
        status={selectedStatus}
        onStatusChange={(s) => {
          setSelectedStatus(s);
          setPage(1);
        }}
        search={searchQuery}
        onSearchChange={setSearchQuery}
        onRefresh={() => void fetchAppointments(true)}
        onReset={handleResetFilters}
        loading={loading || isRefreshing}
      />

      {/* Main Content Area / State Matrix */}
      {loading && currentAppointments.length === 0 ? (
        <SkeletonTable
          rows={8}
          headers={
            role === "DOCTOR"
              ? ["Giờ khám", "Bệnh nhân", "Trạng thái", "Thao tác"]
              : ["Giờ khám", "Bệnh nhân", "Bác sĩ", "Chuyên khoa", "Trạng thái", "Thao tác"]
          }
        />
      ) : error && currentAppointments.length === 0 ? (
        <ErrorState
          message={error}
          requestId={errorRequestId}
          onRetry={() => void fetchAppointments(false)}
        />
      ) : filteredAppointments.length === 0 ? (
        isFiltered ? (
          <EmptyState
            title="Không tìm thấy lịch hẹn"
            message={searchQuery.trim() ? "Không có kết quả trên trang hiện tại. Bạn có thể đổi từ khóa hoặc chuyển trang để tìm tiếp." : "Không có lịch hẹn nào phù hợp với bộ lọc đã chọn."}
            action={{
              label: "Xóa bộ lọc",
              onClick: handleResetFilters,
            }}
          />
        ) : (
          <EmptyState
            title="Hôm nay chưa có lịch hẹn nào"
            message={`Không tìm thấy lịch hẹn nào trong ngày ${selectedDate}.`}
            action={{
              label: "Làm mới",
              onClick: () => void fetchAppointments(false),
            }}
          />
        )
      ) : (
        <div
          aria-busy={isRefreshing ? "true" : undefined}
          style={{ opacity: isRefreshing ? 0.75 : 1, transition: "opacity 0.2s ease" }}
        >
          {isRefreshing && (
            <div className={styles.refreshingNotice} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <span>Đang tải lại dữ liệu lịch hẹn...</span>
            </div>
          )}
          {isStaleData && (
            <div style={{ marginBottom: 16 }}>
              <Alert variant="warning" title="Dữ liệu chưa thể cập nhật (Đang hiển thị kết quả gần nhất)">
                <div>
                  Không thể kết nối đến máy chủ để làm mới lịch hẹn. Đang hiển thị kết quả đã lưu gần nhất.
                </div>
                <div style={{ marginTop: 8 }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    type="button"
                    disabled={loading || isRefreshing}
                    onClick={() => void fetchAppointments(true)}
                  >
                    Thử lại
                  </Button>
                </div>
              </Alert>
            </div>
          )}
          <AppointmentsTable
            appointments={filteredAppointments}
            role={role}
            patientsMap={patientsMap}
            doctorsMap={doctorsMap}
            specialtiesMap={specialtiesMap}
            actionLoadingId={actionLoadingId}
            rowConflicts={rowConflicts}
            onClearConflict={handleClearConflict}
            onConfirm={handleConfirm}
            onRequestCancel={handleRequestCancel}
            onCheckIn={handleCheckIn}
            onRequestNoShow={handleRequestNoShow}
            onViewRecord={handleViewRecord}
          />

        </div>
      )}

          {totalCount > 20 && (
            <nav className={styles.paginationBar} aria-label="Phân trang lịch hẹn">
              <span>
                {filteredAppointments.length} kết quả trên trang {page} · {totalCount} lịch hẹn theo bộ lọc ngày và trạng thái
              </span>
              <div className={styles.paginationControls}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading || isRefreshing}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trang trước
                </Button>
                <span aria-live="polite">Trang {page} / {Math.ceil(totalCount / 20)}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page * 20 >= totalCount || loading || isRefreshing}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Trang sau
                </Button>
              </div>
            </nav>
          )}

      {/* Action Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={
          confirmDialog.action === "confirm"
            ? handleExecuteConfirm
            : confirmDialog.action === "check-in"
            ? handleExecuteCheckIn
            : confirmDialog.action === "cancel"
            ? handleExecuteCancel
            : handleExecuteNoShow
        }
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel="Quay lại"
        variant={confirmDialog.variant}
        isLoading={actionLoadingId !== null}
      />

      {/* Toast Notification */}
      {toast && (
        <div className={styles.toastWrapper}>
          <div
            className={`${styles.toast} ${
              toast.type === "success"
                ? styles.toastSuccess
                : toast.type === "warning"
                ? styles.toastWarning
                : styles.toastError
            }`}
            role="status"
          >
            <span>{toast.message}</span>
            <button
              type="button"
              className={styles.toastClose}
              onClick={() => setToast(null)}
              aria-label="Đóng thông báo"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
