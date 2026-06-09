import { describe, it, expect, vi } from "vitest";
import { hashPassword } from "@/lib/password";
import { unlockToken, unlockCookieName } from "@/lib/view-lock";

const mocks = vi.hoisted(() => ({ getDoc: vi.fn(), incrementViews: vi.fn() }));
vi.mock("@/lib/store", () => mocks);
vi.mock("@/lib/ratelimit", () => ({
  unlockRatelimit: { limit: vi.fn(async () => ({ success: true })) },
  clientIp: () => "1.2.3.4",
}));

const fetchMock = vi.fn(async () => new Response("<h1>doc</h1>", { headers: { "content-type": "text/html" } }));
vi.stubGlobal("fetch", fetchMock);

import { GET, POST } from "@/app/d/[id]/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const lockView = hashPassword("open123");

describe("GET /d/[id]", () => {
  it("없는 문서는 만료 페이지(410)를 반환한다", async () => {
    mocks.getDoc.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://x/d/none"), ctx("none"));
    expect(res.status).toBe(410);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("만료된 문서도 410을 반환한다", async () => {
    mocks.getDoc.mockResolvedValueOnce({ blobUrl: "https://blob/x", expiresAt: 1 });
    const res = await GET(new Request("http://x/d/x"), ctx("x"));
    expect(res.status).toBe(410);
  });

  it("잠금 없는 문서는 200으로 서빙한다", async () => {
    mocks.getDoc.mockResolvedValueOnce({ blobUrl: "https://blob/x", expiresAt: "never" });
    const res = await GET(new Request("http://x/d/x"), ctx("x"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("doc");
  });

  it("잠긴 문서는 쿠키 없으면 게이트(200)를 보여준다", async () => {
    mocks.getDoc.mockResolvedValueOnce({
      blobUrl: "https://blob/x", expiresAt: "never",
      viewPasswordHash: lockView.hash, viewSalt: lockView.salt,
    });
    const res = await GET(new Request("http://x/d/x"), ctx("x"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("잠긴 문서입니다");
  });

  it("잠긴 문서도 유효 쿠키가 있으면 서빙한다", async () => {
    mocks.getDoc.mockResolvedValueOnce({
      blobUrl: "https://blob/x", expiresAt: "never",
      viewPasswordHash: lockView.hash, viewSalt: lockView.salt,
    });
    const token = unlockToken({ id: "x", viewPasswordHash: lockView.hash });
    const req = new Request("http://x/d/x", { headers: { cookie: `${unlockCookieName("x")}=${token}` } });
    const res = await GET(req, ctx("x"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("doc");
  });
});

describe("POST /d/[id]", () => {
  function pwReq(id: string, password: string) {
    const fd = new FormData();
    fd.append("password", password);
    const req = new Request(`http://x/d/${id}`, { method: "POST", body: fd });
    req.formData = async () => fd;
    return req;
  }

  it("틀린 비번은 401과 에러 게이트를 반환한다", async () => {
    mocks.getDoc.mockResolvedValueOnce({
      blobUrl: "https://blob/x", expiresAt: "never",
      viewPasswordHash: lockView.hash, viewSalt: lockView.salt,
    });
    const res = await POST(pwReq("x", "wrong"), ctx("x"));
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("비밀번호가 일치하지 않습니다");
  });

  it("맞는 비번은 303과 쿠키를 발급한다", async () => {
    mocks.getDoc.mockResolvedValueOnce({
      blobUrl: "https://blob/x", expiresAt: "never",
      viewPasswordHash: lockView.hash, viewSalt: lockView.salt,
    });
    const res = await POST(pwReq("x", "open123"), ctx("x"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/d/x");
    expect(res.headers.get("set-cookie")).toContain(`${unlockCookieName("x")}=`);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    expect(res.headers.get("set-cookie")).toContain("Secure");
    expect(res.headers.get("set-cookie")).toContain("SameSite=Lax");
  });

  it("레이트리밋 초과 시 429를 반환한다", async () => {
    const { unlockRatelimit } = await import("@/lib/ratelimit");
    vi.mocked(unlockRatelimit.limit).mockResolvedValueOnce({ success: false } as Awaited<ReturnType<typeof unlockRatelimit.limit>>);
    mocks.getDoc.mockResolvedValueOnce({
      blobUrl: "https://blob/x", expiresAt: "never",
      viewPasswordHash: lockView.hash, viewSalt: lockView.salt,
    });
    const res = await POST(pwReq("x", "open123"), ctx("x"));
    expect(res.status).toBe(429);
  });
});
