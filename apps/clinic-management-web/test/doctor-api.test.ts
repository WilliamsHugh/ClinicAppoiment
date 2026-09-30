import { describe, expect, it, vi } from "vitest";
import { doctorApi } from "../src/features/doctors/doctor-api";
import { ApiClient } from "../src/lib/api/client";

describe("Doctor API Gateway routes", () => {
  it("updates time off under the selected doctor", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { id: "off-1", doctorId: "doctor-1", reason: "Training" }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = new ApiClient({ baseUrl: "http://gateway.test",
      session: { getAccessToken: async () => "token" }, fetcher });

    await doctorApi(client).updateTimeOff("doctor-1", "off-1", { reason: "Training" });

    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe("http://gateway.test/api/v1/doctors/doctor-1/time-offs/off-1");
    expect(options?.method).toBe("PATCH");
    expect(options?.body).toBe(JSON.stringify({ reason: "Training" }));
  });
});
