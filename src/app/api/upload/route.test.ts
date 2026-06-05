import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/store", () => ({
  createDoc: vi.fn(async () => ({ id: "abc1234567", expiresAt: 1000 })),
}));
vi.mock("@/lib/ratelimit", () => ({
  uploadRatelimit: { limit: vi.fn(async () => ({ success: true })) },
  clientIp: () => "1.2.3.4",
}));

import { POST } from "./route";

function formReq(fields: Record<string, string>, file?: { name: string; content: string; size?: number }) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) {
    const blob = new Blob([file.content], { type: "text/html" });
    Object.defineProperty(blob, "size", { value: file.size ?? file.content.length });
    fd.append("file", new File([blob], file.name, { type: "text/html" }));
  }
  const req = new Request("http://x/api/upload", { method: "POST", body: fd });
  // Node.js re-parses multipart bytes on formData(), losing the fake size override.
  // Override formData() to return the original FormData so size property is preserved.
  req.formData = async () => fd;
  return req;
}

describe("POST /api/upload", () => {
  it("정상 업로드 시 id와 url을 반환한다", async () => {
    const res = await POST(formReq({ name: "리포트", password: "pw", ttl: "7d" }, { name: "a.html", content: "<h1/>" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("abc1234567");
    expect(json.url).toContain("/d/abc1234567");
  });

  it("필수값 누락 시 400을 반환한다", async () => {
    const res = await POST(formReq({ name: "", password: "", ttl: "7d" }));
    expect(res.status).toBe(400);
  });

  it("10MB 초과 시 413을 반환한다", async () => {
    const res = await POST(
      formReq({ name: "x", password: "pw", ttl: "7d" }, { name: "big.html", content: "x", size: 11 * 1024 * 1024 }),
    );
    expect(res.status).toBe(413);
  });
});
