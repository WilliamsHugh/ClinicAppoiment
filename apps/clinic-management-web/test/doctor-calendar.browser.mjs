// Run against a local production build. Every Gateway request uses synthetic fixtures.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.CLINIC_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.CLINIC_WEB_URL || "http://127.0.0.1:5174";
const output = path.resolve(process.env.DOCTOR_ARTIFACTS || path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..", ".tools/doctor-web-review"));
await mkdir(output, { recursive: true });
const doctorId = "00000000-0000-4000-8000-000000000001";
const doctorUserId = "00000000-0000-4000-8000-000000000002";
const otherId = "00000000-0000-4000-8000-000000000003";
const specId = "00000000-0000-4000-8000-000000000004";
const originalDoctor = { id: doctorId, userId: doctorUserId, specialtyId: specId, displayName: "Bác sĩ An", bio: "Khám và tư vấn nội tổng quát", isActive: true };
const sessionRule = { id: "00000000-0000-4000-8000-000000000010", doctorId, weekday: 1, startTime: "08:00", endTime: "12:00", slotDurationMinutes: 30, isActive: true };
const originalRules = [sessionRule,
  { ...sessionRule, id: "00000000-0000-4000-8000-000000000011", startTime: "14:00", endTime: "17:00" },
  { ...sessionRule, id: "00000000-0000-4000-8000-000000000012", weekday: 5, isActive: false },
  { ...sessionRule, id: "00000000-0000-4000-8000-000000000013", weekday: 0, startTime: "09:00", endTime: "11:00" }];
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
const results = [];
const contexts = [];
async function scenario(name, run) { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }

async function open(role = "ADMIN", options = {}) {
  const context = await browser.newContext({ timezoneId: "America/New_York", reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  contexts.push(context);
  await context.addInitScript(({ role, doctorUserId }) => localStorage.setItem("clinic_web_session", JSON.stringify({
    accessToken: "synthetic-token", refreshToken: "synthetic-refresh", expiresAt: "2100-01-01T00:00:00Z", identity: { id: doctorUserId, role, displayName: "Người kiểm thử" },
  })), { role, doctorUserId });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const state = { doctor: { ...originalDoctor }, rules: structuredClone(options.empty ? [] : originalRules),
    nextOutcome: "conflict", scheduleFailure: false, writes: [], reads: [] };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(); const url = new URL(request.url()); const method = request.method();
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS" };
    const respond = (data) => route.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify({ success: true, data }) });
    const fail = (status, code) => route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify({ success: false, error: { code, message: "Private synthetic server detail" } }) });
    const envelopePage = (items) => ({ items, page: 1, limit: 100, total: items.length });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (method === "GET") state.reads.push({ path: url.pathname, page: url.searchParams.get("page") });
    else state.writes.push({ path: url.pathname, body: request.postDataJSON() });
    if (url.pathname === "/api/v1/specialties") return respond(envelopePage([{ id: specId, name: "Nội tổng quát", description: null, isActive: true }]));
    if (url.pathname === "/api/v1/users") return respond(envelopePage([]));
    if (url.pathname === "/api/v1/doctors") return respond(envelopePage([state.doctor, { ...originalDoctor, id: otherId, userId: otherId, displayName: "Bác sĩ Bình" }]));
    if (url.pathname === `/api/v1/doctors/${doctorId}` && method === "PATCH") {
      if (state.nextOutcome === "conflict") { state.nextOutcome = "success"; return fail(409, "SCHEDULE_CONFLICT_WITH_APPOINTMENTS"); }
      await new Promise((resolve) => setTimeout(resolve, 300));
      Object.assign(state.doctor, request.postDataJSON());
      if (state.nextOutcome === "malformed") { state.nextOutcome = "success"; return respond({ ...state.doctor, id: otherId }); }
      return respond(state.doctor);
    }
    if (url.pathname === `/api/v1/doctors/${doctorId}`) return respond(state.doctor);
    if (url.pathname === `/api/v1/doctors/${otherId}`) return respond({ ...originalDoctor, id: otherId, userId: otherId, displayName: "Bác sĩ Bình" });
    if (url.pathname.endsWith("/schedules") && method === "GET") {
      if (state.scheduleFailure) return fail(503, "UPSTREAM_SERVICE_UNAVAILABLE");
      const pageNumber = Number(url.searchParams.get("page"));
      const rules = url.pathname.includes(otherId) ? state.rules.map((item) => ({ ...item, doctorId: otherId })) : state.rules;
      return respond({ items: rules.slice((pageNumber - 1) * 2, pageNumber * 2), page: pageNumber, limit: 2, total: rules.length });
    }
    if (url.pathname.startsWith("/api/v1/schedules/") && method === "PATCH") {
      const item = state.rules.find((rule) => rule.id === url.pathname.split("/").at(-1)); assert(item);
      Object.assign(item, request.postDataJSON()); return respond(item);
    }
    if (url.pathname.endsWith("/available-slots")) return respond([]);
    if (url.pathname.endsWith("/time-offs")) return respond(envelopePage([]));
    errors.push(`Unexpected route: ${method} ${url.pathname}`); return fail(500, "UNEXPECTED_TEST_ROUTE");
  });
  await page.goto(`${base}/doctors`);
  await page.getByRole("heading", { name: "Bác sĩ và lịch làm việc", exact: true }).waitFor();
  const directory = page.locator('section[aria-label="Tìm bác sĩ"]');
  await directory.getByRole("button", { name: /Bác sĩ An/ }).waitFor();
  const select = async (name = "Bác sĩ An") => {
    await directory.getByRole("button", { name: new RegExp(name) }).click();
    await page.getByRole("region", { name: "Lịch tuần định kỳ", exact: true }).waitFor();
  };
  return { context, page, state, directory, select, calendar: page.locator('section[aria-label="Quản lý lịch làm việc"]') };
}

