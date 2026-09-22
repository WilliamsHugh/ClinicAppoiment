import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiClientError } from "../src/lib/api/client";

function response(body: unknown, status = 200, requestId = "req-1") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-Id": requestId }
  });
}

function client(fetcher: typeof fetch, token: string | null = "access-token", timeoutMs = 100) {
  return new ApiClient({
    baseUrl: "http://gateway.test/",
    session: { getAccessToken: async () => token },
    fetcher,
    timeoutMs
  });
}

describe("ApiClient", () => {
  it("refuses protected calls when the session has no token", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(client(fetcher, null).get("/api/v1/users/me")).rejects.toMatchObject({ code: "SESSION_REQUIRED", status: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes token provider failures as a session error", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = new ApiClient({
      baseUrl: "http://gateway.test",
      session: { getAccessToken: async () => { throw new Error("refresh failed"); } },
      fetcher
    });
    await expect(api.get("/protected")).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE", status: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends bearer identity, query, body and idempotency key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({
      success: true,
      data: { items: [], page: 2, limit: 10, total: 27 }
    }));
    const result = await client(fetcher).post<{ items: unknown[]; page: number; limit: number; total: number }>("/api/v1/appointments", {
      query: { page: 2, q: "An", ignored: undefined },
      body: { doctorId: "doctor-1" },
      idempotencyKey: "random-key-123456",
      headers: {
        Accept: "text/plain",
        "Content-Type": "text/plain",
        "X-Role": "ADMIN",
        "X-User-Id": "forged-user"
      }
    });

    const [url, init] = fetcher.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(url).toBe("http://gateway.test/api/v1/appointments?page=2&q=An");
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBe("random-key-123456");
    expect(headers.has("X-Role")).toBe(false);
    expect(headers.has("X-User-Id")).toBe(false);
    expect(init?.body).toBe(JSON.stringify({ doctorId: "doctor-1" }));
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 27 });
    expect(result.requestId).toBe("req-1");
  });

  it.each([401, 403, 429, 502])("keeps structured error details for HTTP %i", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({
      success: false,
      error: { code: `HTTP_${status}`, message: "Rejected", details: [{ field: "role" }] },
      requestId: `body-${status}`
    }, status));

    await expect(client(fetcher).get("/protected")).rejects.toMatchObject({
      status,
      code: `HTTP_${status}`,
      message: "Rejected",
      details: [{ field: "role" }],
      requestId: `body-${status}`
    });
  });

  it("reports malformed JSON without losing the response request ID", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json", {
      status: 502,
      headers: { "X-Request-Id": "malformed-1" }
    }));
    await expect(client(fetcher).get("/broken")).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE", requestId: "malformed-1" });
  });

  it("rejects JSON that does not match the API envelope", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(null));
    await expect(client(fetcher).get("/broken-shape")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("distinguishes timeout and network failures", async () => {
    const hangingFetch = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    await expect(client(hangingFetch, "token", 5).get("/slow")).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });

    const failedFetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("connection refused"));
    const rejection = client(failedFetch).get("/offline");
    await expect(rejection).rejects.toBeInstanceOf(ApiClientError);
    await expect(client(failedFetch).get("/offline")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
