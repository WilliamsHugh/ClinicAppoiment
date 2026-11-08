"use client";

import React, { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./queue-board.module.css";

/** Native modal supplies focus containment, Escape handling and background inertness. */
export function QueueDialog({ title, busy = false, onClose, children }: {
  title: string; busy?: boolean; onClose(): void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} aria-busy={busy} tabIndex={-1}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
      )).filter((element) => element.getClientRects().length > 0);
      const first = controls[0]; const last = controls.at(-1);
      if (!first) { event.preventDefault(); event.currentTarget.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last!.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className={styles.dialogHeader}><h2 id={titleId}>{title}</h2>
      <button type="button" aria-label="Đóng hộp thoại" disabled={busy} onClick={onClose}>Đóng</button>
    </header>
    {children}
  </dialog>;
}
