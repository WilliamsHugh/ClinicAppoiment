import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app, repository } from "../src/index.js";
import { canTransition } from "../src/state-machine.js";
import type { AppointmentStatus } from "@clinic/shared-types";

const patientA = "00000000-0000-4000-8000-000000000101";
const patientB = "00000000-0000-4000-8000-000000000102";
const doctorA = "00000000-0000-4000-8000-000000000201";
const doctorB = "00000000-0000-4000-8000-000000000202";
const userPatientA = "00000000-0000-4000-8000-000000000301";
const userPatientB = "00000000-0000-4000-8000-000000000302";
const userDoctorA = "00000000-0000-4000-8000-000000000401";
const userDoctorB = "00000000-0000-4000-8000-000000000402";
const userStaff = "00000000-0000-4000-8000-000000000501";
const userAdmin = "00000000-0000-4000-8000-000000000502";
const headers = (id: string, role: string) => ({ "X-User-Id": id, "X-Role": role });
const slot = { scheduledStartAt: "2030-01-07T01:00:00.000Z",
  scheduledEndAt: "2030-01-07T01:30:00.000Z" };

function fixture(patientId: string, doctorId: string, status: AppointmentStatus = "PENDING") {
  return repository.create({ patientId, doctorId, createdBy: userStaff, ...slot, status });
}

