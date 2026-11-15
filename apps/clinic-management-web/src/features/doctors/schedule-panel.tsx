import React, { useState, type FormEvent } from "react";
import { Button, Skeleton } from "../../components/ui";
import { Pagination } from "../../components/pagination";
import type { Schedule, TimeOff } from "./doctor-api";
import { ScheduleCalendar } from "./schedule-calendar";
import styles from "./doctors-panel.module.css";

const weekdays = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const displayTime = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export interface SchedulePanelProps {
  canManage?: boolean;
  scheduleError?: string;
  onRetrySchedule?: () => void;
  scheduleLoading?: boolean;
  timeOffLoading?: boolean;
  timeOffPage?: number;
  timeOffTotal?: number;
  onTimeOffPageChange?: (page: number) => void;
  schedules: Schedule[];
  timeOffs: TimeOff[];
  timeOffError: string;
  busy: boolean;
  busyAction?: string | null;
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
  canManage = true,
  scheduleError,
  onRetrySchedule,
  scheduleLoading = false,
  timeOffLoading = false,
  timeOffPage = 1,
  timeOffTotal = 0,
  onTimeOffPageChange,
  schedules,
  timeOffs,
  timeOffError,
  busy,
  busyAction,
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
  const [scheduleView, setScheduleView] = useState<"calendar" | "list">("list");
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [timeOffFormOpen, setTimeOffFormOpen] = useState(false);
  const scheduleBusy = busy || scheduleLoading || Boolean(scheduleError);
  return (
    <>
      {/* Quản lý lịch làm việc tuần */}
      <section className={styles.card} aria-label={canManage ? "Quản lý lịch làm việc" : "Lịch làm việc định kỳ"}>
        <div className={styles.scheduleHeading}>
          <h2>Lịch làm việc</h2>
          <div role="group" aria-label="Cách hiển thị lịch làm việc">
            <Button type="button" variant={scheduleView === "calendar" ? "primary" : "secondary"} aria-pressed={scheduleView === "calendar"} onClick={() => setScheduleView("calendar")}>Lịch tuần</Button>
            <Button type="button" variant={scheduleView === "list" ? "primary" : "secondary"} aria-pressed={scheduleView === "list"} onClick={() => setScheduleView("list")}>Danh sách</Button>
          </div>
        </div>
        {scheduleError && <div role="alert" className={styles.error}><span>{scheduleError}</span><Button type="button" variant="secondary" disabled={scheduleLoading} onClick={onRetrySchedule}>Tải lại lịch làm việc</Button></div>}
        {scheduleLoading && !schedules.length ? <div aria-busy="true" aria-label="Đang tải lịch làm việc"><Skeleton height={48} /><Skeleton height={48} /></div> : scheduleError && !schedules.length ? null :
        scheduleView === "calendar" ? <ScheduleCalendar schedules={schedules} disabled={scheduleBusy} onEdit={canManage ? (item) => { setScheduleFormOpen(true); onEditSchedule(item); } : undefined} onAdd={canManage ? () => {
          setScheduleFormOpen(true);
          onResetScheduleForm();
        } : undefined} /> : <div className={styles.list} aria-busy={scheduleLoading || undefined}>
          {!schedules.length && <p className={styles.muted}>Chưa có lịch làm việc định kỳ.</p>}
          {schedules.map((item) => (
            <div key={item.id} className={styles.listRow}>
              <span>
                {weekdays[item.weekday]} · {item.startTime}–{item.endTime} · {item.slotDurationMinutes} phút{" "}
                {item.isActive ? "" : "(ngừng)"}
              </span>
              {canManage && <><Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={scheduleBusy}
                onClick={() => { setScheduleFormOpen(true); onEditSchedule(item); }}
              >
                Sửa
              </Button>
              <Button
                type="button"
                variant={item.isActive ? "danger" : "primary"}
                size="sm"
                disabled={scheduleBusy}
                onClick={() => onToggleSchedule(item)}
              >
                {busy && busyAction === `schedule-toggle-${item.id}` ? "Đang xử lý..." : (item.isActive ? "Ngừng" : "Kích hoạt")}
              </Button>
              </>}
            </div>
          ))}
        </div>}
        {canManage && <details open={scheduleFormOpen} onToggle={(event) => setScheduleFormOpen(event.currentTarget.open)} className={styles.editor}>
        <summary>{scheduleId ? "Sửa lịch làm việc" : "Thêm lịch làm việc"}</summary>
        <form onSubmit={onSubmitSchedule}>
        <fieldset className={styles.formFields} disabled={scheduleBusy}>
          <label>
            Thứ
            <select
              id="schedule-weekday"
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
          <Button type="submit" variant="primary" disabled={scheduleBusy}>
            {busy && busyAction === "schedule" ? "Đang lưu..." : (scheduleId ? "Cập nhật lịch" : "Lưu lịch")}
          </Button>
          {scheduleId && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={onResetScheduleForm}
            >
              Thêm mới
            </Button>
          )}
        </fieldset>
        </form>
        </details>}
      </section>

      {/* Thời gian nghỉ phép */}
      {canManage && <section className={styles.card} aria-label="Thời gian nghỉ">
        <h2>Thời gian nghỉ</h2>
        <p className={styles.muted}>Ngày giờ theo Việt Nam (UTC+7).</p>
        {timeOffError && (
          <p role="alert" className={styles.error}>
            {timeOffError}{" "}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || detailLoading}
              onClick={onRetryTimeOff}
            >
              Tải lại thời gian nghỉ
            </Button>
          </p>
        )}
        {timeOffLoading && !timeOffs.length ? <div aria-busy="true" aria-label="Đang tải thời gian nghỉ"><Skeleton height={48} /><Skeleton height={48} /></div> :
        <div className={styles.list} aria-busy={timeOffLoading || undefined}>
          {!timeOffs.length && !timeOffError && <p className={styles.muted}>Chưa có thời gian nghỉ trên trang này.</p>}
          {timeOffs.map((item) => (
            <div key={item.id} className={styles.listRow}>
              <span>
                {displayTime(item.startAt)} – {displayTime(item.endAt)}{" "}
                {item.reason && `· ${item.reason}`}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy || timeOffLoading || Boolean(timeOffError)}
                onClick={() => { setTimeOffFormOpen(true); onEditTimeOff(item); }}
              >
                Sửa
              </Button>
            </div>
          ))}
        </div>}
        {onTimeOffPageChange && timeOffTotal > 20 && <Pagination page={timeOffPage} limit={20} total={timeOffTotal} disabled={timeOffLoading || busy} onPageChange={onTimeOffPageChange} />}
        <details open={timeOffFormOpen} onToggle={(event) => setTimeOffFormOpen(event.currentTarget.open)} className={styles.editor}>
        <summary>{timeOffId ? "Sửa thời gian nghỉ" : "Thêm thời gian nghỉ"}</summary>
        <form onSubmit={onSubmitTimeOff}>
        <fieldset className={styles.formFields} disabled={busy || timeOffLoading || Boolean(timeOffError)}>
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
          <Button type="submit" variant="primary" disabled={busy}>
            {busy && busyAction === "time-off" ? "Đang lưu..." : (timeOffId ? "Cập nhật thời gian nghỉ" : "Lưu thời gian nghỉ")}
          </Button>
          {timeOffId && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={onResetTimeOffForm}
            >
              Thêm mới
            </Button>
          )}
        </fieldset>
        </form>
        </details>
      </section>}
    </>
  );
}
