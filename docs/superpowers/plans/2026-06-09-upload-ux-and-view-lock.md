# 업로드 파일 UX 개선 + 열람 잠금 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 업로드 폼에 파일 칩 UX(아이콘·교체·제거)를 추가하고, 문서 생성 시 별도 열람 비밀번호로 잠금을 걸어 잠긴 링크 접근 시 비밀번호 게이트를 거치게 한다.

**Architecture:** 잠금은 라우트 핸들러 내장 게이트 + 무상태 세션 쿠키 방식(접근 A). 쿠키 토큰 = `sha256(id:viewPasswordHash)`이며 `viewPasswordHash`는 Redis 전용 서버값이라 새 시크릿 env 없이 위조 불가. 본문 서빙은 기존 `d/[id]/route.ts`(Node Route Handler)에 GET 게이트 + POST 검증을 얹어 처리한다.

**Tech Stack:** Next.js App Router(Node 런타임) · Vercel Blob · Upstash Redis · `node:crypto`(scrypt/sha256) · Vitest

**Spec:** `docs/superpowers/specs/2026-06-09-upload-ux-and-view-lock-design.md`

---

## File Structure

생성/수정 파일과 책임:

- **Create** `src/lib/view-lock.ts` — 잠금 쿠키 토큰 생성·검증·쿠키명. 순수 함수.
- **Create** `src/lib/lock-page.ts` — 비밀번호 입력 게이트 HTML(자체완결, `expiry-page.ts` 패턴).
- **Modify** `src/lib/store.ts` — `DocRecord`에 `viewPasswordHash?`/`viewSalt?`, `createDoc` 입력에 `viewPassword?`, `DocSummary`에 `isLocked`.
- **Modify** `src/lib/ratelimit.ts` — `unlockRatelimit` 추가.
- **Modify** `src/app/d/[id]/route.ts` — GET 잠금 게이트, POST 비번 검증+쿠키 발급.
- **Modify** `src/app/api/upload/route.ts` — `lock`/`viewPassword` 파싱.
- **Modify** `src/app/upload-form.tsx` — 파일 칩(아이콘·교체·제거) + 잠금 토글/열람 비번 입력.
- **Modify** `src/app/docs/page.tsx` — 🔒 배지.
- **Create** `tests/lib/view-lock.test.ts`, **Modify** `tests/lib/store.test.ts`, `tests/app/d/[id]/route.test.ts`, `tests/app/api/upload/route.test.ts`.

---

## Task 1: 잠금 쿠키 모듈 (`view-lock.ts`)

**Files:**
- Create: `src/lib/view-lock.ts`
- Test: `tests/lib/view-lock.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/view-lock.test.ts`:

```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- view-lock`
Expected: FAIL — `Cannot find module '@/lib/view-lock'`

- [ ] **Step 3: 구현**

`src/lib/view-lock.ts`:

```ts
import { createHash, timingSafeEqual } from "node:crypto";

export function unlockCookieName(id: string): string {
  return `unlock_${id}`;
}

export function unlockToken({
  id,
  viewPasswordHash,
}: {
  id: string;
  viewPasswordHash: string;
}): string {
  return createHash("sha256").update(`${id}:${viewPasswordHash}`).digest("hex");
}

export function isValidUnlockCookie({
  cookieValue,
  id,
  viewPasswordHash,
}: {
  cookieValue: string | undefined;
  id: string;
  viewPasswordHash: string;
}): boolean {
  if (!cookieValue) return false;
  const expected = unlockToken({ id, viewPasswordHash });
  const candidate = Buffer.from(cookieValue);
  const target = Buffer.from(expected);
  if (candidate.length !== target.length) return false;
  return timingSafeEqual(candidate, target);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- view-lock`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/view-lock.ts tests/lib/view-lock.test.ts
git commit -m "$(printf 'feat: 열람 잠금 쿠키 토큰 모듈을 추가합니다\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: 데이터 모델 — 열람 비밀번호 저장 (`store.ts`)

