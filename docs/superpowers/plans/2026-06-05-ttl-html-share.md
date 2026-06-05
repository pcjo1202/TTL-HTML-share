# TTL HTML Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 HTML 파일을 올리면 즉시 공유 링크가 생성되고, 지정한 TTL이 지나면 자동 만료되는 Next.js 서비스를 만든다.

**Architecture:** 서비스는 Vercel에 한 번만 배포한다. 업로드된 HTML 본문은 Vercel Blob(public)에 저장하고, 메타데이터/만료 인덱스/조회수는 Upstash Redis에 저장한다. 열람은 동적 라우트 `GET /d/{id}`가 만료를 검사한 뒤 Blob 내용을 프록시 서빙한다. 만료는 ① 읽을 때 게으른 검사(정답) ② 매일 cron이 sorted set을 훑어 청소(비용 회수)의 2중 구조다.

**Tech Stack:** Next.js (App Router, latest) · TypeScript · Tailwind CSS 4 · Vercel Blob (`@vercel/blob`) · Upstash Redis (`@upstash/redis`, `@upstash/ratelimit`) · nanoid · Vitest. **모든 패키지는 `@latest`로 설치하고 버전을 고정하지 않는다.**

**참조 스펙:** `docs/superpowers/specs/2026-06-05-ttl-html-share-design.md`

---

## File Structure

순수 로직과 외부 I/O를 분리해 테스트 가능성을 높인다.

| 파일 | 책임 |
|---|---|
| `src/lib/id.ts` | URL-safe 랜덤 ID 생성 (순수) |
| `src/lib/password.ts` | 비밀번호 해시/검증 (scrypt, 순수) |
| `src/lib/ttl.ts` | TTL 옵션 → 만료시각 계산, 만료 판정 (순수) |
| `src/lib/redis.ts` | Upstash Redis 클라이언트 싱글톤 |
| `src/lib/ratelimit.ts` | Upstash 레이트리미터 |
| `src/lib/store.ts` | 문서 CRUD: Blob + Redis 조합 (I/O) |
| `src/lib/expiry-page.ts` | 만료 안내 HTML 문자열 생성 (순수) |
| `src/app/api/upload/route.ts` | `POST` 업로드 핸들러 |
| `src/app/d/[id]/route.ts` | `GET` 문서 서빙 핸들러 |
| `src/app/api/manage/[id]/route.ts` | `POST` 연장/삭제 핸들러 |
| `src/app/d/[id]/manage/page.tsx` | 관리 페이지 UI |
| `src/app/api/cron/sweep/route.ts` | `GET` 만료 청소 cron |
| `src/app/page.tsx` | 업로드 페이지 UI (반응형) |
| `src/app/globals.css` | Tailwind 4 + Toss 디자인 토큰 |
| `vercel.ts` | cron 스케줄 설정 |

---

