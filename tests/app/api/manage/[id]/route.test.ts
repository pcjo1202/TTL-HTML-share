import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  extendDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
}));
vi.mock("@/lib/store", () => mocks);
vi.mock("@/lib/password", () => ({
  verifyPassword: (pw: string) => pw === "correct",
}));

import { POST } from "@/app/api/manage/[id]/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const body = (b: unknown) =>
  new Request("http://x", { method: "POST", body: JSON.stringify(b) });

describe("POST /api/manage/[id]", () => {
  it("틀린 비밀번호는 401", async () => {
    mocks.getDoc.mockResolvedValueOnce({ passwordHash: "h", salt: "s" });
    const res = await POST(body({ password: "wrong", action: "delete" }), ctx("x"));
    expect(res.status).toBe(401);
  });

  it("연장 액션은 extendDoc를 호출한다", async () => {
    mocks.getDoc.mockResolvedValueOnce({ passwordHash: "h", salt: "s" });
    const res = await POST(body({ password: "correct", action: "extend", ttl: "30d" }), ctx("x"));
    expect(res.status).toBe(200);
    expect(mocks.extendDoc).toHaveBeenCalledWith("x", "30d", expect.any(Number));
  });

  it("삭제 액션은 deleteDoc를 호출한다", async () => {
    mocks.getDoc.mockResolvedValueOnce({ passwordHash: "h", salt: "s" });
    const res = await POST(body({ password: "correct", action: "delete" }), ctx("x"));
    expect(res.status).toBe(200);
    expect(mocks.deleteDoc).toHaveBeenCalledWith("x");
  });
});
