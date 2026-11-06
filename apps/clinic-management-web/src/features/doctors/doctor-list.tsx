import React, { type FormEvent } from "react";
import { EmptyState, SkeletonCard } from "../../components/states";
import { Button } from "../../components/ui";
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
        <label htmlFor="doctor-search-input">
          Tên bác sĩ
          <input
            id="doctor-search-input"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Tìm theo tên"
            aria-label="Tìm theo tên bác sĩ"
          />
        </label>
        <SpecialtyFilter
          specialties={specialties}
          value={specialtyFilter}
          onChange={onSpecialtyFilterChange}
        />
        <Button type="submit" variant="primary">
          Tìm kiếm
        </Button>
      </form>

      {loading ? (
        <div aria-label="Đang tải bác sĩ..." aria-busy="true">
          <span style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", border: 0 }}>
            Đang tải bác sĩ...
          </span>
          <div className={styles.list}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      ) : doctors.items.length === 0 ? (
        <EmptyState
          title="Chưa có bác sĩ phù hợp"
          message="Không tìm thấy bác sĩ nào theo điều kiện tìm kiếm hoặc chuyên khoa đã chọn."
        />
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
