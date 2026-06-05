import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDoc: vi.fn(), incrementViews: vi.fn() }));
vi.mock("@/lib/store", () => mocks);

const fetchMock = vi.fn(async () => new Response("<h1>doc</h1>", { headers: { "content-type": "text/html" } }));
vi.stubGlobal("fetch", fetchMock);

import { GET } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

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

  it("유효한 문서는 HTML을 200으로 서빙한다", async () => {
    mocks.getDoc.mockResolvedValueOnce({ blobUrl: "https://blob/x", expiresAt: "never" });
    const res = await GET(new Request("http://x/d/x"), ctx("x"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("doc");
  });
});
