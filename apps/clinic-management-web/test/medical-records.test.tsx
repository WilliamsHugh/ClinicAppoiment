import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { AppointmentSelector } from "../src/features/medical-records/appointment-selector";
import { PrescriptionForm } from "../src/features/medical-records/prescription-form";

describe("Medical Records Feature Components (M3-WEB-011)", () => {
  describe("AppointmentSelector", () => {
    const mockAppointments = [
      {
        id: "appt-1",
        patientId: "patient-uuid-1234-5678-abcd",
        doctorId: "doc-1",
        scheduledStartAt: "2026-11-02T09:00:00.000Z",
        status: "CHECKED_IN",
      },
      {
        id: "appt-2",
        patientId: "patient-uuid-9999-8888-ef01",
        doctorId: "doc-1",
        scheduledStartAt: "2026-11-02T10:00:00.000Z",
        status: "CONFIRMED",
      },
    ];

    it("renders only CHECKED_IN appointments", () => {
      const html = renderToStaticMarkup(
        <AppointmentSelector
          appointments={mockAppointments}
          selectedAppointmentId=""
          onSelect={vi.fn()}
        />
      );
      expect(html).toContain("appt-1");
      expect(html).not.toContain("appt-2");
    });

    it("displays resolved patient full name when available", () => {
      const html = renderToStaticMarkup(
        <AppointmentSelector
          appointments={mockAppointments}
          selectedAppointmentId=""
          patientNames={{ "patient-uuid-1234-5678-abcd": "Trần Thị Lan" }}
          onSelect={vi.fn()}
        />
      );
      expect(html).toContain("Trần Thị Lan");
      expect(html).not.toContain("patient-uuid-1234-5678-abcd");
    });

    it("formats short fallback 'Bệnh nhân #xxxx' instead of leaking raw UUID", () => {
      const html = renderToStaticMarkup(
        <AppointmentSelector
          appointments={mockAppointments}
          selectedAppointmentId=""
          patientNames={{}}
          onSelect={vi.fn()}
        />
      );
      expect(html).toContain("Bệnh nhân #abcd");
      expect(html).not.toContain("patient-uuid-1234-5678-abcd");
    });

    it("displays error with role='alert' when error prop is present", () => {
      const html = renderToStaticMarkup(
        <AppointmentSelector
          appointments={mockAppointments}
          selectedAppointmentId=""
          error="Vui lòng chọn lịch hẹn"
          onSelect={vi.fn()}
        />
      );
      expect(html).toContain("role=\"alert\"");
      expect(html).toContain("Vui lòng chọn lịch hẹn");
    });
  });

  describe("PrescriptionForm", () => {
    const mockItems = [
      {
        medicineName: "Amoxicillin 500mg",
        dosage: "1 viên",
        frequency: "3 lần/ngày sau ăn",
        duration: "7 ngày",
      },
    ];

    it("renders prescription inputs with accessible aria-labels", () => {
      const html = renderToStaticMarkup(
        <PrescriptionForm items={mockItems} onChange={vi.fn()} />
      );
      expect(html).toContain("aria-label=\"Tên thuốc hàng 1\"");
      expect(html).toContain("aria-label=\"Liều dùng hàng 1\"");
      expect(html).toContain("aria-label=\"Tần suất dùng hàng 1\"");
      expect(html).toContain("aria-label=\"Thời gian dùng hàng 1\"");
      expect(html).toContain("value=\"Amoxicillin 500mg\"");
    });

    it("renders contextual delete button aria-label with medicine name", () => {
      const html = renderToStaticMarkup(
        <PrescriptionForm items={mockItems} onChange={vi.fn()} />
      );
      expect(html).toContain("aria-label=\"Xóa thuốc Amoxicillin 500mg\"");
    });

    it("renders inline field errors with role='alert'", () => {
      const errors = {
        0: {
          dosage: "Vui lòng nhập liều lượng",
          duration: "Vui lòng nhập số ngày",
        },
      };
      const html = renderToStaticMarkup(
        <PrescriptionForm items={mockItems} errors={errors} onChange={vi.fn()} />
      );
      expect(html).toContain("role=\"alert\"");
      expect(html).toContain("Vui lòng nhập liều lượng");
      expect(html).toContain("Vui lòng nhập số ngày");
    });
  });
});
