import { afterEach, describe, expect, it, vi } from "vitest";
import { createUserDirectory, DependencyError } from "../src/dependencies.js";

const userId = "00000000-0000-4000-8000-000000000002";
const url = `http://user-service:3001/internal/v1/users/${userId}/doctor-eligibility`;

afterEach(() => vi.unstubAllGlobals());

describe("User Service doctor eligibility client", () => {
  it("uses the internal endpoint and forwards the request ID without a forged role", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { id: userId, role: "DOCTOR", status: "ACTIVE" }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createUserDirectory("http://user-service:3001").findDoctorAccount(userId, "doctor-req-1"))
      .resolves.toEqual({ id: userId, role: "DOCTOR", status: "ACTIVE" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [calledUrl, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(calledUrl.href).toBe(url);
    expect(options.headers).toEqual({ Accept: "application/json", "X-Request-Id": "doctor-req-1" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps a missing account to null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false, error: { code: "USER_NOT_FOUND" }
    }), { status: 404 })));
    await expect(createUserDirectory("http://user-service:3001").findDoctorAccount(userId)).resolves.toBeNull();
  });

  it.each([
    { success: true, data: { id: "other-id", role: "DOCTOR", status: "ACTIVE" } },
    { success: true, data: { id: userId, role: "DOCTOR" } },
    { success: false, data: { id: userId, role: "DOCTOR", status: "ACTIVE" } },
    null
  ])("rejects an invalid response envelope: %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    await expect(createUserDirectory("http://user-service:3001").findDoctorAccount(userId))
      .rejects.toBeInstanceOf(DependencyError);
  });

  it("fails when the User Service request times out", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: URL, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
    })));
    await expect(createUserDirectory("http://user-service:3001", 10).findDoctorAccount(userId))
      .rejects.toBeInstanceOf(DependencyError);
  });
});
