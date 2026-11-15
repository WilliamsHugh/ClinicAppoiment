"use client";

import React, { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ErrorState, Skeleton, SkeletonPage } from "../../components/states";
import { Button, ConfirmModal } from "../../components/ui";
import { createBrowserApiClient } from "../../lib/api/client";
import { useSession } from "../../lib/session/session-context";
import {
  doctorApi,
  type Doctor,
  type Page,
  type Schedule,
  type Slot,
  type Specialty,
  type TimeOff,
  type UserAccount,
} from "./doctor-api";
import { DoctorList } from "./doctor-list";
import { SchedulePanel } from "./schedule-panel";
import { PageHeader } from "../../components/page-header";
import styles from "./doctors-panel.module.css";

const weekdays = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const localToday = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
const displayTime = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
const dateInput = (iso: string) =>
  new Date(Date.parse(iso) + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
const ictToUtc = (value: string) => new Date(`${value}:00+07:00`).toISOString();
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Không thể hoàn thành yêu cầu.";

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
  const [timeOffPage, setTimeOffPage] = useState(1);
  const [timeOffTotal, setTimeOffTotal] = useState(0);
  const [timeOffLoading, setTimeOffLoading] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [timeOffError, setTimeOffError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [page, setPage] = useState(1);
  const [date, setDate] = useState(localToday);
  const [loading, setLoading] = useState(true);
  const [specialtyLoading, setSpecialtyLoading] = useState(true);
  const [specialtyError, setSpecialtyError] = useState("");
  const [accountError, setAccountError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [doctorError, setDoctorError] = useState("");
  const [slotError, setSlotError] = useState("");
  const [slotLoading, setSlotLoading] = useState(false);
  const [slotRevision, setSlotRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutatingAction, setMutatingAction] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<"schedule" | "doctors" | "specialties">("schedule");
  const [doctorFormOpen, setDoctorFormOpen] = useState(false);
  const [specialtyFormOpen, setSpecialtyFormOpen] = useState(false);

  // Admin specialty form state
  const [specialtyName, setSpecialtyName] = useState("");
  const [specialtyDescription, setSpecialtyDescription] = useState("");
  const [editingSpecialtyId, setEditingSpecialtyId] = useState<string | null>(null);

  // Admin doctor form state
  const [doctorUserId, setDoctorUserId] = useState("");
  const [doctorSpecialtyId, setDoctorSpecialtyId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [doctorBio, setDoctorBio] = useState("");
  const [editingDoctor, setEditingDoctor] = useState(false);

  // Schedule form state
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [duration, setDuration] = useState(30);

  // Time-off form state
  const [timeOffId, setTimeOffId] = useState<string | null>(null);
  const [offStart, setOffStart] = useState("");
  const [offEnd, setOffEnd] = useState("");
  const [offReason, setOffReason] = useState("");

  // Confirmation modal state for deactivating specialty/doctor/schedule
  const [pendingDeactivate, setPendingDeactivate] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const role = session.identity?.role;
  const admin = role === "ADMIN";
  const canManage =
    !!selected &&
    (admin || role === "STAFF" || (role === "DOCTOR" && selected.userId === session.identity?.id));

  useEffect(() => {
    if (session.status !== "authenticated") return;
    let alive = true;
    setSpecialtyLoading(true);
    setSpecialtyError("");
    api.specialties({ page: 1, limit: 100, ...(admin ? {} : { isActive: true }) })
      .then((response) => { if (alive) setSpecialties(response.data.items); })
      .catch((caught) => { if (alive) setSpecialtyError(message(caught)); })
      .finally(() => { if (alive) setSpecialtyLoading(false); });
    return () => { alive = false; };
  }, [api, session.status, admin, revision]);

  useEffect(() => {
    if (session.status !== "authenticated") return;
    let alive = true;
    setLoading(true);
    setDoctorError("");
    api.doctors({
        page,
        limit: 20,
        q: query || undefined,
        specialtyId: specialtyFilter || undefined,
        ...(admin ? {} : { isActive: true }),
      })
      .then((response) => { if (alive) setDoctors(response.data); })
      .catch((caught: unknown) => {
        if (alive) setDoctorError(message(caught));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [api, session.status, admin, page, query, specialtyFilter, revision]);

  useEffect(() => {
    if (role !== "DOCTOR" || selectedId) return;
    const own = doctors.items.find((item) => item.userId === session.identity?.id);
    if (own) { setSelectedId(own.id); setSelected(own); }
  }, [doctors.items, role, selectedId, session.identity?.id]);

  useEffect(() => {
    if (!admin) return;
    let alive = true;
    setAccountError("");
    api
      .doctorAccounts()
      .then((result) => {
        if (alive)
          setAccounts(
            result.data.items.filter(
              (account) => account.role === "DOCTOR" && account.status === "ACTIVE"
            )
          );
      })
      .catch((caught: unknown) => {
        if (alive) setAccountError(message(caught));
      });
    return () => {
      alive = false;
    };
  }, [api, admin, revision]);

  useEffect(() => {
    if (!selectedId || session.status !== "authenticated") return;
    let alive = true;
    setDetailLoading(true);
    setDetailError("");
    api.doctor(selectedId)
      .then((result) => { if (alive) setSelected(result.data); })
      .catch((caught) => { if (alive) setDetailError(message(caught)); })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [api, selectedId, revision, session.status]);

  useEffect(() => {
    if (!selectedId || session.status !== "authenticated") return;
    let alive = true;
    setScheduleLoading(true); setScheduleError("");
    api.allSchedules(selectedId)
      .then((items) => { if (alive) setSchedules(items); })
      .catch((caught) => { if (alive) setScheduleError(message(caught)); })
      .finally(() => { if (alive) setScheduleLoading(false); });
    return () => { alive = false; };
  }, [api, selectedId, revision, session.status]);

  useEffect(() => {
    if (!selected || !canManage || session.status !== "authenticated") return;
    let alive = true;
    setTimeOffLoading(true); setTimeOffError("");
    api.timeOffs(selected.id, undefined, timeOffPage)
      .then((result) => { if (alive) { setTimeOffs(result.data.items); setTimeOffTotal(result.data.total); } })
      .catch((caught) => { if (alive) setTimeOffError(message(caught)); })
      .finally(() => { if (alive) setTimeOffLoading(false); });
    return () => { alive = false; };
  }, [api, selected?.id, canManage, timeOffPage, revision, session.status]);

  useEffect(() => {
    if (!selected || session.status !== "authenticated") return;
    let alive = true;
    setSlots([]); setSlotError("");
    if (!selected.isActive) { setSlotLoading(false); return; }
    setSlotLoading(true);
    api.slots(selected.id, date)
      .then((result) => { if (alive) setSlots(result.data); })
      .catch((caught) => { if (alive) setSlotError(message(caught)); })
      .finally(() => { if (alive) setSlotLoading(false); });
    return () => { alive = false; };
  }, [api, selected?.id, selected?.isActive, date, revision, slotRevision, session.status]);

  async function mutate(action: () => Promise<unknown>, success: string, onSuccess?: () => void, actionKey?: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMutatingAction(actionKey ?? null);
    setError("");
    setNotice("");
    try {
      await action();
      onSuccess?.();
      setNotice(success);
      setRevision((value) => value + 1);
    } catch (caught) {
      setError(message(caught));
    } finally {
      busyRef.current = false;
      setBusy(false);
      setMutatingAction(null);
    }
  }

  const handleRetrySlots = () => setSlotRevision((value) => value + 1);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  function editSpecialty(item: Specialty) {
    setSpecialtyFormOpen(true);
    setEditingSpecialtyId(item.id);
    setSpecialtyName(item.name);
    setSpecialtyDescription(item.description ?? "");
  }

  function editSchedule(item: Schedule) {
    setScheduleId(item.id);
    setWeekday(item.weekday);
    setStartTime(item.startTime);
    setEndTime(item.endTime);
    setDuration(item.slotDurationMinutes);
  }

  function editTimeOff(item: TimeOff) {
    setTimeOffId(item.id);
    setOffStart(dateInput(item.startAt));
    setOffEnd(dateInput(item.endAt));
    setOffReason(item.reason ?? "");
  }

  function selectDoctor(item: Doctor) {
    setSelectedId(item.id); setSelected(item); setTab("schedule");
    setSchedules([]); setTimeOffs([]); setSlots([]); setTimeOffPage(1); setTimeOffTotal(0);
    setScheduleId(null); setTimeOffId(null); setEditingDoctor(false); setDoctorFormOpen(false);
    setWeekday(1); setStartTime("08:00"); setEndTime("12:00"); setDuration(30);
    setOffStart(""); setOffEnd(""); setOffReason("");
    setDetailError(""); setScheduleError(""); setTimeOffError(""); setSlotError("");
  }

  const tabs = [
    { id: "schedule", label: "Lịch làm việc" },
    { id: "doctors", label: "Danh sách bác sĩ" },
    { id: "specialties", label: "Chuyên khoa" },
  ] as const;
  const navigation = <div className={styles.tabs} role="tablist" aria-label="Bác sĩ và lịch làm việc">
    {tabs.map((item, index) => <button key={item.id} id={`doctor-tab-${item.id}`} type="button" role="tab"
      aria-selected={tab === item.id} aria-controls="doctor-panel-content" tabIndex={tab === item.id ? 0 : -1}
      onClick={() => setTab(item.id)} onKeyDown={(event) => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); setTab(tabs[next].id);
        document.getElementById(`doctor-tab-${tabs[next].id}`)?.focus();
      }}>{item.label}</button>)}
  </div>;

  if (session.status === "loading") {
    return (
      <div className={`page-stack ${styles.stack}`}>
        <PageHeader pathname="/doctors" />
        {navigation}
        <SkeletonPage title={false} tableRows={5} tableCols={4} />
      </div>
    );
  }
  if (session.status !== "authenticated" || !role || role === "PATIENT") {
    return (
      <div className={`page-stack ${styles.stack}`}>
        <PageHeader pathname="/doctors" />
        <ErrorState message="Bạn cần tài khoản bác sĩ, nhân viên hoặc quản trị viên để xem trang này." />
      </div>
    );
  }

  return (
    <div className={`page-stack ${styles.stack}`}>
      <PageHeader pathname="/doctors" />
      {navigation}

      {error && (
        <div role="alert" className={styles.error}>
          <span>{error}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loading || detailLoading || busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            Tải lại dữ liệu
          </Button>
        </div>
      )}

      {notice && (
        <div role="status" className={styles.notice}>
          {notice}
        </div>
      )}

      <div id="doctor-panel-content" role="tabpanel" aria-labelledby={`doctor-tab-${tab}`} className={styles.tabContent}>
      {tab === "schedule" && <section className={styles.card} aria-label="Chọn bác sĩ xem lịch">
        <h2>Bác sĩ đang xem</h2>
        <div className={styles.row}>
          <label>Bác sĩ
            <select value={selectedId ?? ""} disabled={busy || loading} onChange={(event) => {
              const item = doctors.items.find((doctor) => doctor.id === event.target.value);
              if (item) selectDoctor(item);
            }}>
              <option value="">Chọn bác sĩ để xem lịch</option>
              {selected && !doctors.items.some((item) => item.id === selected.id) && <option value={selected.id}>{selected.displayName}</option>}
              {doctors.items.map((item) => <option key={item.id} value={item.id}>{item.displayName}{!item.isActive ? " (ngừng hoạt động)" : ""}</option>)}
            </select>
          </label>
          <Button type="button" variant="secondary" onClick={() => setTab("doctors")}>Chọn từ danh sách bác sĩ</Button>
        </div>
        {loading && <div role="status" aria-label="Đang tải bác sĩ" aria-busy="true"><Skeleton height={24} width="60%" /></div>}
        {doctorError && <div role="alert" className={styles.error}><span>{doctorError}</span><Button type="button" variant="secondary" onClick={() => setRevision((value) => value + 1)}>Thử lại danh sách bác sĩ</Button></div>}
        {!selectedId && <p className={styles.muted}>{role === "DOCTOR" ? "Chưa xác định hồ sơ bác sĩ của bạn. Chọn đúng hồ sơ trong danh sách để xem lịch; chỉ hồ sơ của bạn có quyền chỉnh sửa." : "Chọn bác sĩ để xem lịch làm việc, thời gian nghỉ và khung giờ khả dụng."}</p>}
      </section>}

      {/* Danh sách & Tìm kiếm bác sĩ */}
      {tab === "doctors" && <>
      <DoctorList
        doctors={doctors}
        specialties={specialties}
        search={search}
        onSearchChange={setSearch}
        onSubmitSearch={submitSearch}
        specialtyFilter={specialtyFilter}
        onSpecialtyFilterChange={(value) => {
          setSpecialtyFilter(value);
          setPage(1);
        }}
        selectedId={selectedId}
        onSelectDoctor={selectDoctor}
        loading={loading}
        page={page}
        onPageChange={setPage}
        error={doctorError}
        onRetry={() => setRevision((value) => value + 1)}
      />
      {specialtyError && <div role="alert" className={styles.error}><span>Chưa tải được bộ lọc chuyên khoa: {specialtyError}</span><Button type="button" variant="secondary" onClick={() => setRevision((value) => value + 1)}>Thử lại chuyên khoa</Button></div>}
      </>}

      {/* Chi tiết bác sĩ và khung giờ khả dụng */}
      {tab === "schedule" && selectedId && (
        <section className={styles.card} aria-label="Chi tiết bác sĩ">
          <h2>{selected?.displayName ?? "Chi tiết bác sĩ"}</h2>
          {detailError && <div role="alert" className={styles.error}><span>{detailError}</span><Button type="button" variant="secondary" onClick={() => setRevision((value) => value + 1)}>Thử lại hồ sơ bác sĩ</Button></div>}
          {detailLoading && !selected ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-busy="true">
              <Skeleton height={24} width={180} />
              <Skeleton height={16} width="80%" />
              <Skeleton height={14} width="40%" />
              <div style={{ marginTop: 12 }}>
                <Skeleton height={38} width="100%" />
              </div>
            </div>
          ) : (
            selected && (
              <>
                <p>{selected.bio || "Chưa có giới thiệu chuyên môn."}</p>
                <p className={styles.muted}>
                  {specialties.find((item) => item.id === selected.specialtyId)?.name ??
                    "Chuyên khoa chưa xác định"}
                </p>
                <label>
                  Ngày khám (UTC+7)
                  <input
                    type="date"
                    min={localToday()}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                <h3>Khung giờ khả dụng</h3>
                {slotLoading ? (
                  <div className={styles.chips} aria-busy="true" aria-label="Đang nạp khung giờ khả dụng">
                    <Skeleton height={28} width={130} borderRadius="var(--radius-full)" />
                    <Skeleton height={28} width={130} borderRadius="var(--radius-full)" />
                    <Skeleton height={28} width={130} borderRadius="var(--radius-full)" />
                  </div>
                ) : slotError ? (
                  <div role="alert" className={styles.error} style={{ margin: "12px 0" }}>
                    <span>{slotError}</span>
                    <Button type="button" variant="secondary" size="sm" onClick={handleRetrySlots}>
                      Thử lại khung giờ
                    </Button>
                  </div>
                ) : slots.length === 0 ? (
                  <p>Không có khung giờ phù hợp trong ngày này.</p>
                ) : (
                  <div className={styles.chips} aria-label="Khung giờ khả dụng (UTC+7)">
                    {slots.map((slot) => (
                      <span key={slot.startAt}>
                        {displayTime(slot.startAt)} – {displayTime(slot.endAt)}
                      </span>
                    ))}
                  </div>
                )}
                <p className={styles.muted}>Giờ Việt Nam (UTC+7). Khung giờ được kiểm tra lại khi tạo lịch hẹn.</p>
              </>
            )
          )}
        </section>
      )}

      {/* ADMIN: Quản lý chuyên khoa */}
      {tab === "specialties" && (
        <section className={styles.card} aria-label={admin ? "Quản lý chuyên khoa" : "Danh sách chuyên khoa"}>
          <h2>Chuyên khoa</h2>
          {specialtyError && <div role="alert" className={styles.error}><span>{specialtyError}</span><Button type="button" variant="secondary" onClick={() => setRevision((value) => value + 1)}>Thử lại chuyên khoa</Button></div>}
          <div className={styles.list}>
            {specialtyLoading && specialties.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-busy="true">
                <Skeleton height={36} width="100%" />
                <Skeleton height={36} width="100%" />
                <Skeleton height={36} width="100%" />
              </div>
            ) : specialties.length === 0 && !specialtyError ? (
              <p className={styles.muted}>Chưa có chuyên khoa nào được cấu hình.</p>
            ) : (
              specialties.map((item) => (
                <div key={item.id} className={styles.listRow}>
                  <span>
                    {item.name} {!item.isActive && "(ngừng hoạt động)"}
                  </span>
                  {admin && <><Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => editSpecialty(item)}
                  >
                    Sửa
                  </Button>
                  <Button
                    type="button"
                    variant={item.isActive ? "danger" : "primary"}
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      if (item.isActive) {
                        setPendingDeactivate({
                          title: "Xác nhận ngừng chuyên khoa",
                          description: `Bạn có chắc chắn muốn ngừng hoạt động chuyên khoa "${item.name}"?`,
                          confirmLabel: "Ngừng chuyên khoa",
                          onConfirm: () => {
                            setPendingDeactivate(null);
                            void mutate(
                              () => api.updateSpecialty(item.id, { isActive: false }),
                              "Đã cập nhật chuyên khoa.",
                              undefined,
                              `specialty-toggle-${item.id}`
                            );
                          },
                        });
                      } else {
                        void mutate(
                          () => api.updateSpecialty(item.id, { isActive: true }),
                          "Đã cập nhật chuyên khoa.",
                          undefined,
                          `specialty-toggle-${item.id}`
                        );
                      }
                    }}
                  >
                    {busy && mutatingAction === `specialty-toggle-${item.id}` ? "Đang xử lý..." : (item.isActive ? "Ngừng" : "Kích hoạt")}
                  </Button>
                  </>}
                </div>
              ))
            )}
          </div>
          {admin && <details open={specialtyFormOpen} onToggle={(event) => setSpecialtyFormOpen(event.currentTarget.open)} className={styles.editor}>
          <summary>{editingSpecialtyId ? "Sửa chuyên khoa" : "Thêm chuyên khoa"}</summary>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void mutate(
                () =>
                  editingSpecialtyId
                    ? api.updateSpecialty(editingSpecialtyId, {
                        name: specialtyName,
                        description: specialtyDescription,
                      })
                    : api.createSpecialty({
                        name: specialtyName,
                        description: specialtyDescription,
                      }),
                "Đã lưu chuyên khoa.",
                () => {
                  setEditingSpecialtyId(null);
                  setSpecialtyName("");
                  setSpecialtyDescription("");
                  setSpecialtyFormOpen(false);
                },
                "specialty"
              );
            }}
          >
            <label>
              Tên chuyên khoa
              <input
                required
                minLength={2}
                value={specialtyName}
                onChange={(event) => setSpecialtyName(event.target.value)}
              />
            </label>
            <label>
              Mô tả
              <textarea
                value={specialtyDescription}
                onChange={(event) => setSpecialtyDescription(event.target.value)}
              />
            </label>
            <div className={styles.row}>
              <Button disabled={busy} type="submit" variant="primary">
                {busy && mutatingAction === "specialty" ? "Đang lưu..." : (editingSpecialtyId ? "Lưu chuyên khoa" : "Thêm chuyên khoa")}
              </Button>
              {editingSpecialtyId && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditingSpecialtyId(null);
                    setSpecialtyName("");
                    setSpecialtyDescription("");
                  }}
                >
                  Hủy sửa
                </Button>
              )}
            </div>
          </form>
          </details>}
        </section>
      )}

      {/* ADMIN: Quản lý hồ sơ bác sĩ */}
      {admin && tab === "doctors" && (
        <section className={styles.card} aria-label="Quản lý hồ sơ bác sĩ">
          <h2>Quản lý hồ sơ bác sĩ</h2>
          {selected && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setEditingDoctor(true);
                setDoctorFormOpen(true);
                setDoctorUserId(selected.userId);
                setDoctorSpecialtyId(selected.specialtyId);
                setDoctorName(selected.displayName);
                setDoctorBio(selected.bio ?? "");
              }}
            >
              Sửa bác sĩ đang chọn
            </Button>
          )}
          <details open={doctorFormOpen} onToggle={(event) => setDoctorFormOpen(event.currentTarget.open)} className={styles.editor}>
          <summary>{editingDoctor ? "Sửa hồ sơ bác sĩ" : "Thêm bác sĩ"}</summary>
          {accountError && <div role="alert" className={styles.error}><span>Chưa tải được tài khoản bác sĩ: {accountError}</span><Button type="button" variant="secondary" onClick={() => setRevision((value) => value + 1)}>Thử lại tài khoản</Button></div>}
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void mutate(
                () =>
                  editingDoctor && selected
                    ? api.updateDoctor(selected.id, {
                        specialtyId: doctorSpecialtyId,
                        displayName: doctorName,
                        bio: doctorBio,
                      })
                    : api.createDoctor({
                        userId: doctorUserId,
                        specialtyId: doctorSpecialtyId,
                        displayName: doctorName,
                        bio: doctorBio,
                      }),
                "Đã lưu hồ sơ bác sĩ.",
                () => {
                  setEditingDoctor(false);
                  setDoctorUserId("");
                  setDoctorSpecialtyId("");
                  setDoctorName("");
                  setDoctorBio("");
                  setDoctorFormOpen(false);
                },
                "doctor"
              );
            }}
          >
            <label>
              Tài khoản bác sĩ
              <select
                required
                disabled={editingDoctor}
                value={doctorUserId}
                onChange={(event) => {
                  const id = event.target.value;
                  setDoctorUserId(id);
                  setDoctorName(
                    accounts.find((account) => account.id === id)?.fullName ?? ""
                  );
                }}
              >
                <option value="">Chọn tài khoản</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Chuyên khoa
              <select
                required
                value={doctorSpecialtyId}
                onChange={(event) => setDoctorSpecialtyId(event.target.value)}
              >
                <option value="">Chọn chuyên khoa</option>
                {specialties
                  .filter((item) => item.isActive)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Tên hiển thị
              <input
                required
                minLength={2}
                value={doctorName}
                onChange={(event) => setDoctorName(event.target.value)}
              />
            </label>
            <label>
              Giới thiệu
              <textarea
                value={doctorBio}
                onChange={(event) => setDoctorBio(event.target.value)}
              />
            </label>
            <div className={styles.row}>
              <Button disabled={busy} type="submit" variant="primary">
                {busy && mutatingAction === "doctor" ? "Đang lưu..." : (editingDoctor ? "Lưu bác sĩ" : "Thêm bác sĩ")}
              </Button>
              {editingDoctor && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditingDoctor(false);
                    setDoctorUserId("");
                    setDoctorSpecialtyId("");
                    setDoctorName("");
                    setDoctorBio("");
                  }}
                >
                  Hủy sửa
                </Button>
              )}
              {editingDoctor && selected && (
                <Button
                  type="button"
                  variant={selected.isActive ? "danger" : "primary"}
                  disabled={busy}
                  onClick={() => {
                    if (selected.isActive) {
                      setPendingDeactivate({
                        title: "Xác nhận ngừng hoạt động bác sĩ",
                        description: `Bạn có chắc chắn muốn ngừng hoạt động hồ sơ của ${selected.displayName}?`,
                        confirmLabel: "Ngừng hoạt động",
                        onConfirm: () => {
                          setPendingDeactivate(null);
                          void mutate(
                            () => api.updateDoctor(selected.id, { isActive: false }),
                            "Đã cập nhật trạng thái bác sĩ.",
                            undefined,
                            `doctor-toggle-${selected.id}`
                          );
                        },
                      });
                    } else {
                      void mutate(
                        () => api.updateDoctor(selected.id, { isActive: true }),
                        "Đã cập nhật trạng thái bác sĩ.",
                        undefined,
                        `doctor-toggle-${selected.id}`
                      );
                    }
                  }}
                >
                  {busy && mutatingAction === `doctor-toggle-${selected.id}` ? "Đang xử lý..." : (selected.isActive ? "Ngừng hoạt động" : "Kích hoạt")}
                </Button>
              )}
            </div>
          </form>
          </details>
        </section>
      )}

      {/* Quản lý lịch làm việc & thời gian nghỉ */}
      {tab === "schedule" && selected && (
        <SchedulePanel
          key={selected.id}
          schedules={schedules}
          timeOffs={timeOffs}
          timeOffError={timeOffError}
          canManage={canManage}
          scheduleError={scheduleError}
          onRetrySchedule={() => setRevision((value) => value + 1)}
          scheduleLoading={scheduleLoading}
          timeOffLoading={timeOffLoading}
          timeOffPage={timeOffPage}
          timeOffTotal={timeOffTotal}
          onTimeOffPageChange={(next) => { setTimeOffs([]); setTimeOffPage(next); }}
          busy={busy || Boolean(detailError)}
          busyAction={mutatingAction}
          detailLoading={detailLoading}
          scheduleId={scheduleId}
          weekday={weekday}
          startTime={startTime}
          endTime={endTime}
          duration={duration}
          onWeekdayChange={setWeekday}
          onStartTimeChange={setStartTime}
          onEndTimeChange={setEndTime}
          onDurationChange={setDuration}
          onEditSchedule={editSchedule}
          onToggleSchedule={(item) => {
            if (item.isActive) {
              setPendingDeactivate({
                title: "Xác nhận ngừng lịch làm việc",
                description: `Bạn có chắc chắn muốn ngừng lịch làm việc ${weekdays[item.weekday]} (${item.startTime}–${item.endTime})?`,
                confirmLabel: "Ngừng lịch",
                onConfirm: () => {
                  setPendingDeactivate(null);
                  void mutate(
                    () => api.updateSchedule(item.id, { isActive: false }),
                    "Đã cập nhật lịch làm việc.",
                    undefined,
                    `schedule-toggle-${item.id}`
                  );
                },
              });
            } else {
              void mutate(
                () => api.updateSchedule(item.id, { isActive: true }),
                "Đã cập nhật lịch làm việc.",
                undefined,
                `schedule-toggle-${item.id}`
              );
            }
          }}
          onSubmitSchedule={(event) => {
            event.preventDefault();
            void mutate(
              () =>
                scheduleId
                  ? api.updateSchedule(scheduleId, {
                      weekday,
                      startTime,
                      endTime,
                      slotDurationMinutes: duration,
                    })
                  : api.createSchedule(selected.id, {
                      weekday,
                      startTime,
                      endTime,
                      slotDurationMinutes: duration,
                    }),
              "Đã lưu lịch làm việc.",
              () => setScheduleId(null),
              "schedule"
            );
          }}
          onResetScheduleForm={() => setScheduleId(null)}
          timeOffId={timeOffId}
          offStart={offStart}
          offEnd={offEnd}
          offReason={offReason}
          onOffStartChange={setOffStart}
          onOffEndChange={setOffEnd}
          onOffReasonChange={setOffReason}
          onEditTimeOff={editTimeOff}
          onSubmitTimeOff={(event) => {
            event.preventDefault();
            void mutate(
              () =>
                timeOffId
                  ? api.updateTimeOff(selected.id, timeOffId, {
                      startAt: ictToUtc(offStart),
                      endAt: ictToUtc(offEnd),
                      reason: offReason,
                    })
                  : api.createTimeOff(selected.id, {
                      startAt: ictToUtc(offStart),
                      endAt: ictToUtc(offEnd),
                      reason: offReason,
                    }),
              "Đã lưu thời gian nghỉ.",
              () => {
                setTimeOffId(null);
                setOffStart("");
                setOffEnd("");
                setOffReason("");
              },
              "time-off"
            );
          }}
          onResetTimeOffForm={() => {
            setTimeOffId(null);
            setOffStart("");
            setOffEnd("");
            setOffReason("");
          }}
          onRetryTimeOff={() => setRevision((value) => value + 1)}
        />
      )}
      </div>

      <ConfirmModal
        isOpen={Boolean(pendingDeactivate)}
        onCancel={() => setPendingDeactivate(null)}
        onConfirm={() => pendingDeactivate?.onConfirm()}
        title={pendingDeactivate?.title ?? "Xác nhận"}
        description={pendingDeactivate?.description ?? ""}
        confirmLabel={pendingDeactivate?.confirmLabel ?? "Xác nhận"}
        cancelLabel="Quay lại"
        variant="danger"
        loading={busy}
      />
    </div>
  );
}
