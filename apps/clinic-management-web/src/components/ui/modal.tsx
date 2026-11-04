"use client";

import React, { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";
import styles from "./ui.module.css";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, children, footer, maxWidth }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        className={styles.modalContent}
        style={maxWidth ? { maxWidth } : undefined}
      >
        <header className={styles.modalHeader}>
          <h2 id="modal-title">{title}</h2>
          <button
            type="button"
            className={styles.modalCloseBtn}
            aria-label="Đóng"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.modalBody}>{children}</div>
        {footer && <footer className={styles.modalFooter}>{footer}</footer>}
      </div>
    </div>
  );
}
