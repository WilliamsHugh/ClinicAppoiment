import React, { ReactNode } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import styles from "./ui.module.css";

export interface AlertProps {
  type?: "success" | "warning" | "danger" | "info";
  variant?: "success" | "warning" | "danger" | "info";
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}

export function Alert({ type = "info", variant, title, children, onClose, className }: AlertProps) {
  const effectiveType = variant || type;
  const typeClass =
    effectiveType === "success"
      ? styles.alertSuccess
      : effectiveType === "warning"
      ? styles.alertWarning
      : effectiveType === "danger"
      ? styles.alertDanger
      : styles.alertInfo;

  const renderIcon = () => {
    switch (effectiveType) {
      case "success":
        return <CheckCircle2 size={18} aria-hidden="true" />;
      case "warning":
        return <AlertTriangle size={18} aria-hidden="true" />;
      case "danger":
        return <AlertCircle size={18} aria-hidden="true" />;
      case "info":
      default:
        return <Info size={18} aria-hidden="true" />;
    }
  };

  return (
    <div
      role="alert"
      className={`${styles.alert} ${typeClass} ${className || ""}`.trim()}
    >
      <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
        {renderIcon()}
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
            display: "inline-flex",
            alignItems: "center",
            color: "inherit",
            opacity: 0.7,
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
