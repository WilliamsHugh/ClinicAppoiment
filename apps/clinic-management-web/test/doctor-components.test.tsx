// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoctorCard } from "../src/features/doctors/doctor-card";
import { SpecialtyFilter } from "../src/features/doctors/specialty-filter";
import { DoctorList } from "../src/features/doctors/doctor-list";
import { SchedulePanel } from "../src/features/doctors/schedule-panel";
import type { Doctor, Schedule, Specialty, TimeOff } from "../src/features/doctors/doctor-api";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const mockDoctor: Doctor = {
  id: "doc-1",
  userId: "user-1",
  specialtyId: "spec-1",
  displayName: "BS. Nguyễn Văn X",
  bio: "Bác sĩ tim mạch",
  isActive: true,
};

const mockSpecialties: Specialty[] = [
  { id: "spec-1", name: "Tim mạch", description: null, isActive: true },
  { id: "spec-2", name: "Nội tiết", description: null, isActive: true },
];

describe("Doctor modular components (M3-WEB-020)", () => {
  it("renders DoctorCard and calls onSelect when clicked", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(
        <DoctorCard
          doctor={mockDoctor}
          specialtyName="Tim mạch"
          isSelected={false}
          onSelect={onSelect}
        />
      );
    });

    expect(host.textContent).toContain("BS. Nguyễn Văn X");
    expect(host.textContent).toContain("Tim mạch");

    const btn = host.querySelector("button")!;
    await act(async () => {
      btn.click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders DoctorCard with inactive status when isActive is false", async () => {
    await act(async () => {
      root.render(
        <DoctorCard
          doctor={{ ...mockDoctor, isActive: false }}
          specialtyName="Tim mạch"
          isSelected={true}
          onSelect={() => {}}
        />
      );
    });

    expect(host.textContent).toContain("Ngừng hoạt động");
  });

  it("renders SpecialtyFilter and invokes onChange", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <SpecialtyFilter
          specialties={mockSpecialties}
          value=""
          onChange={onChange}
        />
      );
    });

    const select = host.querySelector("select")!;
    expect(select.options.length).toBe(3); // "Tất cả", "Tim mạch", "Nội tiết"

    await act(async () => {
      select.value = "spec-2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("spec-2");
  });

  it("renders DoctorList with search form and pagination", async () => {
    await act(async () => {
      root.render(
        <DoctorList
          doctors={{ items: [mockDoctor], page: 1, limit: 20, total: 1 }}
          specialties={mockSpecialties}
          search=""
          onSearchChange={() => {}}
          onSubmitSearch={() => {}}
          specialtyFilter=""
          onSpecialtyFilterChange={() => {}}
          selectedId={null}
          onSelectDoctor={() => {}}
          loading={false}
          page={1}
          onPageChange={() => {}}
        />
      );
    });

    expect(host.textContent).toContain("Tên bác sĩ");
    expect(host.textContent).toContain("Chuyên khoa");
    expect(host.textContent).toContain("BS. Nguyễn Văn X");
  });

  it("renders SchedulePanel with schedule and time off forms", async () => {
    const schedule: Schedule = {
      id: "sch-1",
      doctorId: "doc-1",
      weekday: 1,
      startTime: "08:00",
      endTime: "12:00",
      slotDurationMinutes: 30,
      isActive: true,
    };
    const timeOff: TimeOff = {
      id: "off-1",
      doctorId: "doc-1",
      startAt: "2030-01-01T08:00:00.000Z",
      endAt: "2030-01-01T12:00:00.000Z",
      reason: "Nghỉ phép năm",
    };

    await act(async () => {
      root.render(
        <SchedulePanel
          schedules={[schedule]}
          timeOffs={[timeOff]}
          timeOffError=""
          busy={false}
          detailLoading={false}
          scheduleId={null}
          weekday={1}
          startTime="08:00"
          endTime="12:00"
          duration={30}
          onWeekdayChange={() => {}}
          onStartTimeChange={() => {}}
          onEndTimeChange={() => {}}
          onDurationChange={() => {}}
          onEditSchedule={() => {}}
          onToggleSchedule={() => {}}
          onSubmitSchedule={() => {}}
          onResetScheduleForm={() => {}}
          timeOffId={null}
          offStart=""
          offEnd=""
          offReason=""
          onOffStartChange={() => {}}
          onOffEndChange={() => {}}
          onOffReasonChange={() => {}}
          onEditTimeOff={() => {}}
          onSubmitTimeOff={() => {}}
          onResetTimeOffForm={() => {}}
          onRetryTimeOff={() => {}}
        />
      );
    });

    expect(host.textContent).toContain("Lịch làm việc");
    expect(host.textContent).toContain("Thứ hai · 08:00–12:00 · 30 phút");
    expect(host.textContent).toContain("Thời gian nghỉ");
    expect(host.textContent).toContain("Nghỉ phép năm");
  });
});
