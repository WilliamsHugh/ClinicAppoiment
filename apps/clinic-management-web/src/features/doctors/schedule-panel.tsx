import React, { type FormEvent } from "react";
import type { Schedule, TimeOff } from "./doctor-api";
import styles from "./doctors-panel.module.css";

const weekdays = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const displayTime = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export interface SchedulePanelProps {
  schedules: Schedule[];
  timeOffs: TimeOff[];
  timeOffError: string;
  busy: boolean;
  detailLoading: boolean;
  scheduleId: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  duration: number;
  onWeekdayChange: (w: number) => void;
  onStartTimeChange: (t: string) => void;
  onEndTimeChange: (t: string) => void;
  onDurationChange: (d: number) => void;
  onEditSchedule: (item: Schedule) => void;
  onToggleSchedule: (item: Schedule) => void;
  onSubmitSchedule: (event: FormEvent) => void;
  onResetScheduleForm: () => void;

  timeOffId: string | null;
  offStart: string;
  offEnd: string;
  offReason: string;
  onOffStartChange: (s: string) => void;
  onOffEndChange: (e: string) => void;
  onOffReasonChange: (r: string) => void;
  onEditTimeOff: (item: TimeOff) => void;
  onSubmitTimeOff: (event: FormEvent) => void;
  onResetTimeOffForm: () => void;
  onRetryTimeOff: () => void;
}

export function SchedulePanel({
  schedules,
  timeOffs,
  timeOffError,
  busy,
  detailLoading,
  scheduleId,
  weekday,
  startTime,
  endTime,
  duration,
  onWeekdayChange,
  onStartTimeChange,
  onEndTimeChange,
  onDurationChange,
  onEditSchedule,
  onToggleSchedule,
  onSubmitSchedule,
  onResetScheduleForm,

  timeOffId,
  offStart,
  offEnd,
  offReason,
  onOffStartChange,
  onOffEndChange,
  onOffReasonChange,
  onEditTimeOff,
  onSubmitTimeOff,
  onResetTimeOffForm,
  onRetryTimeOff,
}: SchedulePanelProps) {
  return (
    <>
      {/* Quản lý lịch làm việc tuần */}
      <section className={styles.card} aria-label="Quản lý lịch làm việc">
        <h2>Lịch làm việc</h2>
        <div className={styles.list}>
          {schedules.map((item) => (
            <div key={item.id} className={styles.listRow}>
              <span>
                {weekdays[item.weekday]} · {item.startTime}–{item.endTime} · {item.slotDurationMinutes} phút{" "}
                {item.isActive ? "" : "(ngừng)"}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onEditSchedule(item)}
              >
                Sửa
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onToggleSchedule(item)}
              >
                {item.isActive ? "Ngừng" : "Kích hoạt"}
              </button>
            </div>
          ))}
        </div>
        <form className={styles.row} onSubmit={onSubmitSchedule}>
          <label>
            Thứ
            <select
              value={weekday}
              onChange={(event) => onWeekdayChange(Number(event.target.value))}
            >
              {weekdays.map((label, index) => (
                <option key={index} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bắt đầu
            <input
              type="time"
              required
              value={startTime}
              onChange={(event) => onStartTimeChange(event.target.value)}
            />
          </label>
          <label>
            Kết thúc
            <input
              type="time"
              required
              value={endTime}
              onChange={(event) => onEndTimeChange(event.target.value)}
            />
          </label>
          <label>
            Phút mỗi lượt
            <input
              type="number"
              min="5"
              max="240"
              required
              value={duration}
              onChange={(event) => onDurationChange(Number(event.target.value))}
            />
          </label>
          <button type="submit" disabled={busy}>
            Lưu lịch
          </button>
          {scheduleId && (
            <button
              type="button"
              disabled={busy}
              onClick={onResetScheduleForm}
            >
              Thêm mới
            </button>
          )}
        </form>
      </section>

      {/* Thời gian nghỉ phép */}
      <section className={styles.card} aria-label="Thời gian nghỉ">
        <h2>Thời gian nghỉ</h2>
        {timeOffError && (
          <p role="alert" className={styles.error}>
            {timeOffError}{" "}
            <button
              type="button"
              disabled={busy || detailLoading}
              onClick={onRetryTimeOff}
            >
              Tải lại thời gian nghỉ
            </button>
          </p>
        )}
        <div className={styles.list}>
          {timeOffs.map((item) => (
            <div key={item.id} className={styles.listRow}>
              <span>
                {displayTime(item.startAt)} – {displayTime(item.endAt)}{" "}
                {item.reason && `· ${item.reason}`}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onEditTimeOff(item)}
              >
                Sửa
              </button>
            </div>
          ))}
        </div>
        <form className={styles.row} onSubmit={onSubmitTimeOff}>
          <label>
            Bắt đầu (giờ Việt Nam)
            <input
              type="datetime-local"
              required
              value={offStart}
              onChange={(event) => onOffStartChange(event.target.value)}
            />
          </label>
          <label>
            Kết thúc (giờ Việt Nam)
            <input
              type="datetime-local"
              required
              value={offEnd}
              onChange={(event) => onOffEndChange(event.target.value)}
            />
          </label>
          <label>
            Lý do
            <input
              value={offReason}
              onChange={(event) => onOffReasonChange(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            Lưu thời gian nghỉ
          </button>
          {timeOffId && (
            <button
              type="button"
              disabled={busy}
              onClick={onResetTimeOffForm}
            >
              Thêm mới
            </button>
          )}
        </form>
      </section>
    </>
  );
}