**Files:**
- Modify: `src/lib/store.ts:7-15` (DocRecord), `:26-53` (createDoc), `:102-128` (DocSummary/listDocs)
- Test: `tests/lib/store.test.ts` (확장)

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/lib/store.test.ts`의 `describe("store", ...)` 안에 추가:

```ts
  it("viewPassword를 주면 열람 해시를 저장한다", async () => {
    const { id } = await createDoc(
      { name: "x", html: "<p/>", password: "pw", ttl: "never", viewPassword: "open123" },
      0,
    );
    const doc = await getDoc(id);
    expect(doc?.viewPasswordHash).toBeTruthy();
    expect(doc?.viewSalt).toBeTruthy();
  });

  it("viewPassword가 없으면 열람 해시가 없다", async () => {
    const { id } = await createDoc(
      { name: "x", html: "<p/>", password: "pw", ttl: "never" },
      0,
    );
    const doc = await getDoc(id);
    expect(doc?.viewPasswordHash).toBeUndefined();
  });

  it("listDocs는 isLocked를 노출하되 해시는 숨긴다", async () => {
    await createDoc({ name: "locked", html: "<p/>", password: "pw", ttl: "never", viewPassword: "open" }, 0);
    await createDoc({ name: "open", html: "<p/>", password: "pw", ttl: "never" }, 1);
    const list = await listDocs(1000);
    const locked = list.find((d) => d.name === "locked");
    const open = list.find((d) => d.name === "open");
    expect(locked?.isLocked).toBe(true);
    expect(open?.isLocked).toBe(false);
    expect(locked).not.toHaveProperty("viewPasswordHash");
    expect(locked).not.toHaveProperty("viewSalt");
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- store`
Expected: FAIL — `viewPassword` 타입 에러 또는 `isLocked` undefined

- [ ] **Step 3: 구현**

`src/lib/store.ts` — `DocRecord`에 필드 추가 (`:7-15`):

```ts
export interface DocRecord {
  id: string;
  name: string;
  passwordHash: string;
  salt: string;
  blobUrl: string;
  createdAt: number;
  expiresAt: number | "never";
  viewPasswordHash?: string;
  viewSalt?: string;
}
```

`createDoc` 입력 타입과 본문 (`:26-53`):

```ts
export async function createDoc(
  input: { name: string; html: string; password: string; ttl: TtlOption; viewPassword?: string },
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
  if (input.viewPassword) {
    const view = hashPassword(input.viewPassword);
    record.viewPasswordHash = view.hash;
    record.viewSalt = view.salt;
  }
  await redis.set(docKey(id), record);
  await redis.set(viewsKey(id), 0);
  await redis.zadd(DOCS_INDEX, { score: now, member: id });
  if (expiresAt !== "never") {
    await redis.zadd(EXPIRY_INDEX, { score: expiresAt, member: id });
  }
  return { id, expiresAt };
}
```

`DocSummary`에 `isLocked` 추가 (`:102-108`):

```ts
export interface DocSummary {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number | "never";
  views: number;
  isLocked: boolean;
}
```

`listDocs`의 `out.push` (`:119-125`)에 `isLocked` 추가:

```ts
    out.push({
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      views: viewCounts[i] ?? 0,
      isLocked: record.viewPasswordHash != null,
    });
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- store`
Expected: PASS (기존 + 신규 3건)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/store.ts tests/lib/store.test.ts
git commit -m "$(printf 'feat: 문서 레코드에 열람 비밀번호 해시를 추가합니다\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: 잠금 게이트 HTML (`lock-page.ts`)

**Files:**
- Create: `src/lib/lock-page.ts`
- Test: `tests/lib/lock-page.test.ts`

> `id`는 nanoid(URL-safe, HTML 특수문자 없음)이고 `error`는 서버가 정한 상수 문자열만 전달하므로 별도 이스케이프 없이 안전하다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/lock-page.test.ts`:

```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- lock-page`
Expected: FAIL — `Cannot find module '@/lib/lock-page'`

- [ ] **Step 3: 구현**

`src/lib/lock-page.ts`:

```ts
export function lockPageHtml({ id, error }: { id: string; error?: string }): string {
  const errorBlock = error ? `<p class="err">${error}</p>` : "";
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>잠긴 문서</title>
<style>
  body{margin:0;font-family:Pretendard,system-ui,sans-serif;background:#f9fafb;color:#191f28;
       display:flex;min-height:100vh;align-items:center;justify-content:center}
  form{background:#fff;padding:32px;border-radius:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);
       width:100%;max-width:360px;text-align:center;box-sizing:border-box}
  .icon{font-size:44px}
  h1{font-size:20px;margin:10px 0 4px}
  p{color:#8b95a1;margin:0 0 20px;font-size:14px}
  .err{color:#f04452}
  input{width:100%;box-sizing:border-box;border:1px solid #e5e8eb;border-radius:12px;
        padding:12px 14px;font-size:15px;margin-bottom:12px}
  button{width:100%;background:#3182f6;color:#fff;border:0;border-radius:12px;
         padding:13px;font-weight:600;font-size:15px;cursor:pointer}
</style></head>
<body>
<form method="POST" action="/d/${id}">
  <div class="icon">🔒</div>
  <h1>잠긴 문서입니다</h1>
  <p>열람하려면 비밀번호를 입력하세요.</p>
  ${errorBlock}
  <input type="password" name="password" placeholder="열람 비밀번호" autofocus required>
  <button type="submit">열람하기</button>
</form>
</body></html>`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- lock-page`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/lock-page.ts tests/lib/lock-page.test.ts
git commit -m "$(printf 'feat: 잠긴 문서 비밀번호 게이트 페이지를 추가합니다\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: 언락 레이트리밋 (`ratelimit.ts`)

**Files:**
- Modify: `src/lib/ratelimit.ts:4-8`

> 순수 인프라 설정이라 단위테스트 없음. Task 5 라우트 테스트에서 mock으로 사용된다.

- [ ] **Step 1: 구현**

`src/lib/ratelimit.ts`의 `uploadRatelimit` 정의 아래에 추가:

```ts
export const unlockRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "ratelimit:unlock",
});
```

- [ ] **Step 2: 빌드/타입 확인**

Run: `npm run lint`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/lib/ratelimit.ts
git commit -m "$(printf 'feat: 열람 잠금 해제 레이트리밋을 추가합니다\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: 서빙 라우트 — 게이트 + 비번 검증 (`d/[id]/route.ts`)

**Files:**
- Modify: `src/app/d/[id]/route.ts` (전체 재작성)
- Test: `tests/app/d/[id]/route.test.ts` (확장)

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/app/d/[id]/route.test.ts` 전체를 아래로 교체:

