"use client";

import { useEffect, useState, useTransition } from "react";
import { createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";

export interface PatientItem {
  id: string;
  userId: string;
  fullName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  insuranceNumber?: string;
  address?: string;
}

export interface PatientSelectorProps {
  onSelect: (patient: PatientItem) => void;
  selectedPatientId?: string;
}

export function PatientSelector({ onSelect, selectedPatientId }: PatientSelectorProps) {
  const session = useSession();
  const [searchTerm, setSearchTerm] = useState("");
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const loadPatients = async (query: string = "") => {
    if (session.status !== "authenticated") return;
    setLoading(true);
    setError(null);
    try {
      const api = createBrowserApiClient(session);
      const res = await api.get<PatientItem[]>("/api/v1/patients", {
        query: { q: query || undefined, limit: 10 },
      });
      setPatients(res.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không thể tải danh sách bệnh nhân");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
  }, [session.status]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    startTransition(() => {
      loadPatients(val);
    });
  };

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px", background: "#f8fafc" }}>
      <h3 style={{ fontSize: "15px", fontWeight: "600", marginBottom: "8px", color: "#1e293b" }}>Chọn bệnh nhân</h3>
      <div style={{ marginBottom: "12px" }}>
        <input
          type="text"
          value={searchTerm}
          onChange={handleSearchChange}
          placeholder="Tìm theo tên, SĐT, email, mã BHYT..."
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: "6px",
            border: "1px solid #cbd5e1",
            fontSize: "14px",
            boxSizing: "border-box",
            background: "#fff",
          }}
        />
      </div>

      {error && (
        <div style={{ padding: "8px 12px", marginBottom: "8px", color: "#b91c1c", background: "#fef2f2", borderRadius: "4px", fontSize: "13px" }}>
          {error}
        </div>
      )}

      {loading && <div style={{ fontSize: "13px", color: "#64748b", padding: "8px 0" }}>Đang tìm kiếm...</div>}

      {!loading && patients.length === 0 && (
        <div style={{ fontSize: "13px", color: "#64748b", padding: "8px 0" }}>Không tìm thấy bệnh nhân phù hợp.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "240px", overflowY: "auto" }}>
        {patients.map((patient) => {
          const isSelected = patient.id === selectedPatientId;
          return (
            <div
              key={patient.id}
              onClick={() => onSelect(patient)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                background: isSelected ? "#e0f2fe" : "#fff",
                border: isSelected ? "1px solid #0284c7" : "1px solid #e2e8f0",
                borderRadius: "6px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div>
                <div style={{ fontWeight: "600", fontSize: "14px", color: "#0f172a" }}>
                  {patient.fullName || "Chưa đặt tên"}
                </div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                  {patient.phone ? `SĐT: ${patient.phone} • ` : ""}
                  {patient.dateOfBirth ? `NS: ${patient.dateOfBirth} • ` : ""}
                  {patient.insuranceNumber ? `BHYT: ${patient.insuranceNumber}` : ""}
                </div>
              </div>
              <button
                type="button"
                style={{
                  padding: "4px 10px",
                  borderRadius: "4px",
                  border: "none",
                  background: isSelected ? "#0284c7" : "#f1f5f9",
                  color: isSelected ? "#fff" : "#334155",
                  fontSize: "12px",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                {isSelected ? "Đã chọn" : "Chọn"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
