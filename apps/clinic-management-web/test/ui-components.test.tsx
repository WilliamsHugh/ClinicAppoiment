import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { Button } from "../src/components/ui/button";
import { Badge } from "../src/components/ui/badge";
import { Alert } from "../src/components/ui/alert";
import { Modal } from "../src/components/ui/modal";
import { ConfirmModal } from "../src/components/ui/confirm-modal";
import { Skeleton, SkeletonTable } from "../src/components/ui/skeleton";
import { TextInput, Select, Textarea } from "../src/components/ui/input";
import { StatusBadge } from "../src/components/status-badge";
import { EmptyState, PermissionDeniedState } from "../src/components/states";

describe("Shared UI Components (M3-UI-LEAD-002)", () => {
  describe("Button", () => {
    it("renders with default primary variant", () => {
      const html = renderToStaticMarkup(<Button>Lưu thay đổi</Button>);
      expect(html).toContain("Lưu thay đổi");
      expect(html).toContain("buttonPrimary");
      expect(html).not.toContain("disabled");
    });

    it("renders loading spinner and disables when loading=true", () => {
      const html = renderToStaticMarkup(<Button loading>Đang lưu</Button>);
      expect(html).toContain("disabled");
      expect(html).toContain("aria-busy=\"true\"");
      expect(html).toContain("btnSpinner");
    });

    it("supports secondary, danger, and outline variants", () => {
      const dangerHtml = renderToStaticMarkup(<Button variant="danger">Xóa</Button>);
      expect(dangerHtml).toContain("buttonDanger");

      const outlineHtml = renderToStaticMarkup(<Button variant="outline">Chi tiết</Button>);
      expect(outlineHtml).toContain("buttonOutline");
    });
  });

  describe("Badge", () => {
    it("renders with correct variant classes", () => {
      const successHtml = renderToStaticMarkup(<Badge variant="success">Hoàn thành</Badge>);
      expect(successHtml).toContain("badgeSuccess");
      expect(successHtml).toContain("Hoàn thành");

      const warningHtml = renderToStaticMarkup(<Badge variant="warning">Chờ xác nhận</Badge>);
      expect(warningHtml).toContain("badgeWarning");

      const dangerHtml = renderToStaticMarkup(<Badge variant="danger">Đã hủy</Badge>);
      expect(dangerHtml).toContain("badgeDanger");

      const primaryHtml = renderToStaticMarkup(<Badge variant="primary">Đã xác nhận</Badge>);
      expect(primaryHtml).toContain("badgePrimary");
    });

    it("supports all 6 appointment status mappings", () => {
      expect(renderToStaticMarkup(<Badge variant="PENDING">Chờ</Badge>)).toContain("badgePending");
      expect(renderToStaticMarkup(<Badge variant="CONFIRMED">Xác nhận</Badge>)).toContain("badgeConfirmed");
      expect(renderToStaticMarkup(<Badge variant="CHECKED_IN">Check-in</Badge>)).toContain("badgeCheckedIn");
      expect(renderToStaticMarkup(<Badge variant="COMPLETED">Xong</Badge>)).toContain("badgeCompleted");
      expect(renderToStaticMarkup(<Badge variant="CANCELLED">Hủy</Badge>)).toContain("badgeCancelled");
      expect(renderToStaticMarkup(<Badge variant="NO_SHOW">Vắng</Badge>)).toContain("badgeNoShow");
    });
  });

  describe("StatusBadge", () => {
    it("renders correct Vietnamese labels and badge classes for all 6 statuses", () => {
      const pending = renderToStaticMarkup(<StatusBadge status="PENDING" />);
      expect(pending).toContain("Chờ xác nhận");
      expect(pending).toContain("badgeWarning");

      const confirmed = renderToStaticMarkup(<StatusBadge status="CONFIRMED" />);
      expect(confirmed).toContain("Đã xác nhận");
      expect(confirmed).toContain("badgePrimary");

      const checkedIn = renderToStaticMarkup(<StatusBadge status="CHECKED_IN" />);
      expect(checkedIn).toContain("Đã check-in");
      expect(checkedIn).toContain("badgeInfo");

      const completed = renderToStaticMarkup(<StatusBadge status="COMPLETED" />);
      expect(completed).toContain("Hoàn thành");
      expect(completed).toContain("badgeSuccess");

      const cancelled = renderToStaticMarkup(<StatusBadge status="CANCELLED" />);
      expect(cancelled).toContain("Đã hủy");
      expect(cancelled).toContain("badgeDanger");

      const noShow = renderToStaticMarkup(<StatusBadge status="NO_SHOW" />);
      expect(noShow).toContain("Không đến");
      expect(noShow).toContain("badgeDanger");
    });

    it("supports custom children and unknown status fallback", () => {
      const custom = renderToStaticMarkup(<StatusBadge status="CONFIRMED">Đã duyệt</StatusBadge>);
      expect(custom).toContain("Đã duyệt");
      expect(custom).toContain("badgePrimary");

      const unknown = renderToStaticMarkup(<StatusBadge status="UNKNOWN_STATUS" />);
      expect(unknown).toContain("UNKNOWN_STATUS");
      expect(unknown).toContain("badgeNeutral");
    });
  });

  describe("Alert", () => {
    it("renders title and content with correct role", () => {
      const html = renderToStaticMarkup(
        <Alert type="success" title="Thành công">
          Đã cập nhật dữ liệu.
        </Alert>
      );
      expect(html).toContain("role=\"alert\"");
      expect(html).toContain("alertSuccess");
      expect(html).toContain("Thành công");
      expect(html).toContain("Đã cập nhật dữ liệu.");
    });

    it("renders close button when onClose is provided", () => {
      const html = renderToStaticMarkup(
        <Alert type="danger" onClose={vi.fn()}>
          Lỗi kết nối.
        </Alert>
      );
      expect(html).toContain("aria-label=\"Đóng thông báo\"");
    });
  });

  describe("Modal & ConfirmModal", () => {
    it("returns empty string when isOpen is false", () => {
      const html = renderToStaticMarkup(
        <Modal isOpen={false} onClose={vi.fn()} title="Test">
          Body
        </Modal>
      );
      expect(html).toBe("");
    });

    it("renders dialog elements when isOpen is true", () => {
      const html = renderToStaticMarkup(
        <Modal isOpen={true} onClose={vi.fn()} title="Tiêu đề modal">
          Nội dung body
        </Modal>
      );
      expect(html).toContain("role=\"dialog\"");
      expect(html).toContain("aria-modal=\"true\"");
      expect(html).toContain("Tiêu đề modal");
      expect(html).toContain("Nội dung body");
    });

    it("renders ConfirmModal with cancel and confirm buttons", () => {
      const html = renderToStaticMarkup(
        <ConfirmModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Xác nhận xóa"
          message="Hành động này không thể hoàn tác."
          isDanger={true}
        />
      );
      expect(html).toContain("Xác nhận xóa");
      expect(html).toContain("Hành động này không thể hoàn tác.");
      expect(html).toContain("buttonDanger");
    });

    it("renders ConfirmModal with description, confirmLabel, cancelLabel and variant", () => {
      const html = renderToStaticMarkup(
        <ConfirmModal
          isOpen={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          title="Hủy lịch hẹn"
          description="Bạn có chắc chắn muốn hủy cuộc hẹn này không?"
          confirmLabel="Đồng ý hủy"
          cancelLabel="Quay lại"
          variant="danger"
        />
      );
      expect(html).toContain("Hủy lịch hẹn");
      expect(html).toContain("Bạn có chắc chắn muốn hủy cuộc hẹn này không?");
      expect(html).toContain("Đồng ý hủy");
      expect(html).toContain("Quay lại");
      expect(html).toContain("buttonDanger");
    });
  });

  describe("Skeleton & SkeletonTable", () => {
    it("renders skeleton with height and width", () => {
      const html = renderToStaticMarkup(<Skeleton height={40} width="100%" />);
      expect(html).toContain("height:40px");
      expect(html).toContain("width:100%");
      expect(html).toContain("aria-hidden=\"true\"");
    });

    it("renders SkeletonTable with correct number of rows and columns", () => {
      const html = renderToStaticMarkup(<SkeletonTable rows={3} columns={4} />);
      expect(html).toContain("role=\"region\"");
      expect(html).toContain("aria-busy=\"true\"");
      expect(html).toContain("<table");
    });

    it("supports cols alias for columns", () => {
      const html = renderToStaticMarkup(<SkeletonTable rows={8} cols={6} />);
      expect(html).toContain("role=\"region\"");
      expect(html).toContain("<table");
      // Header has 6 th elements
      const thMatches = html.match(/<th\b/g);
      expect(thMatches?.length).toBe(6);
      // Body has 8 tr elements + 1 in thead
      const trMatches = html.match(/<tr\b/g);
      expect(trMatches?.length).toBe(9); // 1 header row + 8 data rows
    });
  });

  describe("States (EmptyState, PermissionDeniedState)", () => {
    it("renders EmptyState with action button", () => {
      const html = renderToStaticMarkup(
        <EmptyState
          title="Không có lịch hẹn"
          message="Chưa có lịch hẹn nào cho ngày hôm nay."
          action={{ label: "Làm mới", onClick: vi.fn() }}
        />
      );
      expect(html).toContain("Không có lịch hẹn");
      expect(html).toContain("Chưa có lịch hẹn nào cho ngày hôm nay.");
      expect(html).toContain("Làm mới");
      expect(html).toContain("state-card--action");
    });

    it("renders EmptyState with action link", () => {
      const html = renderToStaticMarkup(
        <EmptyState
          title="Không có kết quả"
          message="Vui lòng thử lại với bộ lọc khác."
          action={{ label: "Về trang chủ", href: "/" }}
        />
      );
      expect(html).toContain("Về trang chủ");
      expect(html).toContain("href=\"/\"");
    });

    it("renders PermissionDeniedState with default copy and custom action", () => {
      const html = renderToStaticMarkup(
        <PermissionDeniedState
          action={{ label: "Đăng nhập lại", href: "/auth" }}
        />
      );
      expect(html).toContain("Không có quyền truy cập");
      expect(html).toContain("role=\"alert\"");
      expect(html).toContain("state-denied");
      expect(html).toContain("Đăng nhập lại");
      expect(html).toContain("href=\"/auth\"");
    });
  });

  describe("Form Controls (TextInput, Select, Textarea)", () => {
    it("renders input with label, hint, and value", () => {
      const html = renderToStaticMarkup(
        <TextInput
          label="Họ và tên"
          hint="Nhập họ và tên đầy đủ"
          defaultValue="Nguyễn Văn A"
        />
      );
      expect(html).toContain("Họ và tên");
      expect(html).toContain("Nhập họ và tên đầy đủ");
      expect(html).toContain("value=\"Nguyễn Văn A\"");
    });

    it("renders error message and aria-invalid when error is present", () => {
      const html = renderToStaticMarkup(
        <TextInput
          label="Email"
          error="Email không hợp lệ"
        />
      );
      expect(html).toContain("aria-invalid=\"true\"");
      expect(html).toContain("Email không hợp lệ");
    });

    it("renders select with options and label", () => {
      const html = renderToStaticMarkup(
        <Select label="Chuyên khoa" defaultValue="tim-mach">
          <option value="tim-mach">Tim mạch</option>
          <option value="da-lieu">Da liễu</option>
        </Select>
      );
      expect(html).toContain("Chuyên khoa");
      expect(html).toContain("Tim mạch");
    });

    it("renders textarea with label and value", () => {
      const html = renderToStaticMarkup(
        <Textarea label="Ghi chú" defaultValue="Bệnh nhân dị ứng penicillin" />
      );
      expect(html).toContain("Ghi chú");
      expect(html).toContain("Bệnh nhân dị ứng penicillin");
    });
  });
});
