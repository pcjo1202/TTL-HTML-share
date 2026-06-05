import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("같은 비밀번호라도 매번 다른 salt/hash를 만든다", () => {
    const a = hashPassword("hunter2");
    const b = hashPassword("hunter2");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("올바른 비밀번호를 검증 통과시킨다", () => {
    const { hash, salt } = hashPassword("hunter2");
    expect(verifyPassword("hunter2", hash, salt)).toBe(true);
  });

  it("틀린 비밀번호를 거부한다", () => {
    const { hash, salt } = hashPassword("hunter2");
    expect(verifyPassword("wrong", hash, salt)).toBe(false);
  });
});
