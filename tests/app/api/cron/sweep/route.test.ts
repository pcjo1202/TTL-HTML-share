import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ sweepExpired: vi.fn(async () => ["a", "b"]) }));
vi.mock("@/lib/store", () => mocks);

import { GET } from "@/app/api/cron/sweep/route";

beforeEach(() => {
  process.env.CRON_SECRET = "secret";
});

describe("GET /api/cron/sweep", () => {
  it("잘못된 시크릿은 401", async () => {
    const res = await GET(new Request("http://x", { headers: { authorization: "Bearer nope" } }));
    expect(res.status).toBe(401);
  });

  it("올바른 시크릿이면 만료분을 청소한다", async () => {
    const res = await GET(new Request("http://x", { headers: { authorization: "Bearer secret" } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.removed).toBe(2);
  });
});
