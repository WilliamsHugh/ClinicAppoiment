// Run against a local production build. All Gateway traffic is intercepted with synthetic data.
// QUEUE_PLAYWRIGHT_MODULE may point to an isolated Playwright installation.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.QUEUE_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.QUEUE_WEB_URL || "http://127.0.0.1:5174";
const output = path.resolve(process.env.QUEUE_ARTIFACTS || path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..", ".tools/queue-browser/artifacts"));
await mkdir(output, { recursive: true });
const patientId = "00000000-0000-4000-8000-000000000001";
const doctorId = "00000000-0000-4000-8000-000000000002";
const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 7 * 3600_000 + 86400_000).toISOString().slice(0, 10);
const original = { id: "00000000-0000-4000-8000-000000000010", patientId, doctorId, status: "PENDING",
  scheduledStartAt: `${today}T01:00:00.000Z`, scheduledEndAt: `${today}T01:30:00.000Z`, reason: "Khám tổng quát" };
const nextSlot = { startAt: `${tomorrow}T03:00:00.000Z`, endAt: `${tomorrow}T03:30:00.000Z` };
const replacementSlot = { startAt: `${tomorrow}T04:00:00.000Z`, endAt: `${tomorrow}T04:30:00.000Z` };
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
const browserErrors = [];

