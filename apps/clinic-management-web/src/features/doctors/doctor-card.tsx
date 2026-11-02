import React from "react";
import type { Doctor } from "./doctor-api";
import styles from "./doctors-panel.module.css";

export interface DoctorCardProps {
  doctor: Doctor;
  specialtyName?: string;
  isSelected: boolean;
  onSelect: () => void;
}

export function DoctorCard({
  doctor,
  specialtyName = "Chuyên khoa",
  isSelected,
  onSelect,
}: DoctorCardProps) {
  return (
    <button
      key={doctor.id}
      type="button"
      className={`${styles.doctorCard} ${isSelected ? styles.selected : ""}`}
      onClick={onSelect}
    >
      <div className={styles.doctorCardInfo}>
        <strong>{doctor.displayName}</strong>
        <span>{specialtyName}</span>
      </div>
      {!doctor.isActive && (
        <span style={{ color: "var(--danger)", fontWeight: 500, fontSize: "0.8125rem" }}>
          Ngừng hoạt động
        </span>
      )}
    </button>
  );
}
