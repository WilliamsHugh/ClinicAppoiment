"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError, createBrowserApiClient, type PaginatedData } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import type { PatientLookupContext } from "../appointments/queue-board";

export interface PatientProfileData {
  id: string;
  userId?: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  insuranceNumber?: string | null;
  address?: string | null;
}

export interface PatientAppointmentHistoryItem {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName?: string;
  scheduledStartAt: string;
  scheduledEndAt?: string;
  status: "PENDING" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  reason?: string | null;
}

export function maskInsuranceNumber(number?: string | null): string {
  if (!number || !number.trim()) return "—";
  const trimmed = number.trim();
  if (trimmed.length <= 5) return trimmed;
  return `${trimmed.slice(0, 5)}...***`;
}

export function formatPatientDate(value?: string | null): string {
  if (!value || !value.trim()) return "Chưa cập nhật";
  const trimmed = value.trim();
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoDate) {
    return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(parsed));
  }
  return trimmed;
}

function formatHistoryDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(parsed));
}

const HISTORY_STATUS_CONFIG: Record<
  PatientAppointmentHistoryItem["status"],
  { label: string; bg: string; color: string; border: string; className: string }
> = {
  PENDING: {
    label: "Chờ xác nhận",
    bg: "#fef3c7",
    color: "#b45309",
    border: "#fde68a",
    className: "bg-amber-100 text-amber-700",
  },
  CONFIRMED: {
    label: "Đã xác nhận",
    bg: "#e0f2fe",
    color: "#0369a1",
    border: "#bae6fd",
    className: "bg-sky-100 text-sky-700",
  },
  CHECKED_IN: {
    label: "Đã check-in",
    bg: "#ede9fe",
    color: "#6d28d9",
    border: "#ddd6fe",
    className: "bg-violet-100 text-violet-700",
  },
  COMPLETED: {
    label: "Hoàn thành",
    bg: "#d1fae5",
    color: "#047857",
    border: "#a7f3d0",
    className: "bg-emerald-100 text-emerald-700",
  },
  CANCELLED: {
    label: "Đã hủy",
    bg: "#ffe4e6",
    color: "#be123c",
    border: "#fecdd3",
    className: "bg-rose-100 text-rose-700",
  },
  NO_SHOW: {
    label: "Không đến",
    bg: "#f1f5f9",
    color: "#475569",
    border: "#e2e8f0",
    className: "bg-slate-100 text-slate-600",
  },
};