```ts
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
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- "d/\[id\]/route"`
Expected: FAIL — `POST` export 없음 / 게이트 미구현

- [ ] **Step 3: 구현**

`src/app/d/[id]/route.ts` 전체 교체:

```ts
import { getDoc, incrementViews, type DocView } from "@/lib/store";
import { verifyPassword } from "@/lib/password";
import { isExpired } from "@/lib/ttl";
import { expiryPageHtml } from "@/lib/expiry-page";
import { lockPageHtml } from "@/lib/lock-page";
import { unlockToken, unlockCookieName, isValidUnlockCookie } from "@/lib/view-lock";
import { unlockRatelimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

const HTML = "text/html; charset=utf-8";
const NOINDEX = { "X-Robots-Tag": "noindex" };

function htmlResponse(body: string, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(body, { status, headers: { "Content-Type": HTML, ...NOINDEX, ...extraHeaders } });
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

async function serveContent(doc: DocView, id: string): Promise<Response> {
  const upstream = await fetch(doc.blobUrl);
  const html = await upstream.text();
  void incrementViews(id);
  return htmlResponse(html, 200);
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const doc = await getDoc(id);

  if (!doc || isExpired(doc.expiresAt, Date.now())) {
    return htmlResponse(expiryPageHtml(), 410);
  }

  if (!doc.viewPasswordHash) {
    return serveContent(doc, id);
  }

  const cookieValue = readCookie(req, unlockCookieName(id));
  if (isValidUnlockCookie({ cookieValue, id, viewPasswordHash: doc.viewPasswordHash })) {
    return serveContent(doc, id);
  }

  return htmlResponse(lockPageHtml({ id }), 200);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const doc = await getDoc(id);

  if (!doc || isExpired(doc.expiresAt, Date.now())) {
    return htmlResponse(expiryPageHtml(), 410);
  }

  if (!doc.viewPasswordHash || !doc.viewSalt) {
    return htmlResponse("", 303, { Location: `/d/${id}` });
  }

  const { success } = await unlockRatelimit.limit(clientIp(req));
  if (!success) {
    return htmlResponse(lockPageHtml({ id, error: "요청이 너무 잦습니다. 잠시 후 다시 시도하세요." }), 429);
  }

  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  if (!verifyPassword(password, doc.viewPasswordHash, doc.viewSalt)) {
    return htmlResponse(lockPageHtml({ id, error: "비밀번호가 일치하지 않습니다." }), 401);
  }

  const token = unlockToken({ id, viewPasswordHash: doc.viewPasswordHash });
  const cookie = `${unlockCookieName(id)}=${token}; Path=/d/${id}; HttpOnly; SameSite=Lax; Secure`;
  return htmlResponse("", 303, { Location: `/d/${id}`, "Set-Cookie": cookie });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- "d/\[id\]/route"`