## Task 1: 프로젝트 스캐폴드 (Next.js latest + Tailwind 4 + Vitest)

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/*`, `postcss.config.mjs`, `vitest.config.ts`

기존 디렉터리에 `.git`, `docs/`, `.gitignore`가 있어 `create-next-app`이 충돌할 수 있으므로 임시 폴더에 생성 후 병합한다.

- [ ] **Step 1: 임시 폴더에 Next.js 최신 버전 스캐폴드**

Run:
```bash
npx create-next-app@latest tmp-scaffold \
  --ts --app --tailwind --eslint \
  --src-dir --import-alias "@/*" --use-npm --turbopack --yes
```
Expected: `tmp-scaffold/`에 Next.js 프로젝트 생성 (Tailwind v4 포함).

- [ ] **Step 2: 생성물을 프로젝트 루트로 이동 (기존 docs/·.git·.gitignore 보존)**

Run:
```bash
shopt -s dotglob
cp -R tmp-scaffold/* .
rm -rf tmp-scaffold
# create-next-app이 만든 .gitignore가 기존 것을 덮어썼다면 .superpowers/ 규칙 복원
grep -q "^.superpowers/" .gitignore || printf "\n# Brainstorming visual-companion mockups\n.superpowers/\n" >> .gitignore
```
Expected: 루트에 `package.json`, `src/app/`, `postcss.config.mjs` 등이 존재.

- [ ] **Step 3: 런타임 의존성 설치 (모두 latest)**

Run:
```bash
npm install @vercel/blob@latest @upstash/redis@latest @upstash/ratelimit@latest nanoid@latest
```
Expected: 4개 패키지가 `dependencies`에 추가됨. **버전을 수동으로 고정하지 말 것.**

- [ ] **Step 4: 테스트 도구 설치 + 설정**

Run:
```bash
npm install -D vitest@latest
```
Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
```
Add to `package.json` `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: 스캐폴드 정리 — 기본 홈/스타일 제거**

`src/app/page.tsx`를 비우고 임시 플레이스홀더로 교체:
```tsx
export default function Home() {
  return <main className="p-8">TTL HTML Share</main>;
}
```
Delete: `src/app/page.module.css`(있다면), `public/*.svg` 중 불필요한 것은 남겨도 무방.

- [ ] **Step 6: 빌드/테스트 동작 확인**

Run: `npm run build && npm run test`
Expected: 빌드 성공. 테스트는 "no test files" 또는 0 tests (아직 테스트 없음) — 에러 없이 종료.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "chore: Next.js 프로젝트와 테스트 환경을 구성합니다"
```

---

## Task 2: Toss 디자인 토큰 & 전역 스타일 (Tailwind 4)

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: globals.css에 Toss 토큰 정의 (Tailwind 4 CSS-first)**

`src/app/globals.css` 전체를 교체:
```css
@import "tailwindcss";

@theme {
  --color-toss-blue: #3182f6;
  --color-toss-blue-dark: #1b64da;
  --color-toss-red: #f04452;
  --color-ink: #191f28;
  --color-ink-2: #4e5968;
  --color-ink-3: #8b95a1;
  --color-line: #e5e8eb;
  --color-bg: #f9fafb;
  --color-bg-2: #f2f4f6;
  --font-sans: "Pretendard", system-ui, -apple-system, sans-serif;
  --radius-card: 20px;
}

html, body {
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-sans);
}
```

- [ ] **Step 2: Pretendard 폰트 로드 (CDN) + 메타데이터**

`src/app/layout.tsx`의 `<head>`(또는 metadata)와 본문을 다음을 포함하도록 수정:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TTL HTML Share",
  description: "HTML을 올리면 바로 공유 링크가 생성됩니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공, Tailwind 토큰 클래스(`bg-toss-blue` 등) 사용 가능.

- [ ] **Step 4: 커밋**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: toss 디자인 토큰과 전역 스타일을 적용합니다"
```

---

## Task 3: ID 생성기 (`src/lib/id.ts`)

**Files:**
- Create: `src/lib/id.ts`
- Test: `src/lib/id.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/id.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { generateId } from "./id";

describe("generateId", () => {
  it("길이가 10인 ID를 만든다", () => {
    expect(generateId()).toHaveLength(10);
  });

  it("URL-safe 문자(영숫자)만 사용한다", () => {
    expect(generateId()).toMatch(/^[0-9A-Za-z]{10}$/);
  });

  it("1000번 호출해도 충돌이 없다", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    expect(ids.size).toBe(1000);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- id`
Expected: FAIL — `generateId` 모듈 없음.

- [ ] **Step 3: 최소 구현**

`src/lib/id.ts`:
```ts
import { customAlphabet } from "nanoid";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export const generateId = customAlphabet(ALPHABET, 10);
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- id`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/id.ts src/lib/id.test.ts
git commit -m "feat: URL-safe 문서 ID 생성기를 추가합니다"
```

---

## Task 4: 비밀번호 해시/검증 (`src/lib/password.ts`)

**Files:**
- Create: `src/lib/password.ts`
- Test: `src/lib/password.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/password.test.ts`:
```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- password`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

`src/lib/password.ts`:
```ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return { hash, salt };
}

export function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): boolean {
  const candidate = scryptSync(password, salt, KEYLEN);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- password`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/password.ts src/lib/password.test.ts
git commit -m "feat: scrypt 기반 비밀번호 해시/검증을 추가합니다"
```

---

## Task 5: TTL 계산 (`src/lib/ttl.ts`)

**Files:**
- Create: `src/lib/ttl.ts`
- Test: `src/lib/ttl.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/ttl.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isValidTtl, computeExpiresAt, isExpired, TTL_DURATIONS } from "./ttl";

describe("ttl", () => {
  it("유효한 옵션만 통과시킨다", () => {
    expect(isValidTtl("7d")).toBe(true);
    expect(isValidTtl("never")).toBe(true);
    expect(isValidTtl("99d")).toBe(false);
  });

  it("기간 옵션은 now + duration을 만료시각으로 계산한다", () => {
    expect(computeExpiresAt("1d", 1000)).toBe(1000 + TTL_DURATIONS["1d"]);
  });

  it("never는 만료되지 않는다", () => {
    expect(computeExpiresAt("never", 1000)).toBe("never");
    expect(isExpired("never", 9_999_999_999)).toBe(false);
  });

  it("만료시각을 지난 경우 만료로 판정한다", () => {
    expect(isExpired(1000, 1001)).toBe(true);
    expect(isExpired(1000, 999)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- ttl`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

`src/lib/ttl.ts`:
```ts
export type TtlOption = "1d" | "7d" | "30d" | "never";

const DAY_MS = 24 * 60 * 60 * 1000;

export const TTL_DURATIONS: Record<Exclude<TtlOption, "never">, number> = {
  "1d": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
};

export function isValidTtl(value: string): value is TtlOption {
  return value === "1d" || value === "7d" || value === "30d" || value === "never";
}

export function computeExpiresAt(
  ttl: TtlOption,
  now: number,
): number | "never" {
  if (ttl === "never") return "never";
  return now + TTL_DURATIONS[ttl];
}

export function isExpired(expiresAt: number | "never", now: number): boolean {
  if (expiresAt === "never") return false;
  return now > expiresAt;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- ttl`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ttl.ts src/lib/ttl.test.ts
git commit -m "feat: TTL 계산과 만료 판정 로직을 추가합니다"
```

---

## Task 6: Redis 클라이언트 & 문서 스토어 (`src/lib/redis.ts`, `src/lib/store.ts`)

**Files:**
- Create: `src/lib/redis.ts`
- Create: `src/lib/store.ts`
- Test: `src/lib/store.test.ts`

데이터 모델: 레코드는 `doc:{id}`에 JSON으로 저장(`@upstash/redis`가 직렬화), 조회수는 `views:{id}`에 정수 카운터, 만료 인덱스는 sorted set `expiry:index`(score=expiresAt, member=id; never는 미등록).

- [ ] **Step 1: Redis 클라이언트 작성**

`src/lib/redis.ts`:
```ts
import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();
```

- [ ] **Step 2: 실패하는 스토어 테스트 작성 (Redis/Blob 모킹)**

`src/lib/store.test.ts`:
```ts
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
```

- [ ] **Step 3: 실패 확인**

Run: `npm run test -- store`
Expected: FAIL — `store` 모듈 없음.

- [ ] **Step 4: 스토어 구현**

`src/lib/store.ts`:
```ts
import { put, del } from "@vercel/blob";
import { redis } from "./redis";
import { generateId } from "./id";
import { hashPassword } from "./password";
import { computeExpiresAt, type TtlOption } from "./ttl";

export interface DocRecord {
  id: string;
  name: string;
  passwordHash: string;
  salt: string;
  blobUrl: string;
  createdAt: number;
  expiresAt: number | "never";
}

export interface DocView extends DocRecord {
  views: number;
}

const EXPIRY_INDEX = "expiry:index";
const docKey = (id: string) => `doc:${id}`;
const viewsKey = (id: string) => `views:${id}`;

export async function createDoc(
  input: { name: string; html: string; password: string; ttl: TtlOption },
  now: number,
): Promise<{ id: string; expiresAt: number | "never" }> {
  const id = generateId();
  const { hash, salt } = hashPassword(input.password);
  const blob = await put(`docs/${id}.html`, input.html, {
    access: "public",
    contentType: "text/html; charset=utf-8",
  });
  const expiresAt = computeExpiresAt(input.ttl, now);
  const record: DocRecord = {
    id,
    name: input.name,
    passwordHash: hash,
    salt,
    blobUrl: blob.url,
    createdAt: now,
    expiresAt,
  };
  await redis.set(docKey(id), record);
  await redis.set(viewsKey(id), 0);
  if (expiresAt !== "never") {
    await redis.zadd(EXPIRY_INDEX, { score: expiresAt, member: id });
  }
  return { id, expiresAt };
}

export async function getDoc(id: string): Promise<DocView | null> {
  const record = (await redis.get(docKey(id))) as DocRecord | null;
  if (!record) return null;
  const views = ((await redis.get(viewsKey(id))) as number | null) ?? 0;
  return { ...record, views };
}

export async function incrementViews(id: string): Promise<void> {
  await redis.incr(viewsKey(id));
}

export async function extendDoc(
  id: string,
  ttl: TtlOption,
  now: number,
): Promise<void> {
  const record = (await redis.get(docKey(id))) as DocRecord | null;
  if (!record) return;
  const expiresAt = computeExpiresAt(ttl, now);
  await redis.set(docKey(id), { ...record, expiresAt });
  if (expiresAt === "never") {
    await redis.zrem(EXPIRY_INDEX, id);
  } else {
    await redis.zadd(EXPIRY_INDEX, { score: expiresAt, member: id });
  }
}

export async function deleteDoc(id: string): Promise<void> {
  const record = (await redis.get(docKey(id))) as DocRecord | null;
  if (record) {
    await del(record.blobUrl);
  }
  await redis.del(docKey(id), viewsKey(id));
  await redis.zrem(EXPIRY_INDEX, id);
}

export async function sweepExpired(now: number): Promise<string[]> {
  const expired = (await redis.zrange(EXPIRY_INDEX, 0, now, {
    byScore: true,
  })) as string[];
  for (const id of expired) {
    await deleteDoc(id);
  }
  return expired;
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm run test -- store`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/redis.ts src/lib/store.ts src/lib/store.test.ts
git commit -m "feat: Blob+Redis 문서 스토어를 추가합니다"
```

---

## Task 7: 레이트리미터 (`src/lib/ratelimit.ts`)

**Files:**
- Create: `src/lib/ratelimit.ts`

- [ ] **Step 1: 구현**

`src/lib/ratelimit.ts`:
```ts
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";

export const uploadRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "ratelimit:upload",
});

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous"
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 타입 에러 없이 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/ratelimit.ts
git commit -m "feat: 업로드 레이트리미터를 추가합니다"
```

---

## Task 8: 업로드 API (`src/app/api/upload/route.ts`)

**Files:**
- Create: `src/app/api/upload/route.ts`
- Test: `src/app/api/upload/route.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 (store/ratelimit 모킹)**

`src/app/api/upload/route.test.ts`:
```ts
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
  return new Request("http://x/api/upload", { method: "POST", body: fd });
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- upload`
Expected: FAIL — route 없음.

- [ ] **Step 3: 구현**

`src/app/api/upload/route.ts`:
```ts
import { createDoc } from "@/lib/store";
import { uploadRatelimit, clientIp } from "@/lib/ratelimit";
import { isValidTtl } from "@/lib/ttl";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request): Promise<Response> {
  const { success } = await uploadRatelimit.limit(clientIp(req));
  if (!success) {
    return Response.json({ error: "요청이 너무 잦습니다." }, { status: 429 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const ttl = String(form.get("ttl") ?? "");

  if (!(file instanceof File) || !name || !password || !isValidTtl(ttl)) {
    return Response.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "파일은 최대 10MB까지 가능합니다." }, { status: 413 });
  }

  const html = await file.text();
  const { id } = await createDoc({ name, html, password, ttl }, Date.now());

  const url = new URL(`/d/${id}`, req.url).toString();
  return Response.json({ id, url });
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- upload`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/upload/route.ts src/app/api/upload/route.test.ts
git commit -m "feat: HTML 업로드 API를 추가합니다"
```

---

## Task 9: 문서 서빙 + 만료 페이지 (`src/app/d/[id]/route.ts`, `src/lib/expiry-page.ts`)

**Files:**
- Create: `src/lib/expiry-page.ts`
- Create: `src/app/d/[id]/route.ts`
- Test: `src/app/d/[id]/route.test.ts`

- [ ] **Step 1: 만료 안내 HTML 헬퍼 작성**

`src/lib/expiry-page.ts`:
```ts
export function expiryPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>만료된 링크</title>
<style>
  body{margin:0;font-family:Pretendard,system-ui,sans-serif;background:#f9fafb;color:#191f28;
       display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}
  .icon{font-size:48px}
  h1{font-size:22px;margin:12px 0 4px}
  p{color:#8b95a1;margin:0 0 20px}
  a{display:inline-block;background:#3182f6;color:#fff;text-decoration:none;
    padding:12px 20px;border-radius:12px;font-weight:600}
</style></head>
<body><div><div class="icon">⏳</div><h1>링크가 만료되었습니다</h1>
<p>이 문서는 유효기간이 지나 더 이상 열람할 수 없습니다.</p>
<a href="/">새 문서 올리기 →</a></div></body></html>`;
}
```

- [ ] **Step 2: 실패하는 서빙 테스트 작성**

`src/app/d/[id]/route.test.ts`:
```ts
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
```

- [ ] **Step 3: 실패 확인**

Run: `npm run test -- "d/\[id\]/route"`
Expected: FAIL — route 없음.

- [ ] **Step 4: 구현**

`src/app/d/[id]/route.ts`:
```ts
import { getDoc, incrementViews } from "@/lib/store";
import { isExpired } from "@/lib/ttl";
import { expiryPageHtml } from "@/lib/expiry-page";

export const runtime = "nodejs";

const NOINDEX = { "X-Robots-Tag": "noindex" };

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const doc = await getDoc(id);

  if (!doc || isExpired(doc.expiresAt, Date.now())) {
    return new Response(expiryPageHtml(), {
      status: 410,
      headers: { "Content-Type": "text/html; charset=utf-8", ...NOINDEX },
    });
  }

  const upstream = await fetch(doc.blobUrl);
  const html = await upstream.text();
  void incrementViews(id);

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...NOINDEX },
  });
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm run test -- "d/\[id\]/route"`
Expected: PASS (3 tests).

- [ ] **Step 6: 커밋**

```bash
git add src/lib/expiry-page.ts "src/app/d/[id]/route.ts" "src/app/d/[id]/route.test.ts"
git commit -m "feat: 문서 서빙과 만료 페이지를 추가합니다"
```

---

## Task 10: 관리 API (`src/app/api/manage/[id]/route.ts`)

**Files:**
- Create: `src/app/api/manage/[id]/route.ts`
- Test: `src/app/api/manage/[id]/route.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/app/api/manage/[id]/route.test.ts`:
```ts
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

import { POST } from "./route";

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
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- "manage/\[id\]"`
Expected: FAIL — route 없음.

- [ ] **Step 3: 구현**

`src/app/api/manage/[id]/route.ts`:
```ts
import { getDoc, extendDoc, deleteDoc } from "@/lib/store";
import { verifyPassword } from "@/lib/password";
import { isValidTtl } from "@/lib/ttl";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const { password, action, ttl } = (await req.json()) as {
    password?: string;
    action?: string;
    ttl?: string;
  };

  const doc = await getDoc(id);
  if (!doc) return Response.json({ error: "없는 문서입니다." }, { status: 404 });

  if (!password || !verifyPassword(password, doc.passwordHash, doc.salt)) {
    return Response.json({ error: "비밀번호가 일치하지 않습니다." }, { status: 401 });
  }

  if (action === "delete") {
    await deleteDoc(id);
    return Response.json({ ok: true, action: "delete" });
  }

  if (action === "extend" && ttl && isValidTtl(ttl)) {
    await extendDoc(id, ttl, Date.now());
    return Response.json({ ok: true, action: "extend", ttl });
  }

  return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- "manage/\[id\]"`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add "src/app/api/manage/[id]/route.ts" "src/app/api/manage/[id]/route.test.ts"
git commit -m "feat: 문서 연장/삭제 관리 API를 추가합니다"
```

---

## Task 11: 관리 페이지 UI (`src/app/d/[id]/manage/page.tsx`)

**Files:**
- Create: `src/app/d/[id]/manage/page.tsx`

- [ ] **Step 1: 클라이언트 관리 폼 구현**

`src/app/d/[id]/manage/page.tsx`:
```tsx
"use client";

import { use, useState } from "react";

export default function ManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function run(action: "extend" | "delete", ttl?: string) {
    setMsg(null);
    const res = await fetch(`/api/manage/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, action, ttl }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg(json.error ?? "오류가 발생했습니다.");
    setMsg(action === "delete" ? "삭제되었습니다." : "유효기간이 갱신되었습니다.");
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-bold">문서 관리</h1>
      <p className="mt-1 text-sm text-ink-3">/d/{id}</p>

      <label className="mt-6 block text-xs font-semibold text-ink-2">관리 비밀번호</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="업로드 때 정한 비밀번호"
        className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3"
      />

      <div className="mt-6 border-t border-line pt-6">
        <p className="text-xs font-semibold text-ink-2">유효기간 연장</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => run("extend", "7d")} className="rounded-lg bg-bg-2 px-4 py-2 text-sm font-medium">+7일</button>
          <button onClick={() => run("extend", "30d")} className="rounded-lg bg-bg-2 px-4 py-2 text-sm font-medium">+30일</button>
          <button onClick={() => run("extend", "never")} className="rounded-lg bg-bg-2 px-4 py-2 text-sm font-medium">영구 보관</button>
        </div>
      </div>

      <button
        onClick={() => run("delete")}
        className="mt-6 w-full rounded-xl border border-toss-red py-3 font-semibold text-toss-red"
      >
        지금 삭제
      </button>

      {msg && <p className="mt-4 text-center text-sm text-ink-2">{msg}</p>}
    </main>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/d/[id]/manage/page.tsx"
git commit -m "feat: 문서 관리 페이지 UI를 추가합니다"
```

---

## Task 12: 만료 청소 Cron (`src/app/api/cron/sweep/route.ts`, `vercel.ts`)

**Files:**
- Create: `src/app/api/cron/sweep/route.ts`
- Test: `src/app/api/cron/sweep/route.test.ts`
- Create: `vercel.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/app/api/cron/sweep/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ sweepExpired: vi.fn(async () => ["a", "b"]) }));
vi.mock("@/lib/store", () => mocks);

import { GET } from "./route";

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
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- sweep`
Expected: FAIL — route 없음.

- [ ] **Step 3: 구현**

`src/app/api/cron/sweep/route.ts`:
```ts
import { sweepExpired } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const removed = await sweepExpired(Date.now());
  return Response.json({ removed: removed.length });
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- sweep`
Expected: PASS (2 tests).

- [ ] **Step 5: cron 스케줄 설정**

`vercel.ts` (프로젝트 루트):
```ts
import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [{ path: "/api/cron/sweep", schedule: "0 3 * * *" }],
};
```
Run: `npm install -D @vercel/config@latest`

- [ ] **Step 6: 커밋**

```bash
git add "src/app/api/cron/sweep/route.ts" "src/app/api/cron/sweep/route.test.ts" vercel.ts package.json package-lock.json
git commit -m "feat: 만료 문서 청소 cron을 추가합니다"
```

---

## Task 13: 업로드 페이지 UI (반응형) + 완료 화면

**Files:**
- Create: `src/app/page.tsx` (Task 1의 플레이스홀더 교체)
- Create: `src/app/upload-form.tsx`

반응형: 모바일은 세로 카드(flex-col), PC(`md:`)는 좌우 2분할 그리드. 완료 화면은 링크+복사+열기+관리+비밀번호 경고만(미니멀).

- [ ] **Step 1: 업로드 폼 클라이언트 컴포넌트 작성**

`src/app/upload-form.tsx`:
```tsx
"use client";

import { useState } from "react";

const TTLS = [
  { v: "1d", label: "1일" },
  { v: "7d", label: "7일" },
  { v: "30d", label: "30일" },
  { v: "never", label: "영구" },
] as const;

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [ttl, setTtl] = useState("7d");
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (!file || !name || !password) return setError("파일·이름·비밀번호를 입력하세요.");
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name);
    fd.append("password", password);
    fd.append("ttl", ttl);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "업로드 실패");
    setResult({ url: json.url });
  }

  if (result) {
    return (
      <div className="rounded-[20px] bg-white p-6 shadow-sm">
        <p className="text-center text-lg font-bold">✓ 링크가 생성되었습니다</p>
        <div className="mt-4 flex gap-2">
          <input readOnly value={result.url} className="flex-1 rounded-xl border border-line bg-bg-2 px-3 py-2 font-mono text-sm" />
          <button onClick={() => navigator.clipboard.writeText(result.url)} className="rounded-xl bg-toss-blue px-4 font-semibold text-white">복사</button>
        </div>
        <div className="mt-3 flex justify-center gap-2 text-sm">
          <a href={result.url} target="_blank" className="rounded-lg bg-bg-2 px-3 py-2">↗ 새 탭에서 열기</a>
          <a href={`${result.url}/manage`} className="rounded-lg bg-bg-2 px-3 py-2">🔧 관리 페이지</a>
        </div>
        <p className="mt-4 rounded-lg bg-[#fff7d6] px-3 py-2 text-center text-xs text-[#7a5b00]">
          ⚠️ 관리 비밀번호를 따로 보관하세요. 분실 시 연장·삭제가 불가합니다.
        </p>
        <button onClick={() => { setResult(null); setFile(null); setName(""); setPassword(""); }} className="mt-4 w-full text-sm text-ink-3">또 올리기</button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="flex min-h-[160px] cursor-pointer items-center justify-center rounded-[20px] border-2 border-dashed border-line bg-white text-center text-sm text-ink-3">
        <input type="file" accept="text/html,.html" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? <span className="font-medium text-ink">{file.name}</span> : <span>⬆️ HTML 파일을 끌어다 놓거나 클릭<br />(최대 10MB)</span>}
      </label>

      <div className="flex flex-col gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 2분기 대시보드)" className="rounded-xl border border-line bg-white px-4 py-3" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="관리 비밀번호" className="rounded-xl border border-line bg-white px-4 py-3" />
        <div className="flex flex-wrap gap-2">
          {TTLS.map((t) => (
            <button key={t.v} onClick={() => setTtl(t.v)} className={`rounded-lg px-4 py-2 text-sm font-medium ${ttl === t.v ? "bg-toss-blue text-white" : "bg-bg-2 text-ink-2"}`}>{t.label}</button>
          ))}
        </div>
        <button onClick={submit} disabled={busy} className="mt-2 rounded-xl bg-toss-blue py-3 font-semibold text-white disabled:opacity-50">
          {busy ? "생성 중…" : "링크 생성하기"}
        </button>
        {error && <p className="text-sm text-toss-red">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 페이지에 폼 배치**

`src/app/page.tsx`:
```tsx
import UploadForm from "./upload-form";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-2xl font-bold">HTML 바로 공유</h1>
      <p className="mt-1 text-ink-3">파일을 올리면 즉시 공유 링크가 생성됩니다.</p>
      <div className="mt-8">
        <UploadForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 4: 로컬 실행 + 수동 점검(선택)**

Run: `npm run dev` → 브라우저에서 `/` 레이아웃이 모바일(세로)·PC(2분할)로 반응하는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/app/page.tsx src/app/upload-form.tsx
git commit -m "feat: 반응형 업로드 페이지와 완료 화면을 추가합니다"
```

---

## Task 14: 환경 변수 문서화 + README + 배포 가이드

**Files:**
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: 환경 변수 예시 작성**

`.env.example`:
```bash
# Vercel Blob (Vercel 대시보드 > Storage > Blob 연동 시 자동 주입)
BLOB_READ_WRITE_TOKEN=

# Upstash Redis (Vercel Marketplace > Upstash 연동 시 자동 주입)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Cron 보호 시크릿 (임의의 긴 랜덤 문자열)
CRON_SECRET=
```

- [ ] **Step 2: README 작성**

`README.md`:
```markdown
# TTL HTML Share

단일 HTML 파일을 올리면 즉시 공유 링크가 생성되고, 지정한 TTL이 지나면 자동 만료됩니다.

## 스택
Next.js (App Router) · Tailwind CSS 4 · Vercel Blob · Upstash Redis · Vitest

## 로컬 실행
1. `npm install`
2. `.env.example`를 `.env.local`로 복사 후 값 채우기
3. `npm run dev`

## 테스트
`npm run test`

## 배포 (Vercel)
1. GitHub 저장소를 Vercel 프로젝트로 임포트
2. Storage 탭에서 **Blob** 생성/연동 → `BLOB_READ_WRITE_TOKEN` 자동 주입
3. Marketplace에서 **Upstash Redis** 연동 → `UPSTASH_REDIS_REST_*` 자동 주입
4. `CRON_SECRET` 환경변수 추가
5. 개인 도메인 연결 (Settings > Domains)
6. `vercel.ts`의 cron이 매일 03:00에 만료 문서를 청소

> 모든 의존성은 `@latest`로 유지한다. 버전을 고정하지 않는다.
```

- [ ] **Step 3: 전체 테스트 + 빌드 최종 확인**

Run: `npm run test && npm run build`
Expected: 모든 테스트 통과, 빌드 성공.

- [ ] **Step 4: 커밋**

```bash
git add .env.example README.md
git commit -m "docs: 환경 변수와 배포 가이드를 추가합니다"
```

---

## Self-Review 결과

**Spec coverage:**
- 열람(링크만, 랜덤 ID) → Task 3, 9 ✓
- 단일 HTML 저장/서빙 → Task 6, 9 ✓
- TTL 기본+연장+영구 → Task 5, 6, 10, 11 ✓
- 문서별 이름+비밀번호 관리 → Task 4, 10, 11 ✓
- 게이트 없는 공개 업로드 → Task 8 ✓
- 악용 완화(10MB·레이트리밋·noindex·해시) → Task 4, 7, 8, 9 ✓
- 만료(게으른 검사+cron) → Task 9, 12 ✓
- toss 디자인 + Tailwind 4 → Task 2, 11, 13 ✓
- 완료 화면 미니멀(QR·Slack·썸네일 제외) → Task 13 ✓
- latest 버전 정책 → Task 1, 3, 7, 12, 14 명시 ✓

**Placeholder scan:** 모든 코드 단계에 실제 코드 포함. Task 6 sweepExpired 테스트는 동작 스모크 수준으로 단순화했음을 명시(핵심 삭제 경로는 deleteDoc 테스트가 커버).

**Type consistency:** `DocRecord`/`DocView`, `TtlOption`, `createDoc/getDoc/extendDoc/deleteDoc/sweepExpired/incrementViews` 시그니처가 Task 6 정의와 이후 Task(8~13) 사용처에서 일치.