export function PatientLookupDrawer({ patientId, appointmentId, onClose }: PatientLookupContext) {
  const session = useSession();
  const api = useMemo(() => createBrowserApiClient(session), [session]);

  const [profile, setProfile] = useState<PatientProfileData | null>(null);
  const [history, setHistory] = useState<Array<PatientAppointmentHistoryItem & { resolvedDoctorName: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = useCallback(() => {
    setRetryCount((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (session.status !== "authenticated" || !patientId) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    async function fetchPatientAndHistory() {
      try {
        const [patientRes, appointmentsRes] = await Promise.all([
          api.get<PatientProfileData>(`/api/v1/patients/${encodeURIComponent(patientId)}`, {
            query: appointmentId ? { appointmentId } : undefined,
            signal: controller.signal,
          }),
          api.get<PaginatedData<PatientAppointmentHistoryItem>>("/api/v1/appointments", {
            query: { patientId, limit: 5, sort: "desc" },
            signal: controller.signal,
          }),
        ]);

        if (controller.signal.aborted) return;

        const rawItems = Array.isArray(appointmentsRes.data?.items) ? appointmentsRes.data.items : [];
        const sortedItems = [...rawItems]
          .sort((a, b) => Date.parse(b.scheduledStartAt) - Date.parse(a.scheduledStartAt))
          .slice(0, 5);

        const doctorCache = new Map<string, string>();
        const uniqueDoctorIds = Array.from(
          new Set(
            sortedItems
              .filter((item) => !item.doctorName && item.doctorId)
              .map((item) => item.doctorId)
          )
        );

        await Promise.all(
          uniqueDoctorIds.map(async (docId) => {
            try {
              const docRes = await api.get<Record<string, unknown>>(
                `/api/v1/doctors/${encodeURIComponent(docId)}`,
                { signal: controller.signal }
              );
              const name =
                (typeof docRes.data?.displayName === "string" && docRes.data.displayName.trim()) ||
                (typeof docRes.data?.fullName === "string" && docRes.data.fullName.trim()) ||
                "Bác sĩ";
              doctorCache.set(docId, name);
            } catch {
              doctorCache.set(docId, "Bác sĩ");
            }
          })
        );

        if (controller.signal.aborted) return;

        setProfile(patientRes.data);
        setHistory(
          sortedItems.map((item) => ({
            ...item,
            resolvedDoctorName: item.doctorName?.trim() || doctorCache.get(item.doctorId) || "Bác sĩ",
          }))
        );
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiClientError) {
          setError(err.message || "Không thể tải hồ sơ bệnh nhân.");
        } else {
          setError("Không thể tải hồ sơ bệnh nhân. Vui lòng thử lại.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void fetchPatientAndHistory();
    return () => controller.abort();
  }, [api, session.status, patientId, appointmentId, retryCount]);

  return (
    <section
      aria-label="Hồ sơ bệnh nhân"
      style={{
        marginTop: "16px",
        padding: "16px",
        borderRadius: "10px",
        border: "1px solid #e2e8f0",
        background: "#f8fafc",
      }}
    >
      <h3
        style={{
          margin: "0 0 12px 0",
          paddingBottom: "8px",
          borderBottom: "1px solid #e2e8f0",
          fontSize: "16px",
          fontWeight: 700,
          color: "#0f172a",
        }}
      >
        Hồ sơ bệnh nhân
      </h3>

      {loading ? (
        <div role="status" aria-label="Đang tải hồ sơ bệnh nhân" style={{ display: "grid", gap: "10px", padding: "8px 0" }}>
          {[0, 1, 2, 3, 4].map((index) => (
            <div
              key={index}
              className="skeleton-line"
              style={{
                height: "16px",
                borderRadius: "6px",
                background: "#e2e8f0",
                width: index % 2 === 0 ? "85%" : "65%",
              }}
            />
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          style={{
            padding: "12px",
            borderRadius: "8px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            fontSize: "14px",
          }}
        >
          <p style={{ margin: "0 0 10px 0" }}>{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #dc2626",
              background: "#fff",
              color: "#dc2626",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Thử lại
          </button>
        </div>
      ) : (
        <>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "110px 1fr",
              rowGap: "8px",
              columnGap: "12px",
              margin: "0 0 16px 0",
              fontSize: "14px",
            }}
          >
            <dt style={{ color: "#64748b", fontWeight: 500 }}>Họ tên:</dt>
            <dd style={{ margin: 0, color: "#0f172a", fontWeight: 600 }}>
              {profile?.fullName?.trim() || "Chưa cập nhật"}
            </dd>

            <dt style={{ color: "#64748b", fontWeight: 500 }}>SĐT:</dt>
            <dd style={{ margin: 0, color: "#0f172a" }}>
              {profile?.phone?.trim() || "Chưa cập nhật"}
            </dd>

            <dt style={{ color: "#64748b", fontWeight: 500 }}>Ngày sinh:</dt>
            <dd style={{ margin: 0, color: "#0f172a" }}>
              {formatPatientDate(profile?.dateOfBirth)}
            </dd>

            <dt style={{ color: "#64748b", fontWeight: 500 }}>Thẻ BHYT:</dt>
            <dd style={{ margin: 0, color: "#0f172a", fontFamily: "monospace", fontWeight: 600 }}>
              {maskInsuranceNumber(profile?.insuranceNumber)}
            </dd>

            <dt style={{ color: "#64748b", fontWeight: 500 }}>Địa chỉ:</dt>
            <dd style={{ margin: 0, color: "#0f172a" }}>
              {profile?.address?.trim() || "Chưa cập nhật"}
            </dd>
          </dl>

          <div
            style={{
              borderTop: "1px solid #e2e8f0",
              paddingTop: "12px",
            }}
          >
            <h4
              style={{
                margin: "0 0 10px 0",
                fontSize: "14px",
                fontWeight: 700,
                color: "#1e293b",
              }}
            >
              Lịch sử đặt khám gần đây
            </h4>

            {history.length === 0 ? (
              <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                Chưa có lịch sử đặt khám.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "grid",
                  gap: "8px",
                }}
              >
                {history.map((item) => {
                  const statusStyle = HISTORY_STATUS_CONFIG[item.status] ?? HISTORY_STATUS_CONFIG.PENDING;
                  return (
                    <li
                      key={item.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        fontSize: "13px",
                      }}
                    >
                      <span style={{ color: "#334155" }}>
                        <strong>{formatHistoryDate(item.scheduledStartAt)}</strong>
                        {" - "}
                        <span>{item.resolvedDoctorName}</span>
                      </span>
                      <span
                        className={statusStyle.className}
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "9999px",
                          fontSize: "12px",
                          fontWeight: 600,
                          background: statusStyle.bg,
                          color: statusStyle.color,
                          border: `1px solid ${statusStyle.border}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {statusStyle.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      <div
        style={{
          marginTop: "14px",
          paddingTop: "12px",
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "6px 14px",
            borderRadius: "6px",
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            color: "#334155",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Đóng
        </button>
      </div>
    </section>
  );
}
