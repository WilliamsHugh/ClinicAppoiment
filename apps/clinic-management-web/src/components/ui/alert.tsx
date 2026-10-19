import React, { ReactNode } from "react";
import styles from "./ui.module.css";

export interface AlertProps {
  type?: "success" | "warning" | "danger" | "info";
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}

export function Alert({ type = "info", title, children, onClose, className }: AlertProps) {
  const typeClass =
    type === "success"
      ? styles.alertSuccess
      : type === "warning"
      ? styles.alertWarning
      : type === "danger"
      ? styles.alertDanger
      : styles.alertInfo;

  const icon =
    type === "success" ? "✓" : type === "warning" ? "⚠" : type === "danger" ? "✕" : "ℹ";

  return (
    <div
      role="alert"
      className={`${styles.alert} ${typeClass} ${className || ""}`.trim()}
    >
      <span aria-hidden="true" style={{ fontWeight: 700, fontSize: "1.05rem", lineHeight: 1 }}>
        {icon}
      </span>
      <div style={{ flex: 1 }}>
        {title && <strong style={{ display: "block", marginBottom: 2 }}>{title}</strong>}
        {children}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontSize: "1rem",
            color: "inherit",
            opacity: 0.7,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
