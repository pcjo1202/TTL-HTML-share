import { describe, it, expect } from "vitest";
import { expiryLabel } from "@/lib/expiry-label";

const DAY = 24 * 60 * 60 * 1000;

describe("expiryLabel", () => {
  it("영구 문서는 permanent 상태", () => {
    expect(expiryLabel("never", 1000)).toEqual({ text: "영구", status: "permanent" });
  });

  it("남은 일수를 올림하여 D-N으로 표시한다", () => {
    expect(expiryLabel(1000 + 5 * DAY, 1000)).toEqual({ text: "D-5", status: "active" });
    expect(expiryLabel(1000 + Math.floor(2.3 * DAY), 1000)).toEqual({ text: "D-3", status: "active" });
  });

  it("만료시각이 지났거나 같으면 곧 만료(soon)", () => {
    expect(expiryLabel(1000, 2000)).toEqual({ text: "곧 만료", status: "soon" });
    expect(expiryLabel(1000, 1000)).toEqual({ text: "곧 만료", status: "soon" });
  });
});
