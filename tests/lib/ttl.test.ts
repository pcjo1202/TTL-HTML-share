import { describe, it, expect } from "vitest";
import { isValidTtl, parseTtl, computeExpiresAt, isExpired } from "@/lib/ttl";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("ttl", () => {
  it("프리셋과 범위 내 임의 일수를 통과시킨다", () => {
    expect(isValidTtl("7d")).toBe(true);
    expect(isValidTtl("never")).toBe(true);
    expect(isValidTtl("99d")).toBe(true);
    expect(isValidTtl("365d")).toBe(true);
  });

  it("범위 밖·형식 오류는 거절한다", () => {
    expect(isValidTtl("0d")).toBe(false);
    expect(isValidTtl("366d")).toBe(false);
    expect(isValidTtl("-1d")).toBe(false);
    expect(isValidTtl("abc")).toBe(false);
    expect(isValidTtl("7")).toBe(false);
    expect(isValidTtl("07d")).toBe(false);
  });

  it("parseTtl은 일수/never/null을 반환한다", () => {
    expect(parseTtl("14d")).toBe(14);
    expect(parseTtl("never")).toBe("never");
    expect(parseTtl("999d")).toBe(null);
  });

  it("기간 옵션은 now + days*DAY_MS를 만료시각으로 계산한다", () => {
    expect(computeExpiresAt("1d", 1000)).toBe(1000 + DAY_MS);
    expect(computeExpiresAt("14d", 0)).toBe(14 * DAY_MS);
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