beforeEach(() => {
  repository.clear();
  vi.stubEnv("DOCTOR_INTERNAL_API_TOKEN", "doctor-internal-test-token-with-32-bytes");
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    if (path.startsWith("/internal/v1/patients/by-user/")) {
      const userId = path.split("/").at(-1);
      const id = userId === userPatientA ? patientA : userId === userPatientB ? patientB : null;
      return id ? Response.json({ success: true, data: { id, userId } }) : new Response(null, { status: 404 });
    }
    if (path.startsWith("/internal/v1/doctors/by-user/")) {
      const userId = path.split("/").at(-1);
      const id = userId === userDoctorA ? doctorA : userId === userDoctorB ? doctorB : null;
      return id ? Response.json({ success: true, data: { id, userId, isActive: true } })
        : new Response(null, { status: 404 });
    }
    if (path === "/internal/v1/doctors/verify-slot")
      return Response.json({ success: true, data: { valid: true } });
    if (path.startsWith("/internal/v1/patients/")) {
      const id = path.split("/").at(-1);
      return Response.json({ success: true, data: { id, userId: userPatientA } });
    }
    if (path === "/internal/v1/notifications") return Response.json({ success: true, data: {} });
    return new Response(null, { status: 404 });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("appointment resource authorization", () => {
  it("scopes patient list/detail/reschedule/cancel to the authenticated profile", async () => {
    const own = fixture(patientA, doctorA);
    const other = fixture(patientB, doctorB);
    const actor = headers(userPatientA, "PATIENT");
    const list = await request(app).get(`/api/v1/appointments?patientId=${patientB}`).set(actor);
    expect(list.status).toBe(200);
    expect(list.body.data.items.map((item: { id: string }) => item.id)).toEqual([own.id]);
    expect((await request(app).get(`/api/v1/appointments/${own.id}`).set(actor)).status).toBe(200);
    expect((await request(app).get(`/api/v1/appointments/${other.id}`).set(actor)).status).toBe(403);
    const reschedule = await request(app).patch(`/api/v1/appointments/${own.id}/reschedule`).set(actor)
      .send({ scheduledStartAt: "2030-01-07T02:00:00.000Z", scheduledEndAt: "2030-01-07T02:30:00.000Z" });
    expect(reschedule.status).toBe(200);
    expect((await request(app).patch(`/api/v1/appointments/${other.id}/cancel`).set(actor).send({})).status).toBe(403);
    expect((await request(app).patch(`/api/v1/appointments/${own.id}/cancel`).set(actor).send({})).status).toBe(200);
  });

  it("scopes doctor list/detail/completion to the linked active profile", async () => {
    const own = fixture(patientA, doctorA, "CHECKED_IN");
    const other = fixture(patientB, doctorB, "CHECKED_IN");
    const actor = headers(userDoctorA, "DOCTOR");
    const list = await request(app).get(`/api/v1/appointments?doctorId=${doctorB}`).set(actor);
    expect(list.status).toBe(200);
    expect(list.body.data.items.map((item: { id: string }) => item.id)).toEqual([own.id]);
    expect((await request(app).get(`/api/v1/appointments/${other.id}`).set(actor)).status).toBe(403);
    expect((await request(app).patch(`/api/v1/appointments/${other.id}/complete`).set(actor).send({})).status).toBe(403);
    expect((await request(app).patch(`/api/v1/appointments/${own.id}/complete`)
      .set(headers(userAdmin, "ADMIN")).send({})).status).toBe(403);
    const completed = await request(app).patch(`/api/v1/appointments/${own.id}/complete`).set(actor).send({});
    expect(completed.status).toBe(200);
    expect(completed.body.data.status).toBe("COMPLETED");
    const lookup = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes(`/doctors/by-user/${userDoctorA}`));
    expect(new Headers(lookup?.[1]?.headers).get("X-Internal-Token"))
      .toBe("doctor-internal-test-token-with-32-bytes");
  });

  it("lets STAFF and ADMIN perform only their contracted state operations", async () => {
    const pending = fixture(patientA, doctorA);
    const staff = headers(userStaff, "STAFF");
    const admin = headers(userAdmin, "ADMIN");
    expect((await request(app).patch(`/api/v1/appointments/${pending.id}/confirm`).set(staff).send({})).status).toBe(200);
    expect((await request(app).patch(`/api/v1/appointments/${pending.id}/check-in`).set(admin).send({})).status).toBe(200);
    expect((await request(app).patch(`/api/v1/appointments/${pending.id}/complete`).set(staff).send({})).status).toBe(403);
    expect((await request(app).patch(`/api/v1/appointments/${pending.id}/cancel`).set(staff).send({})).status).toBe(409);
    const noShow = fixture(patientB, doctorB, "CONFIRMED");
    expect((await request(app).patch(`/api/v1/appointments/${noShow.id}/no-show`).set(staff).send({})).status).toBe(200);
  });
});

describe("appointment state and input policy", () => {
  it("documents authorization, request bodies and error responses in OpenAPI", async () => {
    const document = (await request(app).get("/openapi.json")).body;
    expect(document.paths["/api/v1/appointments"].post.parameters[0].name).toBe("Idempotency-Key");
    expect(document.paths["/api/v1/appointments/{id}/reschedule"].patch.requestBody).toBeDefined();
    expect(document.paths["/api/v1/appointments/{id}/complete"].patch["x-roles"]).toEqual(["DOCTOR"]);
    expect(document.paths["/api/v1/appointments/{id}/complete"].patch.responses["409"]).toBeDefined();
    expect(document.components.securitySchemes.bearerAuth).toBeDefined();
  });

  it("implements only the agreed state transitions", () => {
    const statuses: AppointmentStatus[] = ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"];
    const allowed = new Set(["PENDING:CONFIRMED", "PENDING:CANCELLED", "CONFIRMED:CHECKED_IN",
      "CONFIRMED:CANCELLED", "CONFIRMED:NO_SHOW", "CHECKED_IN:COMPLETED"]);
    for (const from of statuses) for (const to of statuses)
      expect(canTransition(from, to)).toBe(allowed.has(`${from}:${to}`));
  });

  it("rejects terminal reschedule, past slots, malformed IDs and invalid transition bodies", async () => {
    const ended = fixture(patientA, doctorA, "COMPLETED");
    const active = fixture(patientB, doctorB);
    const actor = headers(userStaff, "STAFF");
    const future = { scheduledStartAt: "2030-01-07T03:00:00.000Z",
      scheduledEndAt: "2030-01-07T03:30:00.000Z" };
    expect((await request(app).patch(`/api/v1/appointments/${ended.id}/reschedule`).set(actor).send(future)).status).toBe(409);
    expect((await request(app).patch(`/api/v1/appointments/${active.id}/reschedule`).set(actor)
      .send({ scheduledStartAt: "2020-01-01T01:00:00.000Z", scheduledEndAt: "2020-01-01T01:30:00.000Z" })).status).toBe(422);
    expect((await request(app).get("/api/v1/appointments/not-a-uuid").set(actor)).status).toBe(400);
    expect((await request(app).patch(`/api/v1/appointments/${active.id}/confirm`).set(actor)
      .send({ status: "COMPLETED" })).status).toBe(400);
  });

  it("allows only one of two concurrent confirmations", async () => {
    const item = fixture(patientA, doctorA);
    const actor = headers(userStaff, "STAFF");
    const responses = await Promise.all([1, 2].map(() =>
      request(app).patch(`/api/v1/appointments/${item.id}/confirm`).set(actor).send({})));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(repository.findById(item.id)?.status).toBe("CONFIRMED");
  });

  it("fails closed when Doctor lookup or Patient lookup is unavailable", async () => {
    const item = fixture(patientA, doctorA, "CHECKED_IN");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.includes("/by-user/")) return new Response(null, { status: 503 });
      return Response.json({ success: true, data: {} });
    });
    const doctorResponse = await request(app).get(`/api/v1/appointments/${item.id}`)
      .set(headers(userDoctorA, "DOCTOR"));
    const patientResponse = await request(app).get(`/api/v1/appointments/${item.id}`)
      .set(headers(userPatientA, "PATIENT"));
    expect(doctorResponse.status).toBe(503);
    expect(patientResponse.status).toBe(503);
    expect(repository.findById(item.id)?.status).toBe("CHECKED_IN");
  });

  it("does not authorize inactive doctors or malformed actor IDs", async () => {
    const item = fixture(patientA, doctorA, "CHECKED_IN");
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      if (String(input).includes(`/doctors/by-user/${userDoctorA}`))
        return Response.json({ success: true, data: { id: doctorA, userId: userDoctorA, isActive: false } });
      return original(input, options);
    });
    const inactive = await request(app).patch(`/api/v1/appointments/${item.id}/complete`)
      .set(headers(userDoctorA, "DOCTOR")).send({});
    expect(inactive.status).toBe(403);
    expect(repository.findById(item.id)?.status).toBe("CHECKED_IN");
    expect((await request(app).get(`/api/v1/appointments/${item.id}`)
      .set(headers("bad-user-id", "ADMIN"))).status).toBe(401);
  });
});
