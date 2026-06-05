import { describe, it, expect } from "vitest";
import { isValidTtl, computeExpiresAt, isExpired, TTL_DURATIONS } from "./ttl";

describe("ttl", () => {
  it("유효한 옵션만 통과시킨다", () => {
    expect(isValidTtl("7d")).toBe(true);
    expect(isValidTtl("never")).toBe(true);
    expect(isValidTtl("99d")).toBe(false);
  });

  it("기간 옵션은 now + duration을 만료시각으로 계산한다", () => {
    expect(computeExpiresAt("1d", 1000)).toBe(1000 + TTL_DURATIONS["1d"]);
  });

  it("never는 만료되지 않는다", () => {
    expect(computeExpiresAt("never", 1000)).toBe("never");
    expect(isExpired("never", 9_999_999_999)).toBe(false);
  });

  it("만료시각을 지난 경우 만료로 판정한다", () => {
    expect(isExpired(1000, 1001)).toBe(true);
    expect(isExpired(1000, 999)).toBe(false);
  });
});