try {
  const admin = await open();
  const { page, state, select, calendar } = admin;
  await select();
  await scenario("Calendar loads all pages, Monday to Sunday, split and inactive sessions in Vietnam time", async () => {
    const week = page.getByRole("region", { name: "Lịch tuần định kỳ", exact: true });
    assert.deepEqual(await week.locator("h3").allTextContents(), ["Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật"]);
    assert.match(await week.getByRole("region", { name: "Thứ hai", exact: true }).innerText(), /08:00–12:00[\s\S]*14:00–17:00/);
    assert.match(await week.getByRole("region", { name: "Chủ nhật", exact: true }).innerText(), /09:00–11:00/);
    assert.match(await week.getByRole("region", { name: "Thứ sáu", exact: true }).innerText(), /Đã ngừng ca/);
    assert(state.reads.some((read) => read.path.endsWith("/schedules") && read.page === "2"));
    assert(!(await page.locator("main").innerText()).includes(doctorId));
  });
  await scenario("Calendar fits desktop/narrow layouts with scrolling contained in its own region", async () => {
    for (const width of [1280, 1920, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await calendar.scrollIntoViewIfNeeded();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await calendar.screenshot({ path: path.join(output, `doctor-calendar-${width}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  });
  await scenario("Calendar edit reuses the schedule form and persists the exact recurring rule", async () => {
    await calendar.getByRole("button", { name: "Sửa ca Thứ hai, 14:00–17:00", exact: true }).click();
    assert.equal(await calendar.getByRole("combobox").inputValue(), "1");
    assert.equal(await calendar.getByLabel("Bắt đầu", { exact: true }).inputValue(), "14:00");
    assert(await calendar.getByRole("combobox").evaluate((element) => element === document.activeElement));
    await calendar.getByLabel("Kết thúc", { exact: true }).fill("18:00");
    await calendar.getByRole("button", { name: "Lưu lịch", exact: true }).click();
    await calendar.getByRole("button", { name: "Sửa ca Thứ hai, 14:00–18:00", exact: true }).waitFor();
    assert.deepEqual(state.writes.at(-1), { path: `/api/v1/schedules/${originalRules[1].id}`, body: { weekday: 1, startTime: "14:00", endTime: "18:00", slotDurationMinutes: 30 } });
    const reads = state.reads.length;
    await calendar.getByRole("button", { name: "Danh sách", exact: true }).click();
    await calendar.getByRole("button", { name: "Lịch tuần", exact: true }).click();
    assert.equal(state.reads.length, reads);
  });
  await scenario("Failed refresh hides incomplete calendar, blocks saving, preserves form and recovers on retry", async () => {
    state.scheduleFailure = true;
    await calendar.getByRole("button", { name: "Tải lại lịch", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Chưa tải được thông tin bác sĩ hoặc lịch làm việc." }).waitFor();
    assert.equal(await page.getByRole("region", { name: "Lịch tuần định kỳ", exact: true }).count(), 0);
    assert(await calendar.getByRole("button", { name: "Lưu lịch", exact: true }).isDisabled());
    assert(!(await page.locator("main").innerText()).includes("Private synthetic"));
    assert.equal(await calendar.getByLabel("Kết thúc", { exact: true }).inputValue(), "18:00");
    state.scheduleFailure = false;
    await calendar.getByRole("button", { name: "Tải lại lịch", exact: true }).click();
    await page.getByRole("region", { name: "Lịch tuần định kỳ", exact: true }).waitFor();
    assert(!(await calendar.getByRole("button", { name: "Lưu lịch", exact: true }).isDisabled()));
  });
  await scenario("Booked-appointment conflict preserves checked switch and gives a safe explanation", async () => {
    const control = page.getByRole("switch", { name: "Hoạt động của Bác sĩ An", exact: true });
    await control.click();
    await page.getByRole("alert").filter({ hasText: "còn lịch hẹn tương lai" }).waitFor();
    assert.equal(await control.getAttribute("aria-checked"), "true");
    assert(!(await page.locator("main").innerText()).includes("Private synthetic"));
    assert.equal(state.writes.filter((write) => write.path === `/api/v1/doctors/${doctorId}`).length, 1);
  });
  await scenario("Keyboard switch prevents duplicate write and updates selected doctor without page/directory reload", async () => {
    const control = page.getByRole("switch", { name: "Hoạt động của Bác sĩ An", exact: true });
    const directoryReads = state.reads.filter((read) => read.path === "/api/v1/doctors").length;
    let navigations = 0; const listener = (frame) => { if (frame === page.mainFrame()) navigations++; }; page.on("framenavigated", listener);
    await control.focus(); await page.keyboard.press("Space");
    await page.waitForFunction(() => document.querySelector('[role="switch"][aria-busy="true"]'));
    await page.keyboard.press("Space");
    assert.equal(await control.getAttribute("aria-checked"), "true");
    await page.waitForFunction(() => document.querySelector('[role="switch"]').getAttribute("aria-checked") === "false");
    await page.getByText("Không nhận đặt lịch khi bác sĩ ngừng hoạt động.", { exact: true }).waitFor();
    assert.equal(state.writes.filter((write) => write.path === `/api/v1/doctors/${doctorId}`).length, 2);
    assert.equal(state.reads.filter((read) => read.path === "/api/v1/doctors").length, directoryReads);
    assert.equal(navigations, 0); page.off("framenavigated", listener);
    await page.screenshot({ path: path.join(output, "doctor-inactive.png"), fullPage: true });
    await admin.directory.screenshot({ path: path.join(output, "doctor-activity-switch.png") });
    await control.click();
    await page.waitForFunction(() => document.querySelector('[role="switch"]').getAttribute("aria-checked") === "true");
    assert.equal(state.doctor.isActive, true);
  });
  await scenario("Unconfirmed response freezes switch until read retry resolves authoritative state", async () => {
    state.nextOutcome = "malformed";
    const control = page.getByRole("switch", { name: "Hoạt động của Bác sĩ An", exact: true });
    await control.click();
    await page.getByText("Cần tải lại dữ liệu để xác nhận trạng thái trước khi tiếp tục bật/tắt bác sĩ.", { exact: true }).waitFor();
    assert(await control.isDisabled()); assert.equal(await control.getAttribute("aria-checked"), "true");
    const writes = state.writes.length;
    await page.getByRole("button", { name: "Tải lại dữ liệu", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute("aria-checked") === "false");
    assert(!(await control.isDisabled())); assert.equal(state.writes.length, writes);
  });
  const readonly = await open("DOCTOR"); await readonly.select("Bác sĩ Bình");
  await scenario("DOCTOR sees another calendar read-only; no activity switches or private time-off reads", async () => {
    assert.equal(await readonly.page.getByRole("switch").count(), 0);
    assert.equal(await readonly.calendar.getByRole("button", { name: /^Sửa ca/ }).count(), 0);
    assert.equal(await readonly.calendar.locator("form").count(), 0);
    assert(!readonly.state.reads.some((read) => read.path === `/api/v1/doctors/${otherId}/time-offs`));
    assert.equal(readonly.state.writes.length, 0);
  });
  const empty = await open("STAFF", { empty: true });
  await empty.directory.getByRole("button", { name: /Bác sĩ An/ }).click();
  await scenario("Empty calendar keeps creation action and staff has no activity switches", async () => {
    await empty.calendar.getByText("Chưa có ca làm việc trong tuần.", { exact: true }).waitFor();
    await empty.calendar.getByRole("button", { name: "Thêm ca làm việc", exact: true }).click();
    assert(await empty.calendar.getByRole("combobox").evaluate((element) => element === document.activeElement));
    assert.equal(await empty.page.getByRole("switch").count(), 0);
    assert.equal(empty.state.writes.length, 0);
  });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ browser: browser.version(), results, errors }, null, 2));
} catch (error) {
  for (const [index, context] of contexts.entries()) {
    const page = context.pages()[0];
    if (page) await page.screenshot({ path: path.join(output, `doctor-failure-${index}.png`), fullPage: true }).catch(() => {});
  }
  throw error;
} finally { await browser.close(); }
