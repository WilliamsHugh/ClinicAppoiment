"use client";

import React from "react";
import { Modal } from "./modal";
import { Button } from "./button";

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  message?: string;
  confirmLabel?: string;
  confirmText?: string;
  cancelLabel?: string;
  cancelText?: string;
  variant?: "danger" | "primary";
  isDanger?: boolean;
  isLoading?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title,
  description,
  message,
  confirmLabel,
  confirmText = "Xác nhận",
  cancelLabel,
  cancelText = "Hủy",
  variant,
  isDanger = false,
  isLoading,
  loading = false,
  children,
}: ConfirmModalProps) {
  const handleCancel = onCancel || onClose || (() => {});
  const isActionLoading = isLoading ?? loading;
  const isDestructive = variant ? variant === "danger" : isDanger;
  const confirmBtnLabel = confirmLabel ?? confirmText;
  const cancelBtnLabel = cancelLabel ?? cancelText;
  const content = description ?? message;

  return (
    <Modal
      isOpen={isOpen}
      onClose={isActionLoading ? () => {} : handleCancel}
      title={title}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={isActionLoading}
            onClick={handleCancel}
          >
            {cancelBtnLabel}
          </Button>
          <Button
            type="button"
            variant={isDestructive ? "danger" : "primary"}
            loading={isActionLoading}
            onClick={onConfirm}
          >
            {confirmBtnLabel}
          </Button>
        </>
      }
    >
      {children ? children : content ? <p style={{ margin: 0, color: "var(--ink)" }}>{content}</p> : null}
    </Modal>
  );
}
