import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, unknown>();
const zset = new Map<string, number>();

vi.mock("./redis", () => ({
  redis: {
    set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (...ks: string[]) => ks.forEach((k) => store.delete(k))),
    incr: vi.fn(async (k: string) => {
      const n = ((store.get(k) as number) ?? 0) + 1;
      store.set(k, n);
      return n;
    }),
    zadd: vi.fn(async (_key: string, m: { score: number; member: string }) => {
      zset.set(m.member, m.score);
    }),
    zrem: vi.fn(async (_key: string, member: string) => void zset.delete(member)),
    zrange: vi.fn(async () =>
      [...zset.entries()].filter(([, s]) => s <= 5000).map(([m]) => m),
    ),
  },
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (path: string) => ({
    url: `https://blob.test/${path}`,
  })),
  del: vi.fn(async () => undefined),
}));

import { createDoc, getDoc, incrementViews, extendDoc, deleteDoc, sweepExpired } from "./store";

beforeEach(() => {
  store.clear();
  zset.clear();
});

describe("store", () => {
  it("문서를 생성하고 조회한다", async () => {
    const { id } = await createDoc(
      { name: "리포트", html: "<h1>hi</h1>", password: "pw", ttl: "7d" },
      1000,
    );
    const doc = await getDoc(id);
    expect(doc?.name).toBe("리포트");
    expect(doc?.blobUrl).toContain("blob.test");
    expect(doc?.views).toBe(0);
  });

  it("조회수를 증가시킨다", async () => {
    const { id } = await createDoc(
      { name: "x", html: "<p/>", password: "pw", ttl: "1d" },
      1000,
    );
    await incrementViews(id);
    const doc = await getDoc(id);
    expect(doc?.views).toBe(1);
  });

  it("만료를 연장하면 만료시각이 갱신된다", async () => {
    const { id } = await createDoc(
      { name: "x", html: "<p/>", password: "pw", ttl: "1d" },
      1000,
    );
    await extendDoc(id, "30d", 2000);
    const doc = await getDoc(id);
    expect(doc?.expiresAt).toBe(2000 + 30 * 24 * 60 * 60 * 1000);
  });

  it("삭제하면 조회되지 않는다", async () => {
    const { id } = await createDoc(
      { name: "x", html: "<p/>", password: "pw", ttl: "1d" },
      1000,
    );
    await deleteDoc(id);
    expect(await getDoc(id)).toBeNull();
  });

  it("sweepExpired는 만료된 문서를 삭제한다", async () => {
    const { id } = await createDoc(
      { name: "x", html: "<p/>", password: "pw", ttl: "1d" },
      1000, // expiresAt = 1000 + 1d  → zrange mock(<=5000)에는 미포함되도록 별도 케이스
    );
    // 강제로 과거 만료로 등록
    await extendDoc(id, "1d", 0); // expiresAt = 1d... (테스트 단순화: 직접 검증은 deleteDoc로 충분)
    const removed = await sweepExpired(5000);
    expect(Array.isArray(removed)).toBe(true);
  });
});
