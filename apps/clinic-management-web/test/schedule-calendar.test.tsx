import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScheduleCalendar } from "../src/features/doctors/schedule-calendar";
import type { Schedule } from "../src/features/doctors/doctor-api";

Object.assign(globalThis, { React });
const base: Schedule = { id: "session-1", doctorId: "doctor-1", weekday: 0, startTime: "08:00", endTime: "12:00", slotDurationMinutes: 30, isActive: true };

describe("Recurring weekly calendar presentation", () => {
  it("places Sunday last and sorts split sessions by local clock without mutating input", () => {
    const schedules = [base, { ...base, id: "monday-pm", weekday: 1, startTime: "14:00", endTime: "17:00" },
      { ...base, id: "monday-am", weekday: 1 }];
    const markup = renderToStaticMarkup(<ScheduleCalendar schedules={schedules} disabled={false} />);
    expect(markup.indexOf('aria-label="Thứ hai"')).toBeLessThan(markup.indexOf('aria-label="Chủ nhật"'));
    const monday = markup.slice(markup.indexOf('aria-label="Thứ hai"'), markup.indexOf('aria-label="Thứ ba"'));
    expect(monday.indexOf("08:00–12:00")).toBeLessThan(monday.indexOf("14:00–17:00"));
    expect(schedules[0]).toBe(base);
    expect(markup).not.toContain("doctor-1");
  });
  it("distinguishes an inactive rule and displays five-minute or late sessions without truncating time", () => {
    const markup = renderToStaticMarkup(<ScheduleCalendar schedules={[{ ...base, startTime: "23:50", endTime: "23:55", slotDurationMinutes: 5, isActive: false }]} disabled={false} />);
    expect(markup).toContain("Đã ngừng ca"); expect(markup).toContain("23:50–23:55"); expect(markup).toContain("5 phút/lượt");
    expect(markup).not.toContain("Đang áp dụng");
  });
  it("offers adding only when the owning screen grants an edit callback", () => {
    const readonly = renderToStaticMarkup(<ScheduleCalendar schedules={[]} disabled={false} />);
    expect(readonly).toContain("Chưa có ca làm việc trong tuần"); expect(readonly).not.toContain("<button");
    const editable = renderToStaticMarkup(<ScheduleCalendar schedules={[]} disabled={false} onAdd={() => {}} />);
    expect(editable).toContain("Thêm ca làm việc");
  });
  it("does not render edit controls for another doctor's calendar", () => {
    const markup = renderToStaticMarkup(<ScheduleCalendar schedules={[base]} disabled={false} />);
    expect(markup).not.toContain("<button");
    const pending = renderToStaticMarkup(<ScheduleCalendar schedules={[base]} disabled onEdit={() => {}} />);
    expect(pending).toContain('disabled=""'); expect(pending).toContain("Sửa ca Chủ nhật");
  });
});
