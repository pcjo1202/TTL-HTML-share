# 문서 목록 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 등록된 문서 전체를 최신순으로 보여주는 공개 SSR 목록 페이지(`/docs`)와 상단 탭을 추가한다.

**Architecture:** Redis에 전역 인덱스 `docs:index`(정렬셋, score=createdAt)를 추가해 영구 문서 포함 전체를 열거한다. `/docs`는 SSR 서버 컴포넌트가 `listDocs()`를 직접 호출(별도 API 없음)하고, `force-dynamic`으로 캐시를 끄며 `noindex`를 단다. 상단 탭은 두 페이지가 공유하는 클라이언트 컴포넌트다.

**Tech Stack:** Next.js App Router, Upstash Redis(`@upstash/redis`), Tailwind CSS 4, Vitest.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/lib/store.ts` (수정) | `docs:index` 유지(create/delete), `listDocs`, `DocSummary` 타입 |
| `tests/lib/store.test.ts` (수정) | redis 목 업그레이드(키별 정렬셋·옵션) + 인덱스/`listDocs` 테스트 |
| `src/app/tab-nav.tsx` (신규) | 상단 탭 `[업로드][문서 목록]` 클라이언트 컴포넌트 |
| `src/app/page.tsx` (수정) | 업로드 페이지 상단에 `TabNav` 렌더 |
| `src/app/docs/page.tsx` (신규) | SSR 목록 페이지(force-dynamic, noindex) |

---

## Task 1: 데이터 모델 — `docs:index` 유지 + `listDocs`

**Files:**
- Modify: `src/lib/store.ts`
- Test: `tests/lib/store.test.ts`

- [ ] **Step 1: redis 목을 키별 정렬셋 + 옵션 지원으로 업그레이드**

`tests/lib/store.test.ts` 상단의 목 정의를 아래로 **교체**한다(기존 단일 `zset` Map은 `docs:index`/`expiry:index`를 구분 못 해 충돌하므로 키별 Map으로 바꾸고, `mget`과 `zrange` 옵션(`rev`/`byScore`)을 지원하게 한다).

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, unknown>();
const zsets = new Map<string, Map<string, number>>();
const zsetOf = (k: string) => {
  let z = zsets.get(k);
  if (!z) {
    z = new Map();
    zsets.set(k, z);
  }
  return z;
};

vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    mget: vi.fn(async (...ks: string[]) => ks.map((k) => store.get(k) ?? null)),
    del: vi.fn(async (...ks: string[]) => ks.forEach((k) => store.delete(k))),
    incr: vi.fn(async (k: string) => {
      const n = ((store.get(k) as number) ?? 0) + 1;
      store.set(k, n);
      return n;
    }),
    zadd: vi.fn(async (key: string, m: { score: number; member: string }) => {
      zsetOf(key).set(m.member, m.score);
    }),
    zrem: vi.fn(async (key: string, member: string) =>
      void zsetOf(key).delete(member),
    ),
    zrange: vi.fn(
      async (
        key: string,
        start: number,
        stop: number,
        opts?: { rev?: boolean; byScore?: boolean },
      ) => {
        const entries = [...zsetOf(key).entries()];
        if (opts?.byScore) {
          return entries
            .filter(([, s]) => s >= start && s <= stop)
            .map(([m]) => m);
        }
        entries.sort((a, b) => (opts?.rev ? b[1] - a[1] : a[1] - b[1]));
        return entries.map(([m]) => m);
      },
    ),
  },
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (path: string) => ({
    url: `https://blob.test/${path}`,
  })),
  del: vi.fn(async () => undefined),
}));

import {
  createDoc,
  getDoc,
  incrementViews,
  extendDoc,
  deleteDoc,
  sweepExpired,
  listDocs,
} from "@/lib/store";

