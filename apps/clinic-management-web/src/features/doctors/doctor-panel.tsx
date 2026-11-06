"use client";

import React, { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ErrorState, Skeleton, SkeletonPage } from "../../components/states";
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
  const busyRef = useRef(false);
  const [revision, setRevision] = useState(0);

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

  const role = session.identity?.role;
  const admin = role === "ADMIN";
  const canManage =
    !!selected &&
    (admin || role === "STAFF" || (role === "DOCTOR" && selected.userId === session.identity?.id));

  useEffect(() => {
    if (session.status !== "authenticated") return;
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      api.specialties({ page: 1, limit: 100, ...(admin ? {} : { isActive: true }) }),
      api.doctors({
        page,
        limit: 20,
        q: query || undefined,
        specialtyId: specialtyFilter || undefined,
        ...(admin ? {} : { isActive: true }),
      }),
    ])
      .then(([specialtyResponse, doctorResponse]) => {
        if (!alive) return;
        setSpecialties(specialtyResponse.data.items);
        setDoctors(doctorResponse.data);
      })
      .catch((caught: unknown) => {
        if (alive) setError(message(caught));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [api, session.status, admin, page, query, specialtyFilter, revision]);

  useEffect(() => {
    if (!admin) return;
    let alive = true;
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
        if (alive) setError(message(caught));
      });
    return () => {
      alive = false;
    };
  }, [api, admin, revision]);

  useEffect(() => {
    if (!selectedId || session.status !== "authenticated") return;
    let alive = true;
    setDetailLoading(true);
    setError("");
    void (async () => {
      try {
        const [doctorResult, scheduleResult] = await Promise.all([
          api.doctor(selectedId),
          api.schedules(selectedId),
        ]);
        if (!alive) return;
        setSelected(doctorResult.data);
        setSchedules(scheduleResult.data.items);
        if (doctorResult.data.isActive) {
          try {
            const slotResult = await api.slots(selectedId, date);
            if (alive) setSlots(slotResult.data);
          } catch (caught) {
            if (alive) setError(message(caught));
          }
        } else if (alive) setSlots([]);

        if (
          role === "ADMIN" ||
          role === "STAFF" ||
          (role === "DOCTOR" && doctorResult.data.userId === session.identity?.id)
        ) {
          try {
            const timeOffResult = await api.timeOffs(selectedId);
            if (alive) {
              setTimeOffs(timeOffResult.data.items);
              setTimeOffError("");
            }
          } catch (caught) {
            if (alive) setTimeOffError(message(caught));
          }
        } else if (alive) setTimeOffs([]);
      } catch (caught) {
        if (alive) setError(message(caught));
      } finally {
        if (alive) setDetailLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, selectedId, date, revision, role, session.status]);

  async function mutate(action: () => Promise<unknown>, success: string, onSuccess?: () => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
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
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  function editSpecialty(item: Specialty) {
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

  if (session.status === "loading") {
    return (
      <div className={styles.stack} aria-busy="true">
        <PageHeader pathname="/doctors" />
        <SkeletonPage title={false} tableRows={5} tableCols={4} />
      </div>
    );
  }
  if (session.status !== "authenticated" || !role || role === "PATIENT") {
    return (
      <ErrorState message="Bạn cần tài khoản bác sĩ, nhân viên hoặc quản trị viên để xem trang này." />
    );
  }

  return (
    <div className={styles.stack}>
      <PageHeader pathname="/doctors" />

      {error && (
        <div role="alert" className={styles.error}>
          <span>{error}</span>
          <button
            type="button"
            disabled={loading || detailLoading || busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            Tải lại dữ liệu
          </button>
        </div>
      )}

      {notice && (
        <div role="status" className={styles.notice}>
          {notice}
        </div>
      )}

      {/* Danh sách & Tìm kiếm bác sĩ */}
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
        onSelectDoctor={(item) => {
          setSelectedId(item.id);
          setSelected(null);
          setSchedules([]);
          setTimeOffs([]);
          setSlots([]);
          setScheduleId(null);
          setTimeOffId(null);
          setEditingDoctor(false);
        }}
        loading={loading}
        page={page}
        onPageChange={setPage}
      />

      {/* Chi tiết bác sĩ và khung giờ khả dụng */}
      {selectedId && (
        <section className={styles.card} aria-label="Chi tiết bác sĩ">
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
                <h2>{selected.displayName}</h2>
                <p>{selected.bio || "Chưa có giới thiệu chuyên môn."}</p>
                <p className={styles.muted}>
                  {specialties.find((item) => item.id === selected.specialtyId)?.name ??
                    "Chuyên khoa chưa xác định"}
                </p>
                <label>
                  Ngày khám (giờ Việt Nam)
                  <input
                    type="date"
                    min={localToday()}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                {detailLoading ? (
                  <div className={styles.chips} aria-busy="true" aria-label="Đang nạp khung giờ khả dụng">
                    <Skeleton height={28} width={130} borderRadius="var(--radius-full)" />
                    <Skeleton height={28} width={130} borderRadius="var(--radius-full)" />
                    <Skeleton height={28} width={130} borderRadius="var(--radius-full)" />
                  </div>
                ) : slots.length === 0 ? (
                  <p>Không có khung giờ phù hợp trong ngày này.</p>
                ) : (
                  <div className={styles.chips}>
                    {slots.map((slot) => (
                      <span key={slot.startAt}>
                        {displayTime(slot.startAt)} – {displayTime(slot.endAt)}
                      </span>
                    ))}
                  </div>
                )}
                <p className={styles.muted}>Việc đặt lịch được xác nhận ở bước tạo lịch hẹn.</p>
              </>
            )
          )}
        </section>
      )}

      {/* ADMIN: Quản lý chuyên khoa */}
      {admin && (
        <section className={styles.card} aria-label="Quản lý chuyên khoa">
          <h2>Quản lý chuyên khoa</h2>
          <div className={styles.list}>
            {loading && specialties.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-busy="true">
                <Skeleton height={36} width="100%" />
                <Skeleton height={36} width="100%" />
                <Skeleton height={36} width="100%" />
              </div>
            ) : specialties.length === 0 ? (
              <p className={styles.muted}>Chưa có chuyên khoa nào được cấu hình.</p>
            ) : (
              specialties.map((item) => (
                <div key={item.id} className={styles.listRow}>
                  <span>
                    {item.name} {!item.isActive && "(ngừng hoạt động)"}
                  </span>
                  <button type="button" disabled={busy} onClick={() => editSpecialty(item)}>
                    Sửa
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        () => api.updateSpecialty(item.id, { isActive: !item.isActive }),
                        "Đã cập nhật chuyên khoa."
                      )
                    }
                  >
                    {item.isActive ? "Ngừng" : "Kích hoạt"}
                  </button>
                </div>
              ))
            )}
          </div>
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
                }
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
              <button disabled={busy} type="submit">
                {editingSpecialtyId ? "Lưu chuyên khoa" : "Thêm chuyên khoa"}
              </button>
              {editingSpecialtyId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditingSpecialtyId(null);
                    setSpecialtyName("");
                    setSpecialtyDescription("");
                  }}
                >
                  Hủy sửa
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {/* ADMIN: Quản lý hồ sơ bác sĩ */}
      {admin && (
        <section className={styles.card} aria-label="Quản lý hồ sơ bác sĩ">
          <h2>Quản lý hồ sơ bác sĩ</h2>
          {selected && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditingDoctor(true);
                setDoctorUserId(selected.userId);
                setDoctorSpecialtyId(selected.specialtyId);
                setDoctorName(selected.displayName);
                setDoctorBio(selected.bio ?? "");
              }}
            >
              Sửa bác sĩ đang chọn
            </button>
          )}
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
                }
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
              <button disabled={busy} type="submit">
                {editingDoctor ? "Lưu bác sĩ" : "Thêm bác sĩ"}
              </button>
              {editingDoctor && (
                <button
                  type="button"
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
                </button>
              )}
              {editingDoctor && selected && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      () =>
                        api.updateDoctor(selected.id, { isActive: !selected.isActive }),
                      "Đã cập nhật trạng thái bác sĩ."
                    )
                  }
                >
                  {selected.isActive ? "Ngừng hoạt động" : "Kích hoạt"}
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {/* Quản lý lịch làm việc & thời gian nghỉ */}
      {canManage && selected && (
        <SchedulePanel
          schedules={schedules}
          timeOffs={timeOffs}
          timeOffError={timeOffError}
          busy={busy}
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
          onToggleSchedule={(item) =>
            void mutate(
              () => api.updateSchedule(item.id, { isActive: !item.isActive }),
              "Đã cập nhật lịch làm việc."
            )
          }
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
              () => setScheduleId(null)
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
              }
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
  );
}
