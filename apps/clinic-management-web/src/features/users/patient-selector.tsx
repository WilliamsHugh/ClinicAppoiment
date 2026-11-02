"use client";

import React, { useEffect, useState } from "react";
import { createBrowserApiClient, type PaginatedData } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import { Alert } from "../../components/ui";
import styles from "./patient-selector.module.css";

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
  appointmentId?: string;
}

export function PatientSelector({
  onSelect,
  selectedPatientId,
  appointmentId,
}: PatientSelectorProps) {
  const session = useSession();
  const [searchTerm, setSearchTerm] = useState("");
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPatients = async (query: string = "") => {
    if (session.status !== "authenticated") return;
    setLoading(true);
    setError(null);
    try {
      const api = createBrowserApiClient(session);
      const res = await api.get<PaginatedData<PatientItem>>("/api/v1/patients", {
        query: { q: query || undefined, limit: 10, appointmentId },
      });
      setPatients(res.data.items);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải danh sách bệnh nhân"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPatients(searchTerm), 250);
    return () => window.clearTimeout(timer);
  }, [session.status, searchTerm, appointmentId]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Chọn bệnh nhân</h3>
      <div className={styles.searchContainer}>
        <input
          id="patient-search-input"
          type="text"
          value={searchTerm}
          onChange={handleSearchChange}
          placeholder="Tìm theo tên, SĐT, email, mã BHYT..."
          className={styles.searchInput}
          aria-label="Tìm kiếm bệnh nhân"
        />
      </div>

      {error && (
        <Alert variant="danger" title="Lỗi tìm kiếm" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && <div className={styles.statusMessage}>Đang tìm kiếm...</div>}

      {!loading && patients.length === 0 && (
        <div className={styles.statusMessage}>Không tìm thấy bệnh nhân phù hợp.</div>
      )}

      <div className={styles.patientList} role="listbox" aria-label="Danh sách bệnh nhân">
        {patients.map((patient) => {
          const isSelected = patient.id === selectedPatientId;
          return (
            <div
              key={patient.id}
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              onClick={() => onSelect(patient)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(patient);
                }
              }}
              className={`${styles.patientItem} ${
                isSelected ? styles.patientItemSelected : ""
              }`.trim()}
            >
              <div className={styles.patientInfo}>
                <div className={styles.patientName}>
                  {patient.fullName || "Chưa đặt tên"}
                </div>
                <div className={styles.patientMeta}>
                  {patient.phone ? `SĐT: ${patient.phone} • ` : ""}
                  {patient.dateOfBirth ? `NS: ${patient.dateOfBirth} • ` : ""}
                  {patient.insuranceNumber ? `BHYT: ${patient.insuranceNumber}` : ""}
                </div>
              </div>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className={`${styles.selectButton} ${
                  isSelected ? styles.selectButtonSelected : ""
                }`.trim()}
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
