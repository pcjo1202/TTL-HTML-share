import { describe, it, expect } from "vitest";
import { lockPageHtml } from "@/lib/lock-page";

describe("lock-page", () => {
  it("폼 action에 문서 경로를 넣는다", () => {
    const html = lockPageHtml({ id: "abc1234567" });
    expect(html).toContain('action="/d/abc1234567"');
    expect(html).toContain('name="password"');
    expect(html).toContain('content="noindex"');
  });

  it("에러를 주면 메시지를 표시한다", () => {
    const html = lockPageHtml({ id: "x", error: "비밀번호가 일치하지 않습니다." });
    expect(html).toContain("비밀번호가 일치하지 않습니다.");
  });

  it("에러가 없으면 에러 블록이 없다", () => {
    expect(lockPageHtml({ id: "x" })).not.toContain('class="err"');
  });
});
