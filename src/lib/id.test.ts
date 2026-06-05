import { describe, it, expect } from "vitest";
import { generateId } from "./id";

describe("generateId", () => {
  it("길이가 10인 ID를 만든다", () => {
    expect(generateId()).toHaveLength(10);
  });

  it("URL-safe 문자(영숫자)만 사용한다", () => {
    expect(generateId()).toMatch(/^[0-9A-Za-z]{10}$/);
  });

  it("1000번 호출해도 충돌이 없다", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    expect(ids.size).toBe(1000);
  });
});
