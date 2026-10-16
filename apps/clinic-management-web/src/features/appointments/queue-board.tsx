"use client";

import React, { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createBrowserApiClient } from "../../lib/api/client";
import type { Session } from "../../lib/session/session";
import { useSession } from "../../lib/session/session-context";
import { allowedActions, appointmentApi, clinicTime, clinicToday, queueError, statusLabels,
  type Appointment, type AppointmentStatus, type QueueAction, type QueueAppointment } from "./appointment-api";
import { actionLabels, QueueActionDialog } from "./queue-action-dialog";
import { QueueDialog } from "./queue-dialog";
import styles from "./queue-board.module.css";

/** Consumer integration point for TV2's PatientLookupDrawer, without owning its UI. */
export interface PatientLookupContext { patientId: string; appointmentId: string; onClose(): void }
export interface QueueBoardProps { PatientLookup?: ComponentType<PatientLookupContext> }
const columns: { status: AppointmentStatus; title: string }[] = [
  { status: "PENDING", title: "Chờ xác nhận" }, { status: "CONFIRMED", title: "Đã xác nhận" },
  { status: "CHECKED_IN", title: "Check-in / Đang khám" }, { status: "COMPLETED", title: "Hoàn thành" },
];

function SkeletonBoard() {
  return <div className={styles.columns} role="status" aria-label="Đang tải lịch hẹn">
    {columns.map((column) => <div key={column.status} className={styles.column}>
      <h2>{column.title}</h2>{[0, 1, 2].map((n) => <div key={n} className={styles.skeleton} />)}
    </div>)}
  </div>;
}

export function QueueBoard(props: QueueBoardProps) {
  const session = useSession();
  const role = session.identity?.role;
  if (session.status === "loading") return <SkeletonBoard />;
  if (session.status !== "authenticated" || !session.identity || !role || role === "PATIENT") {
    return <section className="state-card" role="alert"><h1>Truy cập bị từ chối</h1>
      <p>Bạn cần tài khoản bác sĩ, nhân viên hoặc quản trị viên để xem lịch hẹn.</p><a href="/auth">Đăng nhập</a></section>;
  }
  return <AuthenticatedQueue key={`${session.identity.id}:${role}`} {...props} session={session} />;
}

