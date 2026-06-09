import { describe, it, expect } from "vitest";
import { unlockToken, unlockCookieName, isValidUnlockCookie } from "@/lib/view-lock";

const id = "abc1234567";
const hash = "deadbeefhash";

describe("view-lock", () => {
  it("unlockToken은 같은 입력에 같은 토큰을 낸다", () => {
    expect(unlockToken({ id, viewPasswordHash: hash })).toBe(
      unlockToken({ id, viewPasswordHash: hash }),
    );
  });

  it("해시가 다르면 토큰이 다르다", () => {
    expect(unlockToken({ id, viewPasswordHash: hash })).not.toBe(
      unlockToken({ id, viewPasswordHash: "other" }),
    );
  });

  it("unlockCookieName은 id를 포함한다", () => {
    expect(unlockCookieName(id)).toBe(`unlock_${id}`);
  });

  it("유효한 토큰 쿠키는 통과한다", () => {
    const cookieValue = unlockToken({ id, viewPasswordHash: hash });
    expect(isValidUnlockCookie({ cookieValue, id, viewPasswordHash: hash })).toBe(true);
  });

  it("값이 없거나 틀리면 거부한다", () => {
    expect(isValidUnlockCookie({ cookieValue: undefined, id, viewPasswordHash: hash })).toBe(false);
    expect(isValidUnlockCookie({ cookieValue: "wrong", id, viewPasswordHash: hash })).toBe(false);
  });

  it("다른 해시로 만든 토큰은 거부한다", () => {
    const cookieValue = unlockToken({ id, viewPasswordHash: "other" });
    expect(isValidUnlockCookie({ cookieValue, id, viewPasswordHash: hash })).toBe(false);
  });
});
