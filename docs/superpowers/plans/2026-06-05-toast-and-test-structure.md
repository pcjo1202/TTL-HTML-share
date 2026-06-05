# Toast UI + 테스트 구조 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실패/성공 피드백을 sonner 기반 Toast로 통일(에러 상황별 메시지)하고, co-located 테스트를 최상위 `tests/` 디렉터리로 분리한다.

**Architecture:** (B) 먼저 테스트 8개를 `src/`를 미러링한 `tests/`로 옮기고 `@/` 별칭으로 import를 고친 뒤 vitest include를 변경한다. (A) 에러 메시지 매핑을 순수 함수 `clientErrorMessage`로 분리(TDD)하고, sonner `<Toaster>`를 레이아웃에 마운트한 다음 업로드 폼·관리 페이지의 인라인 메시지를 `toast.error/success`로 교체한다. 두 Part는 독립적이다.

**Tech Stack:** Next.js (App Router) · TypeScript · Tailwind 4 · **sonner** · Vitest. 모든 패키지는 `@latest`로 설치, 버전 고정 금지.

**참조 스펙:** `docs/superpowers/specs/2026-06-05-toast-and-test-structure-design.md`

---

## File Structure

| 파일 | 변경 | 책임 |
|---|---|---|
| `tests/lib/*.test.ts` (4) | 이동 | 순수 라이브러리 단위 테스트 |
| `tests/app/**/route.test.ts` (4) | 이동 | API 라우트 핸들러 테스트 |
| `tests/lib/error-message.test.ts` | 신규 | `clientErrorMessage` 단위 테스트 |
| `vitest.config.ts` | 수정 | include 패턴 `tests/**` |
| `src/lib/error-message.ts` | 신규 | 에러 상황 → 사용자 메시지 매핑(순수) |
| `src/app/layout.tsx` | 수정 | `<Toaster>` 마운트 |
| `src/app/upload-form.tsx` | 수정 | 인라인 에러 제거 → toast |
| `src/app/d/[id]/manage/page.tsx` | 수정 | 인라인 메시지 제거 → toast |

---

## Task 1: 테스트를 최상위 `tests/`로 이전 (Part B)

**Files:**
- Move: 8개 `*.test.ts` (아래)
- Modify: `vitest.config.ts`

- [ ] **Step 1: 테스트 파일을 git mv로 이동**

Run:
```bash
mkdir -p tests/lib "tests/app/api/upload" "tests/app/api/manage/[id]" "tests/app/api/cron/sweep" "tests/app/d/[id]"
git mv src/lib/id.test.ts tests/lib/id.test.ts
git mv src/lib/password.test.ts tests/lib/password.test.ts
git mv src/lib/ttl.test.ts tests/lib/ttl.test.ts
git mv src/lib/store.test.ts tests/lib/store.test.ts
git mv src/app/api/upload/route.test.ts "tests/app/api/upload/route.test.ts"
git mv "src/app/api/manage/[id]/route.test.ts" "tests/app/api/manage/[id]/route.test.ts"
git mv src/app/api/cron/sweep/route.test.ts tests/app/api/cron/sweep/route.test.ts
git mv "src/app/d/[id]/route.test.ts" "tests/app/d/[id]/route.test.ts"
```
Expected: `src/`에 `*.test.ts`가 0개. 확인: `find src -name '*.test.ts'` → 빈 출력.

- [ ] **Step 2: 이동한 테스트의 상대 import를 `@/` 별칭으로 수정**

각 파일에서 아래 정확한 치환을 수행한다 (다른 부분은 변경하지 않는다):

`tests/lib/id.test.ts`: `from "./id"` → `from "@/lib/id"`
`tests/lib/password.test.ts`: `from "./password"` → `from "@/lib/password"`
`tests/lib/ttl.test.ts`: `from "./ttl"` → `from "@/lib/ttl"`
`tests/lib/store.test.ts`: `vi.mock("./redis"` → `vi.mock("@/lib/redis"` **그리고** `from "./store"` → `from "@/lib/store"` (참고: `vi.mock("@vercel/blob", ...)`는 그대로 둔다)
`tests/app/api/upload/route.test.ts`: `from "./route"` → `from "@/app/api/upload/route"`
`tests/app/api/manage/[id]/route.test.ts`: `from "./route"` → `from "@/app/api/manage/[id]/route"`
`tests/app/api/cron/sweep/route.test.ts`: `from "./route"` → `from "@/app/api/cron/sweep/route"`
`tests/app/d/[id]/route.test.ts`: `from "./route"` → `from "@/app/d/[id]/route"`

(route 테스트들이 이미 사용하는 `vi.mock("@/lib/store")`, `vi.mock("@/lib/ratelimit")`, `vi.mock("@/lib/password")`는 변경하지 않는다.)

