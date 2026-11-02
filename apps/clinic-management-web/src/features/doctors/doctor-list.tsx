import React, { type FormEvent } from "react";
import { LoadingState } from "../../components/states";
import { Pagination } from "../../components/pagination";
import type { Doctor, Page, Specialty } from "./doctor-api";
import { SpecialtyFilter } from "./specialty-filter";
import { DoctorCard } from "./doctor-card";
import styles from "./doctors-panel.module.css";

export interface DoctorListProps {
  doctors: Page<Doctor>;
  specialties: Specialty[];
  search: string;
  onSearchChange: (value: string) => void;
  onSubmitSearch: (event: FormEvent) => void;
  specialtyFilter: string;
  onSpecialtyFilterChange: (value: string) => void;
  selectedId: string | null;
  onSelectDoctor: (doctor: Doctor) => void;
  loading: boolean;
  page: number;
  onPageChange: (page: number) => void;
}

export function DoctorList({
  doctors,
  specialties,
  search,
  onSearchChange,
  onSubmitSearch,
  specialtyFilter,
  onSpecialtyFilterChange,
  selectedId,
  onSelectDoctor,
  loading,
  page,
  onPageChange,
}: DoctorListProps) {
  return (
    <section className={styles.card} aria-label="Tìm bác sĩ">
      <form onSubmit={onSubmitSearch} className={styles.row}>
        <label>
          Tên bác sĩ
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Tìm theo tên"
          />
        </label>
        <SpecialtyFilter
          specialties={specialties}
          value={specialtyFilter}
          onChange={onSpecialtyFilterChange}
        />
        <button type="submit">Tìm kiếm</button>
      </form>

      {loading ? (
        <LoadingState message="Đang tải bác sĩ..." />
      ) : doctors.items.length === 0 ? (
        <p>Chưa có bác sĩ phù hợp.</p>
      ) : (
        <div className={styles.list}>
          {doctors.items.map((item) => (
            <DoctorCard
              key={item.id}
              doctor={item}
              specialtyName={
                specialties.find((specialty) => specialty.id === item.specialtyId)?.name ??
                "Chuyên khoa"
              }
              isSelected={selectedId === item.id}
              onSelect={() => onSelectDoctor(item)}
            />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        limit={doctors.limit}
        total={doctors.total}
        disabled={loading}
        onPageChange={onPageChange}
      />
    </section>
  );
}