async function scenario(name, run) {
  await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`);
}
async function session(role = "STAFF") {
  const context = await browser.newContext({ timezoneId: "America/New_York", reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (entry) => {
    if (entry.type() === "error") console.error(entry.text().replace(/https?:\/\/[^\s"']+/g, "[url]"));
  });
  page.on("requestfailed", (request) => console.error("Request failed:", new URL(request.url()).pathname, request.failure()?.errorText));
  await context.addInitScript(({ role }) => {
    localStorage.setItem("clinic_web_session", JSON.stringify({ accessToken: "synthetic-token", refreshToken: "synthetic-refresh",
      expiresAt: "2100-01-01T00:00:00Z", identity: { id: "synthetic-user", role, displayName: "Nhân viên kiểm thử" } }));
  }, { role });
  let items = [original, { ...original, id: "00000000-0000-4000-8000-000000000011", status: "CONFIRMED" },
    { ...original, id: "00000000-0000-4000-8000-000000000012", status: "CHECKED_IN" },
    { ...original, id: "00000000-0000-4000-8000-000000000013", status: "COMPLETED" }].map((item) => ({ ...item }));
  const writes = [];
  let conflict = false;
  let slotReads = 0;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(); const url = new URL(request.url()); const method = request.method();
    const respond = (data, status = 200) => route.fulfill({ status, contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ success: true, data }) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: {
      "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,PATCH,POST,OPTIONS",
    } });
    if (url.pathname === "/api/v1/appointments") {
      const from = Date.parse(url.searchParams.get("from")); const to = Date.parse(url.searchParams.get("to"));
      const filtered = items.filter((item) => Date.parse(item.scheduledStartAt) >= from && Date.parse(item.scheduledStartAt) < to);
      return respond({ items: filtered, page: 1, limit: 100, total: filtered.length });
    }
    if (url.pathname === `/api/v1/patients/${patientId}`) return respond({ id: patientId, fullName: "Nguyễn Văn An", insuranceNumber: "DN4011234567890" });
    if (url.pathname === `/api/v1/doctors/${doctorId}`) return respond({ id: doctorId, displayName: "Bác sĩ Bình" });
    if (url.pathname.endsWith("/available-slots")) {
      slotReads++;
      return respond(url.searchParams.get("date") === tomorrow ? [conflict ? replacementSlot : nextSlot] : []);
    }
    if (method === "PATCH") {
      writes.push({ path: url.pathname, body: request.postDataJSON() });
      const [, , , , id, action] = url.pathname.split("/");
      const row = items.find((item) => item.id === id); assert(row);
      if (action === "reschedule" && !conflict) {
        conflict = true;
        return route.fulfill({ status: 409, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ success: false, error: { code: "APPOINTMENT_SLOT_UNAVAILABLE", message: "Synthetic conflict" } }) });
      }
      const states = { confirm: "CONFIRMED", "check-in": "CHECKED_IN", cancel: "CANCELLED", "no-show": "NO_SHOW" };
      if (action === "reschedule") Object.assign(row, { scheduledStartAt: writes.at(-1).body.scheduledStartAt,
        scheduledEndAt: writes.at(-1).body.scheduledEndAt });
      else row.status = states[action];
      return respond(row);
    }
    throw new Error(`Unexpected intercepted route: ${method} ${url.pathname}`);
  });
  await page.goto(`${base}/appointments`);
  await page.getByRole("heading", { name: "Hàng đợi khám" }).waitFor();
  try { await page.getByRole("article").first().waitFor(); }
  catch (error) {
    await page.screenshot({ path: path.join(output, `queue-failure-${role}.png`), fullPage: true });
    console.error(await page.locator("body").innerText());
    throw error;
  }
  return { context, page, writes, slotReads: () => slotReads };
}

try {
  const staff = await session();
  const { page, writes } = staff;
  await scenario("Vietnam time and names; privacy; no completion control", async () => {
    assert.match(await page.getByRole("article").first().innerText(), /08:00–08:30/);
    assert.match(await page.locator("main").innerText(), /Nguyễn Văn An/);
    assert(!(await page.locator("main").innerText()).includes(patientId));
    assert(!(await page.locator("main").innerText()).includes("DN4011234567890"));
    assert.equal(await page.getByRole("button", { name: "Hoàn thành", exact: true }).count(), 0);
  });
  await scenario("1280 and 1920 desktop layout contains scrolling within the board", async () => {
    for (const width of [1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.screenshot({ path: path.join(output, `queue-${width}.png`), fullPage: true });
    }
  });
  await scenario("cancel modal requires reason, traps focus, and restores focus on Escape", async () => {
    const cancelButton = page.getByRole("article").filter({ has: page.getByRole("button", { name: "Xác nhận", exact: true }) }).getByRole("button", { name: "Hủy lịch", exact: true });
    await cancelButton.click();
    const dialog = page.getByRole("dialog"); await dialog.waitFor();
    await dialog.getByRole("button", { name: "Xác nhận hủy lịch", exact: true }).click();
    assert.equal(writes.length, 0);
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press("Tab");
      assert(await page.evaluate(() => document.querySelector("dialog").contains(document.activeElement)));
    }
    await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
    assert(await cancelButton.evaluate((element) => element === document.activeElement));
  });
  await scenario("confirm/check-in moves cards without document navigation", async () => {
    let navigations = 0; const listener = (frame) => { if (frame === page.mainFrame()) navigations++; };
    page.on("framenavigated", listener);
    await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-status="CONFIRMED"]').length === 2);
    await page.getByRole("button", { name: "Check-in", exact: true }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('[data-status="CHECKED_IN"]').length === 2);
    assert.equal(navigations, 0); page.off("framenavigated", listener);
  });
  await scenario("reschedule slot conflict retains reason and refreshes choices", async () => {
    await page.getByRole("button", { name: "Đổi lịch", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Ngày khám mới (giờ Việt Nam)").fill(tomorrow);
    await dialog.getByLabel("Lý do (bắt buộc)").fill("Bệnh nhân yêu cầu đổi giờ");
    await dialog.getByLabel("Khung giờ trống").selectOption(nextSlot.startAt);
    await dialog.getByRole("button", { name: "Xác nhận đổi lịch", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "Khung giờ không còn khả dụng" }).waitFor();
    assert.equal(await dialog.getByLabel("Lý do (bắt buộc)").inputValue(), "Bệnh nhân yêu cầu đổi giờ");
    await dialog.getByLabel("Khung giờ trống").selectOption(replacementSlot.startAt);
    await page.screenshot({ path: path.join(output, "queue-reschedule.png"), fullPage: true });
    await dialog.getByRole("button", { name: "Xác nhận đổi lịch", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(writes.filter((write) => write.path.endsWith("/reschedule")).length, 2);
    assert.equal(writes.at(-1).body.scheduledStartAt, replacementSlot.startAt);
    assert(staff.slotReads() >= 3);
  });
  await scenario("small viewport has no page overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: path.join(output, "queue-390.png"), fullPage: true });
  });
  await staff.context.close();
  const doctor = await session("DOCTOR");
  await scenario("DOCTOR can view assigned appointments but has no reception mutations", async () => {
    assert.equal(await doctor.page.getByRole("article").getByRole("button", { name: "Xác nhận", exact: true }).count(), 0);
    assert.equal(await doctor.page.getByRole("article").getByRole("button", { name: "Hủy lịch", exact: true }).count(), 0);
    assert.equal(await doctor.page.getByRole("article").getByRole("button", { name: "Check-in", exact: true }).count(), 0);
    assert.equal(doctor.writes.length, 0);
  });
  await doctor.context.close();
  assert.deepEqual(browserErrors, []);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ browser: browser.version(), results, browserErrors }, null, 2));
} finally {
  await browser.close();
}
