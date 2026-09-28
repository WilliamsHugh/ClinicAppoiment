import { describe, expect, it } from "vitest";
import type { DoctorSchedule, DoctorTimeOff } from "../src/models.js";
import { candidateSlots, overlaps, parseLocalDate, validExactSlot } from "../src/slots.js";

const schedule: DoctorSchedule = {
  id: "schedule", doctorId: "doctor", weekday: 1, startTime: "08:00", endTime: "10:00",
  slotDurationMinutes: 30, isActive: true, createdAt: "", updatedAt: ""
};

describe("Doctor slots in Asia/Ho_Chi_Minh", () => {
  it("converts local Monday 08:00 to 01:00 UTC and uses half-open intervals", () => {
    const slots = candidateSlots("2030-01-07", [schedule], [], new Date("2029-01-01T00:00:00Z"));
    expect(slots).toHaveLength(4);
    expect(slots[0]).toEqual({ startAt: "2030-01-07T01:00:00.000Z", endAt: "2030-01-07T01:30:00.000Z" });
    expect(overlaps(slots[0], slots[1])).toBe(false);
    expect(overlaps(slots[0], { startAt: "2030-01-07T01:15:00Z", endAt: "2030-01-07T01:45:00Z" })).toBe(true);
  });

  it("removes every slot intersecting time off", () => {
    const off: DoctorTimeOff = {
      id: "off", doctorId: "doctor", startAt: "2030-01-07T01:15:00.000Z",
      endAt: "2030-01-07T01:45:00.000Z", reason: null, createdAt: ""
    };
    const slots = candidateSlots("2030-01-07", [schedule], [off], new Date("2029-01-01T00:00:00Z"));
    expect(slots.map((slot) => slot.startAt)).toEqual(["2030-01-07T02:00:00.000Z", "2030-01-07T02:30:00.000Z"]);
  });

  it("rejects malformed dates, misaligned slots and past starts", () => {
    expect(parseLocalDate("2030-02-30")).toBeNull();
    expect(validExactSlot("2030-01-07T01:15:00.000Z", "2030-01-07T01:45:00.000Z", [schedule], [], new Date("2029-01-01T00:00:00Z"))).toBe(false);
    expect(validExactSlot("2030-01-07T01:00:00.000Z", "2030-01-07T01:30:00.000Z", [schedule], [], new Date("2030-01-07T01:00:00Z"))).toBe(false);
  });
});
