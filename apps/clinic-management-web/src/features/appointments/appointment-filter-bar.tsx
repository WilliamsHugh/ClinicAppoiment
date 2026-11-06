import React from "react";
import { Calendar } from "lucide-react";
import type { AppointmentStatus } from "@clinic/shared-types";
import { getVietnamTodayISO } from "../../lib/formatting/date-time";
import styles from "./appointments-panel.module.css";
import { Button } from "../../components/ui";

export interface AppointmentFilterBarProps {
  date: string;
  onDateChange: (date: string) => void;
  status: AppointmentStatus | "ALL";
  onStatusChange: (status: AppointmentStatus | "ALL") => void;
  search: string;
  onSearchChange: (search: string) => void;
  onRefresh: () => void;
  onReset: () => void;
  loading?: boolean;
}

const STATUS_OPTIONS: Array<{ key: AppointmentStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "Tất cả" },
  { key: "PENDING", label: "Chờ xác nhận" },
  { key: "CONFIRMED", label: "Đã xác nhận" },
  { key: "CHECKED_IN", label: "Đã check-in" },
  { key: "COMPLETED", label: "Hoàn thành" },
  { key: "CANCELLED", label: "Đã hủy" },
  { key: "NO_SHOW", label: "Không đến" },
];

export function AppointmentFilterBar({
  date,
  onDateChange,
  status,
  onStatusChange,
  search,
  onSearchChange,
  onRefresh,
  onReset,
  loading = false,
}: AppointmentFilterBarProps) {
  const today = getVietnamTodayISO();
  const isFiltered = status !== "ALL" || search.trim().length > 0 || date !== today;

  return (
    <section className={styles.filterBar} aria-label="Bộ lọc lịch hẹn">
      <div className={styles.filterControls}>
        {/* Date Selector */}
        <div className={styles.dateFilterGroup}>
          <label htmlFor="appointment-date-filter" className={styles.dateLabel}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Calendar size={14} aria-hidden="true" /> Ngày khám:
            </span>
          </label>
          <input
            id="appointment-date-filter"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className={styles.dateInput}
            aria-label="Chọn ngày khám"
          />
          {date !== today && (
            <button
              type="button"
              onClick={() => onDateChange(today)}
              className={styles.quickBtn}
              title="Xem lịch hẹn hôm nay"
            >
              Hôm nay
            </button>
          )}
        </div>

        {/* Search input */}
        <div className={styles.searchGroup}>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm theo tên bệnh nhân, bác sĩ, lý do (trong trang hiện tại)..."
            className={styles.searchInput}
            aria-label="Tìm kiếm lịch hẹn"
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {isFiltered && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReset}
              aria-label="Xóa bộ lọc"
            >
              Xóa bộ lọc
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            loading={loading}
            aria-label="Làm mới danh sách"
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className={styles.statusTabs} role="tablist" aria-label="Lọc theo trạng thái">
        {STATUS_OPTIONS.map((opt) => {
          const isActive = status === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onStatusChange(opt.key)}
              className={`${styles.statusTab} ${isActive ? styles.statusTabActive : ""}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
