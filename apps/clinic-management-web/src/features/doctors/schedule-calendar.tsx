"use client";

import React from "react";
import type { Schedule } from "./doctor-api";
import styles from "./doctor-panel.module.css";

export const scheduleWeekdays = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const weekOrder = [1, 2, 3, 4, 5, 6, 0];

/** Presentation of existing recurring rules, without generating bookable slots. */
export function ScheduleCalendar({ schedules, disabled, onEdit, onAdd }: {
  schedules: Schedule[];
  disabled: boolean;
  onEdit?: (item: Schedule) => void;
  onAdd?: () => void;
}) {
  if (!schedules.length) return <div className={styles.calendarEmpty}>
    <span aria-hidden="true">▦</span>
    <p>Chưa có ca làm việc trong tuần.</p>
    {onAdd ? <button type="button" disabled={disabled} onClick={onAdd}>Thêm ca làm việc</button>
      : <p className={styles.muted}>Hãy liên hệ nhân viên phòng khám để cập nhật lịch.</p>}
  </div>;

  return <div className={styles.calendarViewport} role="region" aria-label="Lịch tuần định kỳ" tabIndex={0}>
    <div className={styles.calendarWeek}>
      {weekOrder.map((weekday) => {
        const sessions = schedules.filter((item) => item.weekday === weekday)
          .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime) || a.id.localeCompare(b.id));
        return <section key={weekday} className={styles.calendarDay} aria-label={scheduleWeekdays[weekday]}>
          <h3>{scheduleWeekdays[weekday]}</h3>
          <div className={styles.calendarSessions}>{sessions.length ? sessions.map((item) =>
            <article key={item.id} className={`${styles.calendarSession} ${item.isActive ? "" : styles.inactiveSession}`}>
              <strong>{item.startTime}–{item.endTime}</strong>
              <span>{item.slotDurationMinutes} phút/lượt</span>
              <span>{item.isActive ? "Đang áp dụng" : "Đã ngừng ca"}</span>
              {onEdit && <button type="button" disabled={disabled} aria-label={`Sửa ca ${scheduleWeekdays[weekday]}, ${item.startTime}–${item.endTime}`} onClick={() => onEdit(item)}>Sửa</button>}
            </article>) : <p className={styles.muted}>Chưa có ca</p>}</div>
        </section>;
      })}
    </div>
  </div>;
}
