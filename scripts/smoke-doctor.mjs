import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Run only against an isolated test environment: this creates Doctor data and an appointment.
const required = [
  "SMOKE_ADMIN_TOKEN",
  "SMOKE_DOCTOR_TOKEN",
  "SMOKE_OTHER_DOCTOR_TOKEN",
  "SMOKE_PATIENT_TOKEN",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(2);
}

const gateway = new URL(process.env.SMOKE_GATEWAY_URL ?? "http://localhost:8080");
if (!["http:", "https:"].includes(gateway.protocol) || gateway.username || gateway.password || gateway.pathname !== "/") {
  throw new Error("SMOKE_GATEWAY_URL must be an HTTP(S) origin without credentials or a path");
}

async function request(token, method, path, body, expectedStatus = 200, expectedCode) {
  const response = await fetch(new URL(path, gateway), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(path === "/api/v1/appointments" && method === "POST" ? { "Idempotency-Key": randomUUID() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const envelope = await response.json();
  const code = envelope?.error?.code;
  assert.equal(response.status, expectedStatus, `${method} ${path}: expected ${expectedStatus}, got ${response.status} (${code ?? "no error code"})`);
  assert.equal(envelope?.success, expectedStatus < 400, `${method} ${path}: invalid response envelope`);
  if (expectedCode) assert.equal(code, expectedCode, `${method} ${path}: unexpected error code`);
  return envelope.data;
}

function expectItem(page, id) {
  assert.ok(Array.isArray(page?.items), "Expected a paginated response");
  assert.ok(page.items.some((item) => item.id === id), `Expected item ${id} in page`);
}

function nextClinicDate() {
  const clinicNow = new Date(Date.now() + 7 * 3_600_000);
  const date = new Date(Date.UTC(clinicNow.getUTCFullYear(), clinicNow.getUTCMonth(), clinicNow.getUTCDate() + 14));
  return { value: date.toISOString().slice(0, 10), weekday: date.getUTCDay() };
}

const tokens = {
  admin: process.env.SMOKE_ADMIN_TOKEN,
  doctor: process.env.SMOKE_DOCTOR_TOKEN,
  otherDoctor: process.env.SMOKE_OTHER_DOCTOR_TOKEN,
  patient: process.env.SMOKE_PATIENT_TOKEN,
};

async function main() {
  await request(tokens.admin, "GET", "/health");
  const [admin, doctorAccount, otherDoctor, patient] = await Promise.all([
    request(tokens.admin, "GET", "/api/v1/users/me"),
    request(tokens.doctor, "GET", "/api/v1/users/me"),
    request(tokens.otherDoctor, "GET", "/api/v1/users/me"),
    request(tokens.patient, "GET", "/api/v1/users/me"),
  ]);
  assert.equal(admin.role, "ADMIN");
  assert.equal(doctorAccount.role, "DOCTOR");
  assert.equal(doctorAccount.status, "ACTIVE");
  assert.equal(otherDoctor.role, "DOCTOR");
  assert.notEqual(otherDoctor.id, doctorAccount.id);
  assert.equal(patient.role, "PATIENT");
  assert.ok(patient.patientProfile?.id, "Patient account needs a patient profile");
  console.log("PASS Gateway authentication and test accounts");

  const runId = randomUUID();
  const specialtyName = `Smoke ${runId}`;
  const specialty = await request(tokens.admin, "POST", "/api/v1/specialties", { name: specialtyName }, 201);
  assert.ok(specialty.id);
  const specialties = await request(tokens.patient, "GET", `/api/v1/specialties?q=${encodeURIComponent(specialtyName)}`);
  expectItem(specialties, specialty.id);
  console.log("PASS specialty creation and patient search");

  await request(tokens.admin, "POST", "/api/v1/doctors", {
    userId: patient.id, specialtyId: specialty.id, displayName: `Invalid Smoke ${runId}`,
  }, 422, "DOCTOR_ACCOUNT_INVALID");
  const linkedDoctor = await request(tokens.admin, "POST", "/api/v1/doctors", {
    userId: doctorAccount.id, specialtyId: specialty.id, displayName: `Doctor Smoke ${runId}`,
  }, 201);
  const otherLinkedDoctor = await request(tokens.admin, "POST", "/api/v1/doctors", {
    userId: otherDoctor.id, specialtyId: specialty.id, displayName: `Other Doctor Smoke ${runId}`,
  }, 201);
  assert.ok(linkedDoctor.id);
  assert.ok(otherLinkedDoctor.id);
  assert.notEqual(otherLinkedDoctor.id, linkedDoctor.id);
  const doctors = await request(tokens.patient, "GET", `/api/v1/doctors?specialtyId=${specialty.id}&q=Smoke`);
  expectItem(doctors, linkedDoctor.id);
  const detail = await request(tokens.patient, "GET", `/api/v1/doctors/${linkedDoctor.id}`);
  assert.equal(detail.userId, doctorAccount.id);
  console.log("PASS User eligibility, doctor creation, patient listing and detail");

  const date = nextClinicDate();
  const schedulesPath = `/api/v1/doctors/${linkedDoctor.id}/schedules`;
  const schedule = await request(tokens.doctor, "POST", schedulesPath, {
    weekday: date.weekday, startTime: "09:00", endTime: "10:00", slotDurationMinutes: 30,
  }, 201);
  assert.ok(schedule.id);
  await request(tokens.otherDoctor, "PATCH", `/api/v1/schedules/${schedule.id}`, { endTime: "10:30" }, 403, "ACCESS_DENIED");
  await request(tokens.doctor, "PATCH", `/api/v1/schedules/${schedule.id}`, { endTime: "10:30" });
  const slotsPath = `/api/v1/doctors/${linkedDoctor.id}/available-slots?date=${date.value}`;
  const slots = await request(tokens.patient, "GET", slotsPath);
  assert.equal(slots.length, 3, "Expected three 30-minute clinic slots");
  console.log("PASS own schedule edit, other-doctor denial and patient slots");

  const timeOffsPath = `/api/v1/doctors/${linkedDoctor.id}/time-offs`;
  const timeOff = await request(tokens.doctor, "POST", timeOffsPath, {
    startAt: slots[1].startAt, endAt: slots[1].endAt, reason: "Smoke test",
  }, 201);
  assert.ok(timeOff.id);
  const duringTimeOff = await request(tokens.patient, "GET", slotsPath);
  assert.equal(duringTimeOff.length, 2);
  assert.ok(!duringTimeOff.some((slot) => slot.startAt === slots[1].startAt));
  const movedTimeOff = await request(tokens.doctor, "PATCH", `${timeOffsPath}/${timeOff.id}`, {
    startAt: new Date(Date.parse(slots[1].startAt) + 86_400_000).toISOString(),
    endAt: new Date(Date.parse(slots[1].endAt) + 86_400_000).toISOString(),
  });
  assert.equal(movedTimeOff.id, timeOff.id);
  assert.equal((await request(tokens.patient, "GET", slotsPath)).length, 3);
  console.log("PASS time-off create, update and slot filtering through Gateway");

  const appointment = await request(tokens.patient, "POST", "/api/v1/appointments", {
    doctorId: linkedDoctor.id,
    specialtyId: specialty.id,
    scheduledStartAt: slots[0].startAt,
    scheduledEndAt: slots[0].endAt,
  }, 201);
  assert.ok(appointment.id);
  const afterBooking = await request(tokens.patient, "GET", slotsPath);
  assert.ok(!afterBooking.some((slot) => slot.startAt === slots[0].startAt));
  await request(tokens.doctor, "PATCH", `/api/v1/schedules/${schedule.id}`, { startTime: "09:30" }, 409, "SCHEDULE_CONFLICT_WITH_APPOINTMENTS");
  const schedules = await request(tokens.admin, "GET", schedulesPath);
  expectItem(schedules, schedule.id);
  assert.equal(schedules.items.find((item) => item.id === schedule.id).startTime, "09:00");
  await request(tokens.doctor, "PATCH", `${timeOffsPath}/${timeOff.id}`, {
    startAt: slots[0].startAt, endAt: slots[0].endAt,
  }, 409, "SCHEDULE_CONFLICT_WITH_APPOINTMENTS");
  const timeOffs = await request(tokens.admin, "GET", timeOffsPath);
  expectItem(timeOffs, timeOff.id);
  assert.equal(timeOffs.items.find((item) => item.id === timeOff.id).startAt, movedTimeOff.startAt);
  console.log("PASS Appointment occupancy and rejected writes leave Doctor data unchanged");

  console.log(`Smoke passed. Doctor test records remain in the isolated database (run ${runId}); the current Appointment repository is in-memory.`);
}

main().catch((error) => {
  console.error(`Doctor smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
