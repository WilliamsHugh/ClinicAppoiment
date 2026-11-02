import React from "react";
import Link from "next/link";
export { SkeletonTable, type SkeletonTableProps } from "./ui/skeleton";

export function LoadingState({ message = "Đang tải dữ liệu..." }: { message?: string }) {
  return (
    <section className="state-card" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{message}</p>
    </section>
  );
}

export interface EmptyStateProps {
  title: string;
  message: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

export function EmptyState({ title, message, action, className }: EmptyStateProps) {
  return (
    <section className={`state-card ${action ? "state-card--action" : ""} ${className || ""}`.trim()}>
      <div className="state-icon" aria-hidden="true">○</div>
      <h2>{title}</h2>
      <p>{message}</p>
      {action && (
        action.href ? (
          <Link
            href={action.href}
            onClick={action.onClick}
            className="state-action-btn"
            style={{
              marginTop: 18,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md, 6px)",
              color: "var(--ink)",
              padding: "10px 14px",
              fontWeight: 500,
              textDecoration: "none",
              fontSize: "0.875rem",
            }}
          >
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className="state-action-btn" style={{ marginTop: 18 }}>
            {action.label}
          </button>
        )
      )}
    </section>
  );
}

export function ErrorState({
  message,
  requestId,
  onRetry,
  className,
}: {
  message: string;
  requestId?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <section className={`state-card state-error ${className || ""}`.trim()} role="alert">
      <div className="state-icon" aria-hidden="true">!</div>
      <h2>Đã xảy ra lỗi</h2>
      <p>{message}</p>
      {requestId && <p className="request-id">Mã yêu cầu: {requestId}</p>}
      {onRetry && <button type="button" onClick={onRetry}>Thử lại</button>}
    </section>
  );
}

export interface PermissionDeniedStateProps {
  title?: string;
  message?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

export function PermissionDeniedState({
  title = "Không có quyền truy cập",
  message = "Bạn không có quyền thực hiện thao tác hoặc truy cập vào nội dung này.",
  action,
  className,
}: PermissionDeniedStateProps = {}) {
  return (
    <section className={`state-card state-denied ${action ? "state-card--action" : ""} ${className || ""}`.trim()} role="alert">
      <div
        className="state-icon"
        aria-hidden="true"
        style={{ background: "var(--warning-light, #fef3c7)", color: "var(--warning, #b45309)" }}
      >
        🔒
      </div>
      <h2>{title}</h2>
      <p>{message}</p>
      {action && (
        action.href ? (
          <Link
            href={action.href}
            onClick={action.onClick}
            className="state-action-btn"
            style={{
              marginTop: 18,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md, 6px)",
              color: "var(--ink)",
              padding: "10px 14px",
              fontWeight: 500,
              textDecoration: "none",
              fontSize: "0.875rem",
            }}
          >
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className="state-action-btn" style={{ marginTop: 18 }}>
            {action.label}
          </button>
        )
      )}
    </section>
  );
}