Expected: PASS (GET 5건 + POST 2건)

- [ ] **Step 5: 커밋**

```bash
git add src/app/d/[id]/route.ts tests/app/d/[id]/route.test.ts
git commit -m "$(printf 'feat: 잠긴 문서 비밀번호 게이트와 세션 쿠키를 구현합니다\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 6: 업로드 API — 잠금 파싱 (`api/upload/route.ts`)

**Files:**
- Modify: `src/app/api/upload/route.ts:15-29`
- Test: `tests/app/api/upload/route.test.ts` (확장)

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/app/api/upload/route.test.ts`의 상단 `vi.mock("@/lib/store", ...)`를 mock 변수 캡처로 바꾸고 케이스 추가:

```ts
const storeMock = vi.hoisted(() => ({ createDoc: vi.fn(async () => ({ id: "abc1234567", expiresAt: 1000 })) }));
vi.mock("@/lib/store", () => storeMock);
```

그리고 `describe` 안에 추가:

```ts
  it("잠금 켜고 열람 비번이 있으면 createDoc에 viewPassword를 전달한다", async () => {
    const res = await POST(
      formReq({ name: "x", password: "pw", ttl: "7d", lock: "on", viewPassword: "open123" }, { name: "a.html", content: "<h1/>" }),
    );
    expect(res.status).toBe(200);
    expect(storeMock.createDoc).toHaveBeenCalledWith(
      expect.objectContaining({ viewPassword: "open123" }),
      expect.any(Number),
    );
  });

  it("잠금 켰는데 열람 비번이 없으면 400을 반환한다", async () => {
    const res = await POST(
      formReq({ name: "x", password: "pw", ttl: "7d", lock: "on", viewPassword: "" }, { name: "a.html", content: "<h1/>" }),
    );
    expect(res.status).toBe(400);
  });
```

> 기존 `vi.mock("@/lib/store", () => ({ createDoc: ... }))` 줄은 위 `storeMock` 버전으로 대체한다(중복 선언 금지).

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- "api/upload/route"`
Expected: FAIL — viewPassword 미전달 / 400 미반환

- [ ] **Step 3: 구현**

`src/app/api/upload/route.ts`의 폼 파싱부(`:15-29`)를 교체:

```ts
  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const ttl = String(form.get("ttl") ?? "");
  const isLocked = String(form.get("lock") ?? "") === "on";
  const viewPassword = String(form.get("viewPassword") ?? "");

  if (!(file instanceof File) || !name || !password || !isValidTtl(ttl)) {
    return Response.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
  }
  if (isLocked && !viewPassword) {
    return Response.json({ error: "열람 비밀번호를 입력하세요." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "파일은 최대 10MB까지 가능합니다." }, { status: 413 });
  }

  const html = await file.text();
  const { id } = await createDoc(
    { name, html, password, ttl, viewPassword: isLocked ? viewPassword : undefined },
    Date.now(),
  );
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- "api/upload/route"`
Expected: PASS (기존 3건 + 신규 2건)

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/upload/route.ts tests/app/api/upload/route.test.ts
git commit -m "$(printf 'feat: 업로드 API에서 열람 잠금 설정을 처리합니다\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 7: 업로드 폼 — 파일 칩 + 잠금 토글 (`upload-form.tsx`)

**Files:**
- Modify: `src/app/upload-form.tsx` (전체 재작성)

> 상호작용 UI라 단위테스트 생략. 파일 검증은 기존 `htmlFileError` 재사용. 빌드+수동 확인으로 검증.

- [ ] **Step 1: 구현**

`src/app/upload-form.tsx` 전체 교체:

```tsx
"use client";

