import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../src/db.js";
import { DoctorRepository, ScheduleOverlapError } from "../src/repository.js";

const databaseUrl = process.env.DOCTOR_TEST_DATABASE_URL;
const suite = databaseUrl && process.env.DOCTOR_TEST_DATABASE_DISPOSABLE === "1" ? describe : describe.skip;

suite("Doctor PostgreSQL integration (disposable database only)", () => {
  const pool = createPool(databaseUrl ?? "postgresql://localhost/unused");
  const repo = new DoctorRepository(pool);

  beforeAll(async () => {
    const migration = fileURLToPath(new URL("../../../infrastructure/supabase/doctor-service/schema.sql", import.meta.url));
    const sql = await readFile(migration, "utf8");
    await pool.query(sql);
    await pool.query(sql);
    await pool.query("TRUNCATE doctor_service.doctor_time_offs, doctor_service.doctor_schedules, doctor_service.doctors, doctor_service.specialties");
  });
  afterAll(async () => { await pool.end(); });

  it("preserves specialties, doctors, schedules and time off across connection pools", async () => {
    const specialty = await repo.createSpecialty({ name: "TV3 Test Specialty" });
    const doctor = await repo.createDoctor({ userId: randomUUID(), specialtyId: specialty.id,
      displayName: "TV3 Test Doctor" });
    const schedule = await repo.createSchedule({ doctorId: doctor.id, weekday: 1,
      startTime: "08:00", endTime: "10:00", slotDurationMinutes: 30 });
    const timeOff = await repo.createTimeOff({ doctorId: doctor.id,
      startAt: "2030-01-07T01:00:00.000Z", endAt: "2030-01-07T02:00:00.000Z" });
    const restartedPool = createPool(databaseUrl);
    try {
      const restarted = new DoctorRepository(restartedPool);
      expect((await restarted.findSpecialty(specialty.id))?.name).toBe(specialty.name);
      expect((await restarted.findDoctorByUser(doctor.userId))?.id).toBe(doctor.id);
      expect((await restarted.allSchedules(doctor.id))[0]?.id).toBe(schedule?.id);
      expect((await restarted.allTimeOffs(doctor.id,
        "2030-01-07T00:00:00.000Z", "2030-01-07T03:00:00.000Z"))[0]?.id).toBe(timeOff.id);
    } finally {
      await restartedPool.end();
    }
    await expect(repo.createDoctor({ userId: doctor.userId, specialtyId: specialty.id,
      displayName: "Duplicate Doctor" })).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(`INSERT INTO doctor_service.doctor_time_offs (doctor_id, start_at, end_at)
      VALUES ($1, $2, $3)`, [doctor.id, "2030-01-07T02:00:00.000Z", "2030-01-07T01:00:00.000Z"]))
      .rejects.toMatchObject({ code: "23514" });
  });

  it("serializes competing schedule writes from independent connection pools", async () => {
    const specialty = await repo.createSpecialty({ name: "TV3 Test Race Specialty" });
    const doctor = await repo.createDoctor({ userId: randomUUID(), specialtyId: specialty.id,
      displayName: "TV3 Test Race Doctor" });
    const firstPool = createPool(databaseUrl);
    const secondPool = createPool(databaseUrl);
    let results: PromiseSettledResult<unknown>[];
    try {
      results = await Promise.allSettled([
        new DoctorRepository(firstPool).createSchedule({ doctorId: doctor.id, weekday: 2,
          startTime: "08:00", endTime: "09:00", slotDurationMinutes: 30 }),
        new DoctorRepository(secondPool).createSchedule({ doctorId: doctor.id, weekday: 2,
          startTime: "08:30", endTime: "09:30", slotDurationMinutes: 30 })
      ]);
    } finally {
      await Promise.all([firstPool.end(), secondPool.end()]);
    }
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")?.reason).toBeInstanceOf(ScheduleOverlapError);
    expect((await repo.allSchedules(doctor.id))).toHaveLength(1);
  });
});