beforeEach(() => {
  store.clear();
  zsets.clear();
});
```

> 기존 `describe("store", ...)` 블록과 그 안의 테스트들은 그대로 둔다(이 단계는 상단 목 정의 + import + beforeEach만 교체). `beforeEach`가 `zset.clear()` → `zsets.clear()`로 바뀐 점에 주의.

- [ ] **Step 2: 실패하는 테스트 추가**

`tests/lib/store.test.ts`의 `describe("store", ...)` 블록 안 마지막에 아래 테스트들을 추가한다.

```ts
  it("createDoc는 docs:index에 등록하고 listDocs로 조회된다", async () => {
    const { id } = await createDoc(
      { name: "a", html: "<p/>", password: "pw", ttl: "never" },
      1000,
    );
    const list = await listDocs(2000);
    expect(list.map((d) => d.id)).toContain(id);
  });

  it("listDocs는 최신순 정렬·만료 숨김·영구 포함한다", async () => {
    await createDoc({ name: "A", html: "<p/>", password: "pw", ttl: "1d" }, 0); // exp = 86400000
    await createDoc({ name: "B", html: "<p/>", password: "pw", ttl: "never" }, 100);
    await createDoc({ name: "C", html: "<p/>", password: "pw", ttl: "30d" }, 200);
    const list = await listDocs(90_000_000); // A 만료, C 유효
    expect(list.map((d) => d.name)).toEqual(["C", "B"]); // createdAt desc
    expect(list.find((d) => d.name === "B")?.expiresAt).toBe("never");
  });

  it("listDocs 요약에는 민감 필드가 없다", async () => {
    await createDoc({ name: "x", html: "<p/>", password: "pw", ttl: "never" }, 0);
    const [d] = await listDocs(1000);
    expect(d).not.toHaveProperty("passwordHash");
    expect(d).not.toHaveProperty("salt");
    expect(d).not.toHaveProperty("blobUrl");
    expect(d.views).toBe(0);
  });

  it("deleteDoc는 docs:index에서 제거한다", async () => {
    const { id } = await createDoc(
      { name: "x", html: "<p/>", password: "pw", ttl: "never" },
      0,
    );
    await deleteDoc(id);
    expect((await listDocs(1000)).map((d) => d.id)).not.toContain(id);
  });

  it("listDocs는 인덱스에 있으나 레코드가 없는 항목을 건너뛴다", async () => {
    const { redis } = await import("@/lib/redis");
    await redis.zadd("docs:index", { score: 5, member: "ghost" });
    expect((await listDocs(1000)).map((d) => d.id)).not.toContain("ghost");
  });

  it("빈 인덱스에서 listDocs는 빈 배열", async () => {
    expect(await listDocs(1000)).toEqual([]);
  });
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm run test`
Expected: FAIL — `listDocs` is not exported (`store.ts`에 아직 없음).

- [ ] **Step 4: `store.ts`에 인덱스 유지 + `listDocs` 구현**

`src/lib/store.ts`를 수정한다.

(4a) 상단 상수에 인덱스 키 추가:

```ts
const EXPIRY_INDEX = "expiry:index";
const DOCS_INDEX = "docs:index";
const docKey = (id: string) => `doc:${id}`;
const viewsKey = (id: string) => `views:${id}`;
```

(4b) `createDoc` 내부, `await redis.set(viewsKey(id), 0);` 다음 줄에 전역 인덱스 등록 추가:

```ts
  await redis.set(docKey(id), record);
  await redis.set(viewsKey(id), 0);
  await redis.zadd(DOCS_INDEX, { score: now, member: id });
  if (expiresAt !== "never") {
    await redis.zadd(EXPIRY_INDEX, { score: expiresAt, member: id });
  }
```

(4c) `deleteDoc` 내부, 마지막 정리에 `docs:index` 제거 추가:

```ts
export async function deleteDoc(id: string): Promise<void> {
  const record = (await redis.get(docKey(id))) as DocRecord | null;
  if (record) {
    await del(record.blobUrl);
  }
  await redis.del(docKey(id), viewsKey(id));
  await redis.zrem(EXPIRY_INDEX, id);
  await redis.zrem(DOCS_INDEX, id);
}
```

(4d) 파일 끝에 `DocSummary` 타입과 `listDocs`를 추가:

```ts
export interface DocSummary {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number | "never";
  views: number;
}

export async function listDocs(now: number): Promise<DocSummary[]> {
  const ids = (await redis.zrange(DOCS_INDEX, 0, -1, { rev: true })) as string[];
  if (ids.length === 0) return [];
  const records = (await redis.mget(...ids.map(docKey))) as (DocRecord | null)[];
  const viewCounts = (await redis.mget(...ids.map(viewsKey))) as (number | null)[];
  const out: DocSummary[] = [];
  records.forEach((record, i) => {
    if (!record) return;
    if (record.expiresAt !== "never" && now > record.expiresAt) return;
    out.push({
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      views: viewCounts[i] ?? 0,
    });
  });
  return out;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm run test`
Expected: PASS (기존 + 신규 전부 그린).

- [ ] **Step 6: 빌드 확인**

Run: `npm run build`
Expected: 성공(컴파일 OK).

- [ ] **Step 7: 커밋**

```bash
git add src/lib/store.ts tests/lib/store.test.ts
git commit -m "$(cat <<'EOF'
feat: 전역 문서 인덱스와 목록 조회 함수를 추가합니다

docs:index 정렬셋으로 영구 문서 포함 전체를 최신순 열거하고,
민감 필드를 제외한 DocSummary를 반환하는 listDocs를 추가합니다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 상단 탭 `TabNav` + 업로드 페이지 통합

**Files:**
- Create: `src/app/tab-nav.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: `TabNav` 클라이언트 컴포넌트 생성**

`src/app/tab-nav.tsx` 신규 작성:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "업로드" },
  { href: "/docs", label: "문서 목록" },
] as const;

export default function TabNav() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-2xl gap-1 px-5 pt-6">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              active ? "bg-toss-blue text-white" : "text-ink-3 hover:bg-bg-2"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: 업로드 페이지에 탭 추가**

`src/app/page.tsx`를 아래로 **교체**한다(상단 패딩을 `py-12` → `pt-8 pb-12`로 줄여 탭과의 간격 정리):

```tsx
import TabNav from "./tab-nav";
import UploadForm from "./upload-form";

export default function Home() {
  return (
    <>
      <TabNav />
      <main className="mx-auto max-w-2xl px-5 pt-8 pb-12">
        <h1 className="text-2xl font-bold">HTML 바로 공유</h1>
        <p className="mt-1 text-ink-3">
          파일을 올리면 즉시 공유 링크가 생성됩니다.
        </p>
        <div className="mt-8">
          <UploadForm />
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 3: 빌드 + 린트 확인**

Run: `npm run build && npm run lint`
Expected: 성공(에러 없음). 시각 동작은 단위 테스트 대상 아님(기존 방침).

- [ ] **Step 4: 커밋**

```bash
git add src/app/tab-nav.tsx src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat: 상단 탭 내비게이션을 추가합니다

업로드/문서 목록을 전환하는 TabNav를 만들고 업로드 페이지에 배치합니다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `/docs` SSR 목록 페이지

**Files:**
- Create: `src/app/docs/page.tsx`

- [ ] **Step 1: 목록 페이지 생성**

`src/app/docs/page.tsx` 신규 작성:

```tsx
import Link from "next/link";
import type { Metadata } from "next";
import TabNav from "../tab-nav";
import { listDocs } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "문서 목록 · TTL HTML Share",
  robots: { index: false, follow: false },
};

const DAY = 24 * 60 * 60 * 1000;

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });
}