function AuthenticatedQueue({ session, PatientLookup }: QueueBoardProps & { session: Session }) {
  const role = session.identity!.role;
  const api = useMemo(() => appointmentApi(createBrowserApiClient(session), role), [session, role]);
  const [date, setDate] = useState(clinicToday);
  const [loadedDate, setLoadedDate] = useState("");
  const [items, setItems] = useState<QueueAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState<{ item: QueueAppointment; action: "cancel" | "reschedule" | "no-show" } | null>(null);
  const [detail, setDetail] = useState<QueueAppointment | null>(null);
  const busyRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!date) { setLoading(false); setItems([]); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    api.listDay(date, controller.signal).then((rows) => {
      if (controller.signal.aborted) return;
      setItems(rows); setLoadedDate(date);
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(queueError(caught));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, date, revision]);

  const refresh = () => setRevision((value) => value + 1);
  const visible = loadedDate === date ? items : [];
  const canAct = !loading && !error && !busyId && !!date && loadedDate === date;
  function updated(item: Appointment, label: string) {
    setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, ...item } : row));
    setNotice(`${label} thành công.`);
    setModal(null); refresh();
  }
  async function quickAction(item: QueueAppointment, action: QueueAction) {
    if (busyRef.current || !canAct || !allowedActions(role, item.status).includes(action)) return;
    busyRef.current = true; setBusyId(item.id); setNotice(""); setError("");
    try {
      const result = await api.mutate(item, action);
      if (alive.current) updated(result, actionLabels[action]);
    } catch (caught) {
      if (alive.current) { setError(queueError(caught)); }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusyId(null);
    }
  }
  function card(item: QueueAppointment) {
    return <article key={item.id} className={styles.ticket} aria-label={`Lịch hẹn ${item.patientName}`}>
      <div className={styles.ticketTop}><time dateTime={item.scheduledStartAt}>
        {clinicTime(item.scheduledStartAt)}–{clinicTime(item.scheduledEndAt)}</time>
        <span className={styles.badge} data-status={item.status}>{statusLabels[item.status]}</span></div>
      <h3>{item.patientName}</h3><p className={styles.muted}>{item.doctorName}</p>
      <div className={styles.actions}>
        <button type="button" onClick={() => setDetail(item)}>Chi tiết lịch hẹn</button>
        {allowedActions(role, item.status).map((action) => <button key={action} type="button"
          disabled={!canAct || item.identityUnavailable} className={action === "cancel" ? styles.danger : undefined}
          onClick={() => {
            if (action === "cancel" || action === "reschedule" || action === "no-show") setModal({ item, action });
            else void quickAction(item, action);
          }}>{busyId === item.id ? "Đang lưu…" : actionLabels[action]}</button>)}
      </div>
    </article>;
  }
  return <div className={styles.board}>
    <header><p className="eyebrow">Health&amp;Human · Lịch hẹn</p><h1>Hàng đợi khám</h1>
      <p className={styles.muted}>{role === "DOCTOR" ? "Lịch khám được phân công cho bạn." : "Theo dõi lịch hẹn và đón tiếp bệnh nhân trong ngày."} Giờ Việt Nam (UTC+7).</p>
    </header>
    <section className={styles.toolbar} aria-label="Bộ lọc lịch hẹn">
      <label>Ngày khám<input type="date" required value={date} disabled={!!busyId}
        onChange={(event) => { setDate(event.target.value); setNotice(""); }} /></label>
      <button type="button" disabled={!!busyId} onClick={() => { setDate(clinicToday()); setNotice(""); }}>Hôm nay</button>
      <button type="button" disabled={loading || !!busyId || !date} onClick={refresh}>Tải lại</button>
      <span className={styles.muted} aria-live="polite">{!loading && loadedDate === date && `${visible.length} lịch hẹn`}</span>
    </section>
    {!date && <p role="alert">Vui lòng chọn ngày khám.</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {error && <div role="alert" className={styles.error}>{error} <button type="button" disabled={loading} onClick={refresh}>Thử lại</button>
      {visible.length > 0 && <p>Dữ liệu hiện có thể đã thay đổi. Tải lại thành công trước khi tiếp tục thao tác.</p>}</div>}
    {loading ? <SkeletonBoard /> : date && (!error || visible.length > 0) && <>
      {visible.some((item) => item.identityUnavailable) && <p className={styles.warning} role="status">
        Một số tên chưa tải được hoặc không nằm trong phạm vi truy cập. Tải lại để cập nhật thông tin.</p>}
      {!visible.length && !error && <section className={styles.empty}>
        <span aria-hidden="true">▤</span><h2>Chưa có lịch hẹn trong ngày</h2>
        <p>Chọn ngày khác hoặc tải lại để kiểm tra lịch mới.</p><button type="button" onClick={refresh}>Kiểm tra lại</button>
      </section>}
      <div className={styles.columns} aria-label="Bảng hàng đợi">
        {columns.map((column) => {
          const rows = visible.filter((item) => item.status === column.status);
          return <section key={column.status} className={styles.column} aria-label={column.title}>
            <header className={styles.columnHeader}><h2>{column.title}</h2><span aria-label={`${rows.length} lịch hẹn`}>{rows.length}</span></header>
            {column.status === "CHECKED_IN" && <p className={styles.columnHelp}>Bác sĩ hoàn tất ca khám qua bệnh án.</p>}
            {rows.length ? rows.map(card) : <p className={styles.columnHelp}>Chưa có lịch hẹn.</p>}
          </section>;
        })}
      </div>
      <details className={styles.closed}><summary>Đã hủy / Không đến ({visible.filter((item) => ["CANCELLED", "NO_SHOW"].includes(item.status)).length})</summary>
        <div className={styles.closedGrid}>{visible.filter((item) => ["CANCELLED", "NO_SHOW"].includes(item.status)).map(card)}</div>
      </details>
    </>}
    {modal && <QueueActionDialog key={`${modal.item.id}:${modal.action}`} {...modal} api={api}
      onClose={() => setModal(null)} onUpdated={(item) => updated(item, actionLabels[modal.action])} onStale={refresh} />}
    {detail && <QueueDialog title="Chi tiết lịch hẹn" onClose={() => setDetail(null)}>
      <dl className={styles.summary}>
        <dt>Bệnh nhân</dt><dd>{detail.patientName}</dd><dt>Bác sĩ</dt><dd>{detail.doctorName}</dd>
        <dt>Ngày khám</dt><dd>{new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short" }).format(new Date(detail.scheduledStartAt))}</dd>
        <dt>Giờ khám (Việt Nam)</dt><dd>{clinicTime(detail.scheduledStartAt)}–{clinicTime(detail.scheduledEndAt)}</dd>
        <dt>Trạng thái</dt><dd>{statusLabels[detail.status]}</dd><dt>Lý do khám</dt><dd>{detail.reason || "Chưa cung cấp"}</dd>
      </dl>
      {PatientLookup && !(role === "DOCTOR" && ["CANCELLED", "NO_SHOW"].includes(detail.status)) &&
        <PatientLookup patientId={detail.patientId} appointmentId={detail.id} onClose={() => setDetail(null)} />}
    </QueueDialog>}
  </div>;
}