- [ ] **Step 3: vitest include 패턴 변경**

`vitest.config.ts`에서:
```ts
    include: ["src/**/*.test.ts"],
```
를
```ts
    include: ["tests/**/*.test.ts"],
```
로 수정. (`resolve.alias`의 `@` → `./src`는 그대로 둔다.)

- [ ] **Step 4: 전체 테스트가 그대로 통과하는지 확인**

Run: `npm run test`
Expected: 8 test files, **26 tests passed** (이동 전과 동일). 실패하면 import 치환을 점검한다.

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 성공 (Next.js는 `tests/`를 컴파일 대상에서 제외).

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "refactor: 테스트를 최상위 tests 디렉터리로 분리합니다"
```

---

## Task 2: 에러 메시지 매핑 순수 함수 (Part A-2 + B-4)

**Files:**
- Create: `src/lib/error-message.ts`
- Test: `tests/lib/error-message.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/error-message.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { clientErrorMessage } from "@/lib/error-message";

describe("clientErrorMessage", () => {
  it("네트워크 에러를 최우선으로 처리한다", () => {
    expect(
      clientErrorMessage({ networkError: true, status: 500, serverMessage: "x" }),
    ).toBe("네트워크 연결을 확인해 주세요.");
  });

  it("서버 메시지가 있으면 그대로 사용한다", () => {
    expect(
      clientErrorMessage({ status: 400, serverMessage: "필수 항목이 누락되었습니다." }),
    ).toBe("필수 항목이 누락되었습니다.");
  });

  it("서버 메시지가 없으면 상태코드로 매핑한다", () => {
    expect(clientErrorMessage({ status: 413 })).toBe("파일이 너무 큽니다. (최대 10MB)");
    expect(clientErrorMessage({ status: 429 })).toBe("요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.");
    expect(clientErrorMessage({ status: 503 })).toBe("서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
  });

  it("그 외에는 기본 메시지를 반환한다", () => {
    expect(clientErrorMessage({ status: 418 })).toBe("요청을 처리하지 못했어요.");
    expect(clientErrorMessage({})).toBe("요청을 처리하지 못했어요.");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- error-message`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/lib/error-message.ts`:
```ts
export function clientErrorMessage(input: {
  networkError?: boolean;
  status?: number;
  serverMessage?: string;
}): string {
  if (input.networkError) return "네트워크 연결을 확인해 주세요.";
  if (input.serverMessage) return input.serverMessage;
  const status = input.status ?? 0;
  if (status === 413) return "파일이 너무 큽니다. (최대 10MB)";
  if (status === 429) return "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.";
  if (status >= 500) return "서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.";
  return "요청을 처리하지 못했어요.";
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- error-message`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/error-message.ts tests/lib/error-message.test.ts
git commit -m "feat: 에러 상황별 사용자 메시지 매핑을 추가합니다"
```

---

## Task 3: sonner 설치 + Toaster 마운트 (Part A-1)

**Files:**
- Modify: `package.json` (sonner 추가)
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: sonner 설치 (latest)**

Run:
```bash
npm install sonner@latest
```
Expected: `dependencies`에 `sonner` 추가 (버전 고정 금지).

- [ ] **Step 2: layout.tsx에 Toaster 마운트**

`src/app/layout.tsx`를 다음으로 교체:
```tsx
import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "TTL HTML Share",
  description: "HTML을 올리면 바로 공유 링크가 생성됩니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: 빌드 + 테스트 확인**

Run: `npm run build && npm run test`
Expected: 빌드 성공, 테스트 30개 통과(26 + error-message 4).

- [ ] **Step 4: 커밋**

```bash
git add src/app/layout.tsx package.json package-lock.json
git commit -m "feat: sonner Toaster를 레이아웃에 마운트합니다"
```

---

## Task 4: 업로드 폼 Toast 전환 (Part A-3)

**Files:**
- Modify: `src/app/upload-form.tsx`

- [ ] **Step 1: upload-form.tsx 전체 교체**

`src/app/upload-form.tsx`를 다음으로 교체 (인라인 `error` 제거, `try/catch`, 복사 성공 토스트 추가):
```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { clientErrorMessage } from "@/lib/error-message";

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
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!file || !name || !password) {
      toast.error("파일·이름·비밀번호를 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name);
      fd.append("password", password);
      fd.append("ttl", ttl);
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

  if (result) {
    return (
      <div className="rounded-[20px] bg-white p-6 shadow-sm">
        <p className="text-center text-lg font-bold">✓ 링크가 생성되었습니다</p>
        <div className="mt-4 flex gap-2">
          <input readOnly value={result.url} className="flex-1 rounded-xl border border-line bg-bg-2 px-3 py-2 font-mono text-sm" />
          <button onClick={() => copyLink(result.url)} className="rounded-xl bg-toss-blue px-4 font-semibold text-white">복사</button>
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
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 + 테스트 확인**

Run: `npm run build && npm run test`
Expected: 빌드 성공(타입 에러 없음), 테스트 30개 통과(변동 없음).

- [ ] **Step 3: 커밋**

```bash
git add src/app/upload-form.tsx
git commit -m "feat: 업로드 폼 피드백을 Toast로 전환합니다"
```

---

## Task 5: 관리 페이지 Toast 전환 (Part A-4)

**Files:**
- Modify: `src/app/d/[id]/manage/page.tsx`

- [ ] **Step 1: manage/page.tsx 전체 교체**

`src/app/d/[id]/manage/page.tsx`를 다음으로 교체 (`msg` 제거, `try/catch`, 성공/실패 토스트):
```tsx
"use client";

import { use, useState } from "react";
import { toast } from "sonner";
import { clientErrorMessage } from "@/lib/error-message";

export default function ManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [password, setPassword] = useState("");

  async function run(action: "extend" | "delete", ttl?: string) {
    try {
      const res = await fetch(`/api/manage/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, action, ttl }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(clientErrorMessage({ status: res.status, serverMessage: json?.error }));
        return;
      }
      toast.success(action === "delete" ? "삭제되었습니다" : "유효기간이 연장되었습니다");
    } catch {
      toast.error(clientErrorMessage({ networkError: true }));
    }
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
    </main>
  );
}
```

- [ ] **Step 2: 빌드 + 테스트 확인**

Run: `npm run build && npm run test`
Expected: 빌드 성공, 테스트 30개 통과.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/d/[id]/manage/page.tsx"
git commit -m "feat: 관리 페이지 피드백을 Toast로 전환합니다"
```

---

## Task 6: 최종 검증 + 수동 QA

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트 + 빌드 + 타입체크**

Run:
```bash
npm run test
npm run build
npx tsc --noEmit
```
Expected: 테스트 8개 파일 30개 통과(이동된 26 + error-message 4), 빌드 성공(라우트 `/`, `/d/[id]`, `/d/[id]/manage`, `/api/*` 생성), tsc 에러 없음.

- [ ] **Step 2: 소스 트리에 테스트가 남지 않았는지 확인**

Run: `find src -name '*.test.ts'`
Expected: 빈 출력.

- [ ] **Step 3: 수동 QA (로컬, 선택)**

`.env.local`에 Blob/Redis 값이 있을 때:
```bash
npm run dev
```
브라우저에서 확인:
- 업로드 폼에서 파일/이름/비번 비우고 "링크 생성" → 빨강 에러 토스트(상단 중앙).
- 성공 업로드 → 결과 화면 + 복사 버튼 클릭 시 초록 "링크를 복사했습니다" 토스트.
- 관리 페이지에서 틀린 비번으로 삭제 → 빨강 에러 토스트, 올바른 연장 → 초록 "유효기간이 연장되었습니다".
- 네트워크 차단(개발자도구 offline) 후 제출 → "네트워크 연결을 확인해 주세요." 토스트.

> env가 없으면 업로드는 서버 오류 토스트가 뜨는 것으로 토스트 경로 자체는 확인 가능.

---

## Self-Review 결과

**Spec coverage:**
- A-1 sonner 설치/Toaster 마운트 → Task 3 ✓
- A-2 clientErrorMessage 순수 함수 → Task 2 ✓
- A-3 업로드 폼 toast(검증/네트워크/!ok/복사성공) → Task 4 ✓
- A-4 관리 페이지 toast(연장/삭제/에러) → Task 5 ✓
- B-1 테스트 이동 → Task 1 ✓
- B-2 import 별칭 수정 → Task 1 Step 2 ✓
- B-3 vitest include 변경 → Task 1 Step 3 ✓
- B-4 error-message 신규 테스트 → Task 2 ✓
- 테스트 전략(순수 단위 + 수동 QA) → Task 6 ✓
- 커밋 분리(Part B → Part A) → Task 1~5 별도 커밋 ✓

**Placeholder scan:** 모든 코드 단계에 실제 코드 포함. UI 작업(Task 4/5)은 단위 테스트 대신 빌드+수동 QA로 검증함을 명시(jsdom+RTL 미도입은 YAGNI).

**Type consistency:** `clientErrorMessage({ networkError?, status?, serverMessage? })` 시그니처가 Task 2 정의와 Task 4/5 호출처에서 일치. `toast.error/success`(sonner) 사용 일관. 업로드 폼의 `result`/`busy` state 및 복사 핸들러 이름(`copyLink`) 일관.
