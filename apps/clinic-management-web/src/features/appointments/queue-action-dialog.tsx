"use client";

import React, { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiClientError } from "../../lib/api/client";
import { clinicTime, clinicToday, queueError, type Appointment, type AppointmentApi,
  type QueueAction, type QueueAppointment, type Slot } from "./appointment-api";
import { QueueDialog } from "./queue-dialog";
import styles from "./queue-board.module.css";

export const actionLabels: Record<QueueAction, string> = {
  confirm: "Xác nhận", "check-in": "Check-in", "no-show": "No-show", cancel: "Hủy lịch", reschedule: "Đổi lịch",
};
export function QueueActionDialog({ item, action, api, onClose, onUpdated, onStale }: {
  item: QueueAppointment; action: "cancel" | "reschedule" | "no-show"; api: AppointmentApi;
  onClose(): void; onUpdated(item: Appointment): void; onStale(): void;
}) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(clinicToday);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(action === "reschedule");
  const [slotError, setSlotError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [revision, setRevision] = useState(0);
  const busyRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (action !== "reschedule" || !date) return;
    const controller = new AbortController();
    setLoading(true); setSlotError(""); setSelected(""); setSlots([]);
    api.slots(item.doctorId, date, controller.signal).then((values) => {
      if (!controller.signal.aborted) setSlots(values.filter((slot) =>
        Date.parse(slot.startAt) !== Date.parse(item.scheduledStartAt)));
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setSlotError(queueError(caught));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, item.doctorId, item.scheduledStartAt, action, date, revision]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current || stale) return;
    if ((action === "cancel" || action === "reschedule") && !reason.trim()) {
      setError("Vui lòng nhập lý do."); return;
    }
    const slot = slots.find((value) => value.startAt === selected);
    if (action === "reschedule" && (!date || loading || !slot)) {
      setError("Vui lòng chọn khung giờ mới còn trống."); return;
    }
    busyRef.current = true; setBusy(true); setError("");
    try {
      const updated = await api.mutate(item, action, reason, slot);
      if (alive.current) onUpdated(updated);
    } catch (caught) {
      if (!alive.current) return;
      setError(queueError(caught));
      if (caught instanceof ApiClientError) {
        if (action === "reschedule" && ["APPOINTMENT_SLOT_UNAVAILABLE", "APPOINTMENT_SLOT_INVALID"].includes(caught.code)) {
          setSelected(""); setRevision((value) => value + 1);
        }
        if (["APPOINTMENT_INVALID_STATUS_TRANSITION", "REQUEST_TIMEOUT", "NETWORK_ERROR", "INVALID_RESPONSE"].includes(caught.code) ||
            [401, 403, 404].includes(caught.status) || caught.status >= 500) {
          setStale(true); onStale();
        }
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return <QueueDialog title={actionLabels[action]} busy={busy} onClose={onClose}>
    <p><strong>{item.patientName}</strong> · {item.doctorName}</p>
    <p className={styles.muted}>Lịch hiện tại: {new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(item.scheduledStartAt))}, {clinicTime(item.scheduledStartAt)}–{clinicTime(item.scheduledEndAt)}.</p>
    {action === "no-show" && <p>Xác nhận bệnh nhân không đến khám? Lịch sẽ được kết thúc ở trạng thái Không đến.</p>}
    {action === "cancel" && <p>Kiểm tra thông tin trước khi hủy. Lịch đã hủy không thể khôi phục bằng thao tác này.</p>}
    <form onSubmit={(event) => void submit(event)} className={styles.form}>
      <fieldset disabled={busy || stale} className={styles.fieldset}>
        {action === "reschedule" && <>
          <label>Ngày khám mới (giờ Việt Nam)<input type="date" required min={clinicToday()} value={date}
            onChange={(event) => { setDate(event.target.value); setSelected(""); }} /></label>
          {loading ? <div role="status" className={styles.skeleton} aria-label="Đang tải khung giờ" /> :
            slotError ? <div role="alert">{slotError} <button type="button" onClick={() => setRevision((value) => value + 1)}>Thử lại khung giờ</button></div> :
            slots.length === 0 ? <p role="status">Ngày này không còn khung giờ phù hợp. Hãy chọn ngày khác.</p> :
            <label>Khung giờ trống<select required value={selected} onChange={(event) => setSelected(event.target.value)}>
              <option value="">Chọn khung giờ</option>{slots.map((slot) => <option key={slot.startAt} value={slot.startAt}>
                {clinicTime(slot.startAt)}–{clinicTime(slot.endAt)}</option>)}
            </select></label>}
        </>}
        <label>Lý do{action === "no-show" ? " (không bắt buộc)" : " (bắt buộc)"}
          <textarea autoFocus={action !== "reschedule"} required={action !== "no-show"} maxLength={500} rows={3}
            value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <small className={styles.muted}>{reason.length}/500 ký tự</small>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={onClose}>Quay lại</button>
        <button type="submit" className={action === "cancel" || action === "no-show" ? styles.danger : styles.primary}
          disabled={busy || stale || (action === "reschedule" && (loading || !date || !selected))}>
          {busy ? "Đang lưu…" : `Xác nhận ${actionLabels[action].toLocaleLowerCase("vi-VN")}`}</button>
      </div>
    </form>
  </QueueDialog>;
}
