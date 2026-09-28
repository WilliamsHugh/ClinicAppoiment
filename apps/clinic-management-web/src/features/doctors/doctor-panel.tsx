"use client";

import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import { ErrorState, LoadingState } from "../../components/states";
import { Pagination } from "../../components/pagination";
import { createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import { doctorApi, type Doctor, type Page, type Schedule, type Slot, type Specialty, type TimeOff, type UserAccount } from "./doctor-api";
import styles from "./doctor-panel.module.css";

const weekdays = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const localToday = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
const displayTime = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dateInput = (iso: string) => new Date(Date.parse(iso) + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
const ictToUtc = (value: string) => new Date(`${value}:00+07:00`).toISOString();
const message = (error: unknown) => error instanceof Error ? error.message : "Không thể hoàn thành yêu cầu.";

export function DoctorPanel() {
  const session = useSession();
  const api = useMemo(() => doctorApi(createBrowserApiClient(session)), [session]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [doctors, setDoctors] = useState<Page<Doctor>>({ items: [], page: 1, limit: 20, total: 0 });
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Doctor | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [timeOffs, setTimeOffs] = useState<TimeOff[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [timeOffError, setTimeOffError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [page, setPage] = useState(1);
  const [date, setDate] = useState(localToday);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  const [specialtyName, setSpecialtyName] = useState("");
  const [specialtyDescription, setSpecialtyDescription] = useState("");
  const [editingSpecialtyId, setEditingSpecialtyId] = useState<string | null>(null);
  const [doctorUserId, setDoctorUserId] = useState("");
  const [doctorSpecialtyId, setDoctorSpecialtyId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [doctorBio, setDoctorBio] = useState("");
  const [editingDoctor, setEditingDoctor] = useState(false);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [duration, setDuration] = useState(30);
  const [timeOffId, setTimeOffId] = useState<string | null>(null);
  const [offStart, setOffStart] = useState("");
  const [offEnd, setOffEnd] = useState("");
  const [offReason, setOffReason] = useState("");

  const role = session.identity?.role;
  const admin = role === "ADMIN";
  const canManage = !!selected && (admin || role === "STAFF" || (role === "DOCTOR" && selected.userId === session.identity?.id));

  useEffect(() => {
    if (session.status !== "authenticated") return;
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      api.specialties({ page: 1, limit: 100, ...(admin ? {} : { isActive: true }) }),
      api.doctors({ page, limit: 20, q: query || undefined, specialtyId: specialtyFilter || undefined, ...(admin ? {} : { isActive: true }) })
    ]).then(([specialtyResponse, doctorResponse]) => {
      if (!alive) return;
      setSpecialties(specialtyResponse.data.items);
      setDoctors(doctorResponse.data);
    }).catch((caught: unknown) => { if (alive) setError(message(caught)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, session.status, admin, page, query, specialtyFilter, revision]);

  useEffect(() => {
    if (!admin) return;
    let alive = true;
    api.doctorAccounts().then((result) => {
      if (alive) setAccounts(result.data.items.filter((account) => account.role === "DOCTOR" && account.status === "ACTIVE"));
    }).catch((caught: unknown) => { if (alive) setError(message(caught)); });
    return () => { alive = false; };
  }, [api, admin, revision]);

  useEffect(() => {
    if (!selectedId || session.status !== "authenticated") return;
    let alive = true;
    setDetailLoading(true);
    setError("");
    void (async () => {
      try {
        const [doctorResult, scheduleResult] = await Promise.all([api.doctor(selectedId), api.schedules(selectedId)]);
        if (!alive) return;
        setSelected(doctorResult.data);
        setSchedules(scheduleResult.data.items);
        if (doctorResult.data.isActive) {
          try {
            const slotResult = await api.slots(selectedId, date);
            if (alive) setSlots(slotResult.data);
          } catch (caught) { if (alive) setError(message(caught)); }
        } else if (alive) setSlots([]);
        if (role === "ADMIN" || role === "STAFF" || (role === "DOCTOR" && doctorResult.data.userId === session.identity?.id)) {
          try {
            const timeOffResult = await api.timeOffs(selectedId);
            if (alive) { setTimeOffs(timeOffResult.data.items); setTimeOffError(""); }
          } catch (caught) { if (alive) setTimeOffError(message(caught)); }
        } else if (alive) setTimeOffs([]);
      } catch (caught) { if (alive) setError(message(caught)); }
      finally { if (alive) setDetailLoading(false); }
    })();
    return () => { alive = false; };
  }, [api, selectedId, date, revision, role, session.status]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try { await action(); setNotice(success); setRevision((value) => value + 1); }
    catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }

  function submitSearch(event: FormEvent) { event.preventDefault(); setPage(1); setQuery(search.trim()); }
  function editSpecialty(item: Specialty) {
    setEditingSpecialtyId(item.id); setSpecialtyName(item.name); setSpecialtyDescription(item.description ?? "");
  }
  function editSchedule(item: Schedule) {
    setScheduleId(item.id); setWeekday(item.weekday); setStartTime(item.startTime);
    setEndTime(item.endTime); setDuration(item.slotDurationMinutes);
  }
  function editTimeOff(item: TimeOff) {
    setTimeOffId(item.id); setOffStart(dateInput(item.startAt)); setOffEnd(dateInput(item.endAt)); setOffReason(item.reason ?? "");
  }

  if (session.status === "loading") return <LoadingState message="Đang kiểm tra phiên đăng nhập..." />;
  if (session.status !== "authenticated" || !role || role === "PATIENT") {
    return <ErrorState message="Bạn cần tài khoản bác sĩ, nhân viên hoặc quản trị viên để xem trang này." />;
  }

  return <div className={styles.stack}>
    <header><p className="eyebrow">Doctor Service</p><h1>Bác sĩ và lịch làm việc</h1>
      <p className={styles.muted}>Giờ phòng khám: Việt Nam (UTC+7). Khung giờ có thể thay đổi trước khi đặt lịch thành công.</p></header>
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {notice && <div role="status" className={styles.notice}>{notice}</div>}

    <section className={styles.card} aria-label="Tìm bác sĩ">
      <form onSubmit={submitSearch} className={styles.row}>
        <label>Tên bác sĩ<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên" /></label>
        <label>Chuyên khoa<select value={specialtyFilter} onChange={(event) => { setSpecialtyFilter(event.target.value); setPage(1); }}>
          <option value="">Tất cả</option>{specialties.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <button type="submit">Tìm kiếm</button>
      </form>
      {loading ? <LoadingState message="Đang tải bác sĩ..." /> : doctors.items.length === 0 ? <p>Chưa có bác sĩ phù hợp.</p> :
        <div className={styles.list}>{doctors.items.map((item) =>
          <button key={item.id} type="button" className={selectedId === item.id ? styles.selected : ""} onClick={() => {
            setSelectedId(item.id); setSelected(null); setSchedules([]); setTimeOffs([]); setSlots([]);
            setScheduleId(null); setTimeOffId(null); setEditingDoctor(false);
          }}>
            <strong>{item.displayName}</strong><span>{specialties.find((specialty) => specialty.id === item.specialtyId)?.name ?? "Chuyên khoa"}</span>
            {!item.isActive && <span>Ngừng hoạt động</span>}
          </button>)}</div>}
      <Pagination page={page} limit={doctors.limit} total={doctors.total} disabled={loading} onPageChange={setPage} />
    </section>

    {selectedId && <section className={styles.card} aria-label="Chi tiết bác sĩ">
      {detailLoading && !selected ? <LoadingState message="Đang tải chi tiết..." /> : selected && <>
        <h2>{selected.displayName}</h2><p>{selected.bio || "Chưa có giới thiệu chuyên môn."}</p>
        <p className={styles.muted}>{specialties.find((item) => item.id === selected.specialtyId)?.name ?? "Chuyên khoa chưa xác định"}</p>
        <label>Ngày khám (giờ Việt Nam)<input type="date" min={localToday()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        {detailLoading ? <p>Đang cập nhật khung giờ...</p> : slots.length === 0 ? <p>Không có khung giờ phù hợp trong ngày này.</p> :
          <div className={styles.chips}>{slots.map((slot) => <span key={slot.startAt}>{displayTime(slot.startAt)} – {displayTime(slot.endAt)}</span>)}</div>}
        <p className={styles.muted}>Việc đặt lịch được xác nhận ở bước tạo lịch hẹn.</p>
      </>}
    </section>}

    {admin && <section className={styles.card} aria-label="Quản lý chuyên khoa">
      <h2>Quản lý chuyên khoa</h2>
      <div className={styles.list}>{specialties.map((item) => <div key={item.id} className={styles.listRow}>
        <span>{item.name} {!item.isActive && "(ngừng hoạt động)"}</span>
        <button type="button" onClick={() => editSpecialty(item)}>Sửa</button>
        <button type="button" disabled={busy} onClick={() => void mutate(() => api.updateSpecialty(item.id, { isActive: !item.isActive }), "Đã cập nhật chuyên khoa.")}>{item.isActive ? "Ngừng" : "Kích hoạt"}</button>
      </div>)}</div>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void mutate(
        () => editingSpecialtyId ? api.updateSpecialty(editingSpecialtyId, { name: specialtyName, description: specialtyDescription }) : api.createSpecialty({ name: specialtyName, description: specialtyDescription }),
        "Đã lưu chuyên khoa."); }}>
        <label>Tên chuyên khoa<input required minLength={2} value={specialtyName} onChange={(event) => setSpecialtyName(event.target.value)} /></label>
        <label>Mô tả<textarea value={specialtyDescription} onChange={(event) => setSpecialtyDescription(event.target.value)} /></label>
        <div className={styles.row}><button disabled={busy} type="submit">{editingSpecialtyId ? "Lưu chuyên khoa" : "Thêm chuyên khoa"}</button>
          {editingSpecialtyId && <button type="button" onClick={() => { setEditingSpecialtyId(null); setSpecialtyName(""); setSpecialtyDescription(""); }}>Hủy sửa</button>}</div>
      </form>
    </section>}

    {admin && <section className={styles.card} aria-label="Quản lý hồ sơ bác sĩ">
      <h2>Quản lý hồ sơ bác sĩ</h2>
      {selected && <button type="button" onClick={() => { setEditingDoctor(true); setDoctorUserId(selected.userId); setDoctorSpecialtyId(selected.specialtyId); setDoctorName(selected.displayName); setDoctorBio(selected.bio ?? ""); }}>Sửa bác sĩ đang chọn</button>}
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void mutate(
        () => editingDoctor && selected ? api.updateDoctor(selected.id, { specialtyId: doctorSpecialtyId, displayName: doctorName, bio: doctorBio }) : api.createDoctor({ userId: doctorUserId, specialtyId: doctorSpecialtyId, displayName: doctorName, bio: doctorBio }),
        "Đã lưu hồ sơ bác sĩ."); }}>
        <label>Tài khoản bác sĩ<select required disabled={editingDoctor} value={doctorUserId} onChange={(event) => { const id = event.target.value; setDoctorUserId(id); setDoctorName(accounts.find((account) => account.id === id)?.fullName ?? ""); }}>
          <option value="">Chọn tài khoản</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.fullName}</option>)}
        </select></label>
        <label>Chuyên khoa<select required value={doctorSpecialtyId} onChange={(event) => setDoctorSpecialtyId(event.target.value)}>
          <option value="">Chọn chuyên khoa</option>{specialties.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>Tên hiển thị<input required minLength={2} value={doctorName} onChange={(event) => setDoctorName(event.target.value)} /></label>
        <label>Giới thiệu<textarea value={doctorBio} onChange={(event) => setDoctorBio(event.target.value)} /></label>
        <div className={styles.row}><button disabled={busy} type="submit">{editingDoctor ? "Lưu bác sĩ" : "Thêm bác sĩ"}</button>
          {editingDoctor && <button type="button" onClick={() => { setEditingDoctor(false); setDoctorUserId(""); setDoctorSpecialtyId(""); setDoctorName(""); setDoctorBio(""); }}>Hủy sửa</button>}
          {editingDoctor && selected && <button type="button" disabled={busy} onClick={() => void mutate(() => api.updateDoctor(selected.id, { isActive: !selected.isActive }), "Đã cập nhật trạng thái bác sĩ.")}>{selected.isActive ? "Ngừng hoạt động" : "Kích hoạt"}</button>}</div>
      </form>
    </section>}

    {canManage && selected && <section className={styles.card} aria-label="Quản lý lịch làm việc">
      <h2>Lịch làm việc</h2>
      <div className={styles.list}>{schedules.map((item) => <div key={item.id} className={styles.listRow}>
        <span>{weekdays[item.weekday]} · {item.startTime}–{item.endTime} · {item.slotDurationMinutes} phút {item.isActive ? "" : "(ngừng)"}</span>
        <button type="button" onClick={() => editSchedule(item)}>Sửa</button>
        <button type="button" disabled={busy} onClick={() => void mutate(() => api.updateSchedule(item.id, { isActive: !item.isActive }), "Đã cập nhật lịch làm việc.")}>{item.isActive ? "Ngừng" : "Kích hoạt"}</button>
      </div>)}</div>
      <form className={styles.row} onSubmit={(event) => { event.preventDefault(); void mutate(
        () => scheduleId ? api.updateSchedule(scheduleId, { weekday, startTime, endTime, slotDurationMinutes: duration }) : api.createSchedule(selected.id, { weekday, startTime, endTime, slotDurationMinutes: duration }),
        "Đã lưu lịch làm việc."); }}>
        <label>Thứ<select value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>{weekdays.map((label, index) => <option key={index} value={index}>{label}</option>)}</select></label>
        <label>Bắt đầu<input type="time" required value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
        <label>Kết thúc<input type="time" required value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
        <label>Phút mỗi lượt<input type="number" min="5" max="240" required value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
        <button type="submit" disabled={busy}>Lưu lịch</button>
        {scheduleId && <button type="button" onClick={() => setScheduleId(null)}>Thêm mới</button>}
      </form>
    </section>}

    {canManage && selected && <section className={styles.card} aria-label="Thời gian nghỉ">
      <h2>Thời gian nghỉ</h2>
      {timeOffError && <p role="alert" className={styles.error}>{timeOffError}</p>}
      <div className={styles.list}>{timeOffs.map((item) => <div key={item.id} className={styles.listRow}>
        <span>{displayTime(item.startAt)} – {displayTime(item.endAt)} {item.reason && `· ${item.reason}`}</span>
        <button type="button" onClick={() => editTimeOff(item)}>Sửa</button>
      </div>)}</div>
      <form className={styles.row} onSubmit={(event) => { event.preventDefault(); void mutate(
        () => timeOffId ? api.updateTimeOff(timeOffId, { startAt: ictToUtc(offStart), endAt: ictToUtc(offEnd), reason: offReason }) : api.createTimeOff(selected.id, { startAt: ictToUtc(offStart), endAt: ictToUtc(offEnd), reason: offReason }),
        "Đã lưu thời gian nghỉ."); }}>
        <label>Bắt đầu (giờ Việt Nam)<input type="datetime-local" required value={offStart} onChange={(event) => setOffStart(event.target.value)} /></label>
        <label>Kết thúc (giờ Việt Nam)<input type="datetime-local" required value={offEnd} onChange={(event) => setOffEnd(event.target.value)} /></label>
        <label>Lý do<input value={offReason} onChange={(event) => setOffReason(event.target.value)} /></label>
        <button type="submit" disabled={busy}>Lưu thời gian nghỉ</button>
        {timeOffId && <button type="button" onClick={() => setTimeOffId(null)}>Thêm mới</button>}
      </form>
    </section>}
  </div>;
}