import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { clientErrorMessage } from "@/lib/error-message";
import { htmlFileError, MAX_UPLOAD_BYTES } from "@/lib/upload-file";

const TTLS = [
  { v: "1d", label: "1일" },
  { v: "7d", label: "7일" },
  { v: "30d", label: "30일" },
  { v: "never", label: "영구" },
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
}

export default function UploadForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [ttl, setTtl] = useState("7d");
  const [isLocked, setIsLocked] = useState(false);
  const [viewPassword, setViewPassword] = useState("");
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  function pickFile(candidate: File | null) {
    if (!candidate) {
      setFile(null);
      return;
    }
    const error = htmlFileError(candidate, MAX_UPLOAD_BYTES);
    if (error) {
      toast.error(error);
      return;
    }
    setFile(candidate);
  }

  function clearFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit() {
    if (!file || !name || !password) {
      toast.error("파일·이름·비밀번호를 입력하세요.");
      return;
    }
    if (isLocked && !viewPassword) {
      toast.error("열람 비밀번호를 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name);
      fd.append("password", password);
      fd.append("ttl", ttl);
      if (isLocked) {
        fd.append("lock", "on");
        fd.append("viewPassword", viewPassword);
      }
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(clientErrorMessage({ status: res.status, serverMessage: json?.error }));
        return;
      }
      setResult({ url: json.url });
    } catch {
      toast.error(clientErrorMessage({ networkError: true }));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success("링크를 복사했습니다");
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    pickFile(event.dataTransfer.files[0] ?? null);
  }

  if (result) {
    return (
      <div className="rounded-[20px] bg-white p-6 shadow-sm">
        <p className="text-center text-lg font-bold">✓ 링크가 생성되었습니다</p>
        <div className="mt-4 flex gap-2">
          <input readOnly value={result.url} className="flex-1 rounded-xl border border-line bg-bg-2 px-3 py-2 font-mono text-sm" />
          <button onClick={() => copyLink(result.url)} className="rounded-xl bg-toss-blue px-4 font-semibold text-white">복사</button>
        </div>
        <div className="mt-3 flex justify-center gap-2 text-sm">
          <a href={result.url} target="_blank" rel="noreferrer" className="rounded-lg bg-bg-2 px-3 py-2">↗ 새 탭에서 열기</a>
          <a href={`${result.url}/manage`} className="rounded-lg bg-bg-2 px-3 py-2">🔧 관리 페이지</a>
        </div>
        <p className="mt-4 rounded-lg bg-[#fff7d6] px-3 py-2 text-center text-xs text-[#7a5b00]">
          ⚠️ 관리 비밀번호를 따로 보관하세요. 분실 시 연장·삭제가 불가합니다.
        </p>
        <button onClick={() => { setResult(null); clearFile(); setName(""); setPassword(""); setIsLocked(false); setViewPassword(""); }} className="mt-4 w-full text-sm text-ink-3">또 올리기</button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <input ref={fileInputRef} type="file" accept="text/html,.html" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />

      {file ? (
        <div className="flex min-h-[160px] flex-col justify-center gap-3 rounded-[20px] border border-line bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📄</span>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{file.name}</p>
              <p className="text-xs text-ink-3">{formatBytes(file.size)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => fileInputRef.current?.click()} className="rounded-lg bg-bg-2 px-3 py-1.5 text-sm font-medium text-ink-2">교체</button>
            <button onClick={clearFile} className="rounded-lg bg-bg-2 px-3 py-1.5 text-sm font-medium text-toss-red">제거</button>
          </div>
        </div>
      ) : (
        <label
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex min-h-[160px] cursor-pointer items-center justify-center rounded-[20px] border-2 border-dashed text-center text-sm text-ink-3 ${
            isDragging ? "border-toss-blue bg-[#eef4ff]" : "border-line bg-white"
          }`}
        >
          <span>⬆️ HTML 파일을 끌어다 놓거나 클릭<br />(최대 10MB)</span>
        </label>
      )}

      <div className="flex flex-col gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 2분기 대시보드)" className="rounded-xl border border-line bg-white px-4 py-3" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="관리 비밀번호" className="rounded-xl border border-line bg-white px-4 py-3" />
        <div className="flex flex-wrap gap-2">
          {TTLS.map((t) => (
            <button key={t.v} onClick={() => setTtl(t.v)} className={`rounded-lg px-4 py-2 text-sm font-medium ${ttl === t.v ? "bg-toss-blue text-white" : "bg-bg-2 text-ink-2"}`}>{t.label}</button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={isLocked} onChange={(e) => setIsLocked(e.target.checked)} />
          🔒 열람 잠금 (비밀번호 입력 후에만 열람)
        </label>
        {isLocked && (
          <input type="password" value={viewPassword} onChange={(e) => setViewPassword(e.target.value)} placeholder="열람 비밀번호 (관리 비밀번호와 별개)" className="rounded-xl border border-line bg-white px-4 py-3" />
        )}

        <button onClick={submit} disabled={busy} className="mt-2 rounded-xl bg-toss-blue py-3 font-semibold text-white disabled:opacity-50">
          {busy ? "생성 중…" : "링크 생성하기"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드/린트 확인**

Run: `npm run lint && npm run build`
Expected: "Compiled successfully" (Upstash env 경고는 무해)

- [ ] **Step 3: 수동 확인**

Run: `npm run dev` 후 `http://localhost:3000`
- 파일 선택 → 📄 칩에 파일명·용량 표시.
- `교체` 클릭 → 파일 피커 다시 열림. `제거` 클릭 → 드롭존으로 복귀.
- `🔒 열람 잠금` 체크 → 열람 비밀번호 입력칸 노출. 체크하고 비번 비우고 제출 → "열람 비밀번호를 입력하세요." toast.

- [ ] **Step 4: 커밋**

```bash
git add src/app/upload-form.tsx
git commit -m "$(printf 'feat: 업로드 폼에 파일 칩과 열람 잠금 옵션을 추가합니다\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 8: 문서 목록 — 🔒 배지 (`docs/page.tsx`)

**Files:**
- Modify: `src/app/docs/page.tsx:56-71`

> 정적 SSR. 단위테스트 없이 빌드+수동 확인.

- [ ] **Step 1: 구현**

`src/app/docs/page.tsx`의 문서명 `<a>` 부분(`:57-64`)을 잠금 배지 포함으로 교체:

```tsx
                  <a
                    href={`/d/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-1.5 truncate font-semibold text-ink hover:text-toss-blue"
                  >
                    {d.isLocked && <span title="열람 잠금" aria-label="열람 잠금">🔒</span>}
                    <span className="truncate">{d.name}</span>
                  </a>
```

- [ ] **Step 2: 빌드/린트 확인**

Run: `npm run lint && npm run build`
Expected: "Compiled successfully"

- [ ] **Step 3: 수동 확인**

`npm run dev` 후 잠금 문서를 하나 업로드하고 `/docs` 접속 → 잠긴 문서명 앞에 🔒 표시, 잠금 없는 문서엔 미표시.

- [ ] **Step 4: 커밋**

```bash
git add src/app/docs/page.tsx
git commit -m "$(printf 'feat: 문서 목록에 열람 잠금 배지를 표시합니다\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## 최종 검증

- [ ] **전체 테스트**

Run: `npm run test`
Expected: 전체 PASS

- [ ] **빌드**

Run: `npm run build`
Expected: "Compiled successfully" + 라우트 표

- [ ] **E2E 수동 시나리오**
  1. `🔒 열람 잠금` 체크 + 열람 비번 `open123`로 업로드 → 링크 생성.
  2. 시크릿 창에서 링크 열기 → 게이트 표시. 틀린 비번 → 에러. `open123` → 본문 표시.
  3. 같은 창에서 새로고침 → 재입력 없이 열림(세션 쿠키). 창 닫았다 다시 열기 → 다시 게이트.
  4. `/docs` → 해당 문서에 🔒.
  5. 잠금 없이 업로드한 문서는 게이트 없이 바로 열림.