function dday(expiresAt: number | "never", now: number): string {
  if (expiresAt === "never") return "영구";
  const days = Math.ceil((expiresAt - now) / DAY);
  return days <= 0 ? "곧 만료" : `D-${days}`;
}

export default async function DocsPage() {
  const now = Date.now();
  const docs = await listDocs(now);

  return (
    <>
      <TabNav />
      <main className="mx-auto max-w-2xl px-5 pt-8 pb-12">
        <h1 className="text-2xl font-bold">문서 목록</h1>
        <p className="mt-1 text-ink-3">등록된 문서 {docs.length}개</p>

        {docs.length === 0 ? (
          <div className="mt-8 rounded-[20px] bg-white p-10 text-center text-ink-3 shadow-sm">
            아직 등록된 문서가 없습니다.
            <div className="mt-3">
              <Link href="/" className="font-semibold text-toss-blue">
                문서 올리러 가기 →
              </Link>
            </div>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {docs.map((d) => (
              <li key={d.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <a
                    href={`/d/${d.id}`}
                    target="_blank"
                    className="truncate font-semibold text-ink hover:text-toss-blue"
                  >
                    {d.name}
                  </a>
                  <Link
                    href={`/d/${d.id}/manage`}
                    className="shrink-0 rounded-lg bg-bg-2 px-3 py-1.5 text-xs font-medium text-ink-2"
                  >
                    관리
                  </Link>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                  <span>등록 {fmtDate(d.createdAt)}</span>
                  <span>만료 {dday(d.expiresAt, now)}</span>
                  <span>조회 {d.views}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공. `/docs`가 라우트 목록에 `ƒ (Dynamic)`으로 표시되어야 한다(force-dynamic).

- [ ] **Step 3: 커밋**

```bash
git add src/app/docs/page.tsx
git commit -m "$(cat <<'EOF'
feat: 문서 목록 SSR 페이지를 추가합니다

/docs에서 listDocs로 등록 문서를 최신순 표시합니다(force-dynamic, noindex).
각 행에 문서명(열기)·생성일·만료 D-day·조회수·관리 링크를 제공합니다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 최종 검증

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 테스트 그린**

Run: `npm run test`
Expected: 모든 테스트 PASS.

- [ ] **Step 2: 프로덕션 빌드**

Run: `npm run build`
Expected: 성공. 라우트 표에 `○ /`, `ƒ /docs` 표시.

- [ ] **Step 3: 로컬 수동 QA (선택)**

`.env.local`이 채워져 있으면 `npm run dev` 후:
- `/`에서 탭 2개 보이고 "업로드" 활성.
- 문서 업로드 → `/docs` 탭 클릭 → 목록에 방금 문서가 최신순 최상단에 표시.
- 행의 문서명 클릭 → `/d/{id}` 새 탭 열림. "관리" → `/d/{id}/manage`.
- 문서 없을 때 빈 상태 안내 표시.

> `.env.local`이 없으면 이 단계는 건너뛰고 배포 환경에서 확인한다(브레인스토밍 단계의 배포는 완료됨).

---

## 비범위 (이 플랜에 포함하지 않음 — 후속 작업)

- 목록 게이트(인증·권한). 이번엔 공개, `noindex`로 검색 노출만 차단.
- 페이지네이션·검색·정렬 토글.
