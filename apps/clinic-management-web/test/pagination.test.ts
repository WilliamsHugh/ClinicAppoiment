import { describe, expect, it } from "vitest";
import { getPaginationState } from "../src/components/pagination";

describe("getPaginationState", () => {
  it("disables previous on the first page and next on the last page", () => {
    expect(getPaginationState(1, 20, 41)).toEqual({
      page: 1,
      pageCount: 3,
      canGoPrevious: false,
      canGoNext: true
    });
    expect(getPaginationState(3, 20, 41)).toEqual({
      page: 3,
      pageCount: 3,
      canGoPrevious: true,
      canGoNext: false
    });
  });

  it("keeps empty results on page one and clamps invalid page input", () => {
    expect(getPaginationState(9, 0, 0)).toEqual({
      page: 1,
      pageCount: 1,
      canGoPrevious: false,
      canGoNext: false
    });
    expect(getPaginationState(-4, 10, 25).page).toBe(1);
    expect(getPaginationState(99, 10, 25).page).toBe(3);
  });
});
