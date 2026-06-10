# 관리 드로어 · TTL range · 열람 잠금 토글 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문서 목록 관리 UI를 오른쪽 push 드로어로 바꾸고, 업로드 화면에 TTL 직접 설정 슬라이더와 둥근 열람 잠금 토글을 도입한다.

**Architecture:** 백엔드 TTL 파싱을 임의 일수(`${N}d`)까지 일반화하고(라우트·store 시그니처는 불변), 업로드 폼에 프리셋+슬라이더와 Radix Switch 토글을 추가한다. 문서 목록은 드로어 상태를 React Context로 페이지 레벨에 올려 콘텐츠를 왼쪽으로 미는 단일 드로어(데스크탑)/바텀시트(모바일)로 재구성한다.

**Tech Stack:** Next.js App Router · React · Tailwind CSS 4 · Radix UI(Dialog/Switch) · Vitest

스펙: `docs/superpowers/specs/2026-06-10-ui-drawer-ttl-range-lock-toggle-design.md`

---

## File Structure

신규:
- `src/app/docs/manage-drawer-context.tsx` — 드로어 열림 상태 Context + Provider + `useManageDrawer` 훅.
- `src/app/docs/docs-shell.tsx` — Provider 래핑 + push 레이아웃 + 단일 드로어 렌더.
- `src/app/docs/manage-drawer.tsx` — Radix Dialog 기반 드로어(데스크탑 우측 패널 / 모바일 바텀시트).

수정:
- `src/lib/ttl.ts` — `parseTtl` 도입, 임의 일수 일반화.
- `tests/lib/ttl.test.ts` — 경계값 테스트 갱신.
- `src/app/globals.css` — 스프링 keyframe, drawer keyframe, `--drawer-width`.
- `src/app/upload-form.tsx` — TTL "직접 설정" 슬라이더 + Switch 토글.
- `src/app/docs/page.tsx` — 가운데 컬럼을 `DocsShell`로 이동.
- `src/app/docs/manage-button.tsx` — Context `open()` 호출 트리거로 축소.

의존성: `@radix-ui/react-switch@latest` 추가.

---

## Task 1: TTL 파싱을 임의 일수로 일반화 (TDD)

**Files:**
- Modify: `src/lib/ttl.ts`
- Test: `tests/lib/ttl.test.ts`

- [ ] **Step 1: 테스트를 경계값 중심으로 교체**

`tests/lib/ttl.test.ts` 전체를 아래로 교체:

```ts
import { describe, it, expect } from "vitest";
import { isValidTtl, parseTtl, computeExpiresAt, isExpired, MAX_TTL_DAYS } from "@/lib/ttl";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("ttl", () => {
  it("프리셋과 범위 내 임의 일수를 통과시킨다", () => {
    expect(isValidTtl("7d")).toBe(true);
    expect(isValidTtl("never")).toBe(true);
    expect(isValidTtl("99d")).toBe(true);
    expect(isValidTtl("365d")).toBe(true);
  });

  it("범위 밖·형식 오류는 거절한다", () => {
    expect(isValidTtl("0d")).toBe(false);
    expect(isValidTtl("366d")).toBe(false);
    expect(isValidTtl("-1d")).toBe(false);
    expect(isValidTtl("abc")).toBe(false);
    expect(isValidTtl("7")).toBe(false);
  });

  it("parseTtl은 일수/never/null을 반환한다", () => {
    expect(parseTtl("14d")).toBe(14);
    expect(parseTtl("never")).toBe("never");
    expect(parseTtl("999d")).toBe(null);
    expect(MAX_TTL_DAYS).toBe(365);
  });

  it("기간 옵션은 now + days*DAY_MS를 만료시각으로 계산한다", () => {
    expect(computeExpiresAt("1d", 1000)).toBe(1000 + DAY_MS);
    expect(computeExpiresAt("14d", 0)).toBe(14 * DAY_MS);
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

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- ttl`
Expected: FAIL — `parseTtl`·`MAX_TTL_DAYS` export 없음, `isValidTtl("99d")` 가 false.

- [ ] **Step 3: `ttl.ts` 일반화 구현**

`src/lib/ttl.ts` 전체를 아래로 교체:

```ts
export type TtlOption = "never" | `${number}d`;

const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_TTL_DAYS = 365;

export function parseTtl(value: string): number | "never" | null {
  if (value === "never") return "never";
  const match = /^(\d+)d$/.exec(value);
  if (!match) return null;
  const days = Number(match[1]);
  if (days < 1 || days > MAX_TTL_DAYS) return null;
  return days;
}

export function isValidTtl(value: string): value is TtlOption {
  return parseTtl(value) !== null;
}

export function computeExpiresAt(ttl: TtlOption, now: number): number | "never" {
  const parsed = parseTtl(ttl);
  if (parsed === "never") return "never";
  if (parsed === null) throw new Error(`잘못된 TTL 값입니다: ${ttl}`);
  return now + parsed * DAY_MS;
}

export function isExpired(expiresAt: number | "never", now: number): boolean {
  if (expiresAt === "never") return false;
  return now > expiresAt;
}
```

> `TTL_DURATIONS` export는 제거된다(이제 `parseTtl`이 프리셋·임의 일수를 통합 처리하며, 유일한 사용처였던 테스트도 Step 1에서 갱신됨). `isExpired`는 변경 없음(서빙·목록·청소가 공유하는 strict `>` 판정 유지).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- ttl`
Expected: PASS (6 케이스).

- [ ] **Step 5: 전체 테스트로 회귀 확인**

Run: `npm run test`
Expected: PASS — `store.test.ts` 등은 `1d/7d/30d/never`만 쓰므로 영향 없음.

- [ ] **Step 6: 타입·빌드 확인**

Run: `npm run lint && npm run build`
Expected: "Compiled successfully". `api/upload`·`api/manage/[id]`는 `isValidTtl` 타입가드로 좁혀진 `TtlOption`을 그대로 넘기므로 시그니처 변경 불필요.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/ttl.ts tests/lib/ttl.test.ts
git commit -m "$(cat <<'EOF'
feat(ttl): 유효기간을 임의 일수(1~365)까지 일반화합니다

parseTtl로 프리셋과 ${N}d 임의 일수를 통합 파싱하고 범위를 검증합니다.
직접 설정 슬라이더(후속 작업)가 보낼 임의 일수를 백엔드가 받도록 합니다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 스프링 애니메이션·드로어 keyframe·드로어 폭 변수

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: keyframe과 변수 추가**

`src/app/globals.css`의 애니메이션 블록(맨 끝 `.animate-sheet` 라인까지)을 아래로 교체:

```css
@keyframes pop {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes sheet {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
@keyframes drawer-in {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
@keyframes drawer-out {
  from { transform: translateX(0); }
  to { transform: translateX(100%); }
}
.animate-pop { animation: pop 150ms ease-out; }
.animate-fade { animation: fade 150ms ease-out; }
.animate-sheet { animation: sheet 280ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.animate-drawer-in { animation: drawer-in 280ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.animate-drawer-out { animation: drawer-out 200ms ease-in; }
```

그리고 `@theme {…}` 블록 바로 아래(`html, body` 위)에 변수 블록 추가:

```css
:root {
  --drawer-width: 320px;
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 3: 커밋**

```bash
git add src/app/globals.css
git commit -m "$(cat <<'EOF'
feat(motion): 스프링 시트/드로어 keyframe과 드로어 폭 변수를 추가합니다

토스다운 오버슈트 이징의 drawer-in/out, 스프링 sheet, --drawer-width를
정의합니다. 후속 드로어·폼 작업이 사용합니다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 업로드 폼 — TTL "직접 설정" 슬라이더

**Files:**
- Modify: `src/app/upload-form.tsx`

- [ ] **Step 1: 커스텀 TTL 상태 추가**

`src/app/upload-form.tsx`의 상태 선언부에서 `const [ttl, setTtl] = useState("7d");` 다음 줄에 추가:

```tsx
  const [isCustomTtl, setIsCustomTtl] = useState(false);
  const [customDays, setCustomDays] = useState(14);
```

- [ ] **Step 2: 제출 시 유효한 TTL 계산**

`submit` 함수 안에서 `fd.append("ttl", ttl);` 를 아래로 교체:

```tsx
      fd.append("ttl", isCustomTtl ? `${customDays}d` : ttl);
```

- [ ] **Step 3: 프리셋 칩 + "직접 설정" 칩 + 슬라이더 렌더**

기존 TTL 프리셋 블록:

```tsx
        <div className="flex flex-wrap gap-2">
          {TTLS.map((t) => (
            <button key={t.v} onClick={() => setTtl(t.v)} className={`rounded-lg px-4 py-2 text-sm font-medium ${ttl === t.v ? "bg-toss-blue text-white" : "bg-bg-2 text-ink-2"}`}>{t.label}</button>
          ))}
        </div>
```

를 아래로 교체:

```tsx
        <div className="flex flex-wrap gap-2">
          {TTLS.map((t) => (
            <button
              key={t.v}
              onClick={() => { setIsCustomTtl(false); setTtl(t.v); }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${!isCustomTtl && ttl === t.v ? "bg-toss-blue text-white" : "bg-bg-2 text-ink-2"}`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={() => setIsCustomTtl(true)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${isCustomTtl ? "bg-toss-blue text-white" : "bg-bg-2 text-ink-2"}`}
          >
            직접 설정
          </button>
        </div>
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-out"
          style={{ gridTemplateRows: isCustomTtl ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="rounded-xl bg-bg-2 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-2">유효기간</span>
                <span className="rounded-lg bg-[#eef4ff] px-3 py-1 text-sm font-bold text-toss-blue-dark">
                  {customDays}일 후 만료
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={365}
                value={customDays}
                onChange={(e) => setCustomDays(Number(e.target.value))}
                className="mt-3 w-full accent-toss-blue"
              />
            </div>
          </div>
        </div>
```

- [ ] **Step 4: 빌드·린트 확인**

Run: `npm run lint && npm run build`
Expected: "Compiled successfully".

- [ ] **Step 5: 수동 확인**

Run: `npm run dev` 후 메인 화면에서 "직접 설정" 클릭 → 슬라이더가 펼쳐지고 일수 라벨이 실시간 갱신되는지 확인. 프리셋 클릭 시 슬라이더가 접히는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/app/upload-form.tsx
git commit -m "$(cat <<'EOF'
feat(upload): 유효기간에 직접 설정 슬라이더를 추가합니다

프리셋 옆 "직접 설정" 칩을 누르면 1~365일 슬라이더가 펼쳐지고,
제출 시 ${N}d로 전송합니다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 업로드 폼 — 열람 잠금 토글 스위치

**Files:**
- Modify: `src/app/upload-form.tsx`
- 의존성: `@radix-ui/react-switch@latest`

- [ ] **Step 1: Radix Switch 설치**

Run: `npm install @radix-ui/react-switch@latest`
Expected: 설치 성공, `package.json`에 의존성 추가.

- [ ] **Step 2: import 추가**

`src/app/upload-form.tsx` 상단 import 블록에 추가:

```tsx
import * as Switch from "@radix-ui/react-switch";
```

- [ ] **Step 3: 네이티브 체크박스를 토글 스위치 카드로 교체**

기존 블록:

```tsx
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={isLocked} onChange={(e) => setIsLocked(e.target.checked)} />
          🔒 열람 잠금 (비밀번호 입력 후에만 열람)
        </label>
        {isLocked && (
          <input type="password" value={viewPassword} onChange={(e) => setViewPassword(e.target.value)} placeholder="열람 비밀번호 (관리 비밀번호와 별개)" className="rounded-xl border border-line bg-white px-4 py-3" />
        )}
```

를 아래로 교체:

```tsx
        <div className="rounded-xl border border-line bg-white px-4 py-3">
          <label className="flex items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-ink">🔒 열람 잠금</span>
              <span className="text-xs text-ink-3">비밀번호를 입력해야 열람할 수 있습니다</span>
            </span>
            <Switch.Root
              checked={isLocked}
              onCheckedChange={(checked) => { setIsLocked(checked); if (!checked) setViewPassword(""); }}
              className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-toss-blue"
            >
              <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform duration-200 data-[state=checked]:translate-x-6" />
            </Switch.Root>
          </label>
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-out"
            style={{ gridTemplateRows: isLocked ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <input
                type="password"
                value={viewPassword}
                onChange={(e) => setViewPassword(e.target.value)}
                placeholder="열람 비밀번호 (관리 비밀번호와 별개)"
                className="mt-3 w-full rounded-xl border border-line bg-white px-4 py-3"
              />
            </div>
          </div>
        </div>
```

- [ ] **Step 4: 빌드·린트 확인**

Run: `npm run lint && npm run build`
Expected: "Compiled successfully".

- [ ] **Step 5: 수동 확인**

Run: `npm run dev` 후 토글을 켜면 스위치가 파랗게 슬라이드되고 열람 비밀번호 칸이 펼쳐지는지, 끄면 접히며 값이 비워지는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/app/upload-form.tsx package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(upload): 열람 잠금을 둥근 토글 스위치로 교체합니다

네이티브 체크박스를 Radix Switch 기반 토글로 바꾸고, 켜질 때
열람 비밀번호 입력칸이 펼쳐지도록 합니다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 관리 드로어 Context

**Files:**
- Create: `src/app/docs/manage-drawer-context.tsx`

- [ ] **Step 1: Context·Provider·훅 작성**

`src/app/docs/manage-drawer-context.tsx` 생성:

```tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface OpenDoc {
  id: string;
  name: string;
}

interface ManageDrawerValue {
  openDoc: OpenDoc | null;
  open: (doc: OpenDoc) => void;
  close: () => void;
}

const ManageDrawerContext = createContext<ManageDrawerValue | null>(null);

export function useManageDrawer(): ManageDrawerValue {
  const value = useContext(ManageDrawerContext);
  if (!value) {
    throw new Error("useManageDrawer는 ManageDrawerProvider 안에서만 사용할 수 있습니다.");
  }
  return value;
}

export function ManageDrawerProvider({ children }: { children: ReactNode }) {
  const [openDoc, setOpenDoc] = useState<OpenDoc | null>(null);
  return (
    <ManageDrawerContext.Provider
      value={{ openDoc, open: setOpenDoc, close: () => setOpenDoc(null) }}
    >
      {children}
    </ManageDrawerContext.Provider>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: "Compiled successfully" (아직 미사용 — import 경고 없음, export만 존재).

- [ ] **Step 3: 커밋**

```bash
git add src/app/docs/manage-drawer-context.tsx
git commit -m "$(cat <<'EOF'
feat(docs): 관리 드로어 상태 Context를 추가합니다

열린 문서를 페이지 레벨에서 관리하는 Context/Provider/useManageDrawer
훅을 추가합니다. push 드로어가 단일 상태를 공유하기 위함입니다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 관리 드로어 컴포넌트 (데스크탑 우측 패널 / 모바일 바텀시트)

**Files:**
- Create: `src/app/docs/manage-drawer.tsx`

- [ ] **Step 1: 드로어 작성**

`src/app/docs/manage-drawer.tsx` 생성:

```tsx
"use client";

import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import ManagePanel from "./manage-panel";
import { useManageDrawer } from "./manage-drawer-context";
import useMediaQuery from "./use-media-query";

export default function ManageDrawer() {
  const { openDoc, close } = useManageDrawer();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const router = useRouter();
  const isOpen = openDoc !== null;

  const panel = openDoc ? (
    <ManagePanel
      id={openDoc.id}
      name={openDoc.name}
      onActionComplete={() => {
        close();
        router.refresh();
      }}
    />
  ) : null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(next) => { if (!next) close(); }}>
      <Dialog.Portal>
        {isDesktop ? (
          <>
            <Dialog.Overlay className="fixed inset-0 z-30" />
            <Dialog.Content className="fixed inset-y-0 right-0 z-40 w-[var(--drawer-width)] overflow-y-auto bg-white p-6 shadow-card focus:outline-none data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out">
              <Dialog.Title className="sr-only">{openDoc?.name} 관리</Dialog.Title>
              {panel}
            </Dialog.Content>
          </>
        ) : (
          <>
            <Dialog.Overlay className="fixed inset-0 z-30 bg-black/35 data-[state=open]:animate-fade" />
            <Dialog.Content className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl bg-white p-5 pb-8 shadow-card focus:outline-none data-[state=open]:animate-sheet">
              <Dialog.Title className="sr-only">{openDoc?.name} 관리</Dialog.Title>
              <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" aria-hidden="true" />
              {panel}
            </Dialog.Content>
          </>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

> 데스크탑 Overlay는 배경색 없이(투명) 바깥 클릭·ESC 닫기만 담당한다. 모바일은 기존 어두운 scrim 유지.

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 3: 커밋**

```bash
git add src/app/docs/manage-drawer.tsx
git commit -m "$(cat <<'EOF'
feat(docs): 관리 드로어 컴포넌트를 추가합니다

Radix Dialog 기반으로 데스크탑은 우측 슬라이드 패널(투명 오버레이),
모바일은 바텀시트로 분기하고 기존 ManagePanel을 재사용합니다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: DocsShell (push 레이아웃) + 페이지/버튼 배선

**Files:**
- Create: `src/app/docs/docs-shell.tsx`
- Modify: `src/app/docs/manage-button.tsx`
- Modify: `src/app/docs/page.tsx`

- [ ] **Step 1: DocsShell 작성**

`src/app/docs/docs-shell.tsx` 생성:

```tsx
"use client";

import { type ReactNode } from "react";
import { ManageDrawerProvider, useManageDrawer } from "./manage-drawer-context";
import ManageDrawer from "./manage-drawer";
import useMediaQuery from "./use-media-query";

export default function DocsShell({ children }: { children: ReactNode }) {
  return (
    <ManageDrawerProvider>
      <DocsShellBody>{children}</DocsShellBody>
    </ManageDrawerProvider>
  );
}

function DocsShellBody({ children }: { children: ReactNode }) {
  const { openDoc } = useManageDrawer();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const shouldPush = openDoc !== null && isDesktop;

  return (
    <>
      <div
        className="transition-[padding] duration-300 ease-out"
        style={{ paddingRight: shouldPush ? "var(--drawer-width)" : "0px" }}
      >
        <main className="mx-auto max-w-2xl px-5 pt-10 pb-16">{children}</main>
      </div>
      <ManageDrawer />
    </>
  );
}
```

> push는 데스크탑에서만 동작한다. 전체 폭 래퍼의 `padding-right`가 늘면 안쪽 `mx-auto max-w-2xl` 컬럼이 좁아진 영역에서 재중심되며 왼쪽으로 밀린다.

- [ ] **Step 2: ManageButton을 트리거로 축소**

`src/app/docs/manage-button.tsx` 전체를 아래로 교체:

```tsx
"use client";

import { useManageDrawer } from "./manage-drawer-context";

interface ManageButtonProps {
  id: string;
  name: string;
}

export default function ManageButton({ id, name }: ManageButtonProps) {
  const { open } = useManageDrawer();
  return (
    <button
      onClick={() => open({ id, name })}
      className="shrink-0 rounded-lg bg-bg-2 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-line"
    >
      관리
    </button>
  );
}
```

> 기존 Popover/Dialog·`useState`·`useRouter`·`ManagePanel` import는 모두 제거된다(드로어로 이동). `use-media-query` import도 제거.

- [ ] **Step 3: 페이지에서 가운데 컬럼을 DocsShell로 이동**

`src/app/docs/page.tsx` 의 `DocsPage` 컴포넌트와 import를 아래로 교체(상단 `dynamic`/`metadata`/`loadDocs`는 유지):

```tsx
import type { Metadata } from "next";
import { listDocs } from "@/lib/store";
import DocList from "./doc-list";
import DocsShell from "./docs-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "문서 목록 · TTL HTML Share",
  robots: { index: false, follow: false },
};

async function loadDocs() {
  const now = Date.now();
  return { now, docs: await listDocs(now) };
}

export default async function DocsPage() {
  const { now, docs } = await loadDocs();

  return (
    <DocsShell>
      <h1 className="text-2xl font-bold">문서 목록</h1>
      <p className="mt-1 text-ink-3">등록된 문서 {docs.length}개</p>
      <DocList docs={docs} now={now} />
    </DocsShell>
  );
}
```

> 기존 `<main className="mx-auto max-w-2xl px-5 pt-10 pb-16">` 래퍼는 `DocsShell`(DocsShellBody) 안으로 이동했으므로 페이지에서는 제거한다. `doc-list.tsx`는 변경 불필요(`ManageButton` import 동일).

- [ ] **Step 4: 빌드·린트 확인**

Run: `npm run lint && npm run build`
Expected: "Compiled successfully", 미사용 import 경고 없음.

- [ ] **Step 5: 수동 확인 (데스크탑 + 모바일)**

Run: `npm run dev` 후 `/docs`에서:
- 데스크탑(≥768px): "관리" 클릭 시 목록이 왼쪽으로 밀리고 오른쪽에서 드로어가 슬라이드 인. 바깥 클릭/ESC로 닫힘. 연장·삭제 후 목록 갱신.
- 모바일(<768px, 개발자도구 반응형): "관리" 클릭 시 하단 바텀시트가 스프링으로 올라오고 어두운 scrim 표시.

- [ ] **Step 6: 커밋**

```bash
git add src/app/docs/docs-shell.tsx src/app/docs/manage-button.tsx src/app/docs/page.tsx
git commit -m "$(cat <<'EOF'
feat(docs): 관리 UI를 push 사이드 드로어로 재구성합니다

드로어 상태를 DocsShell의 Context로 올려 데스크탑에서 목록을 왼쪽으로
밀고 우측 드로어를 띄웁니다. 관리 버튼은 트리거로 축소합니다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 최종 회귀 검증

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: 전체 테스트**

Run: `npm run test`
Expected: 전체 PASS.

- [ ] **Step 2: 린트·프로덕션 빌드**

Run: `npm run lint && npm run build`
Expected: "Compiled successfully" + 라우트 표 출력. (로컬 env 없을 때 나오는 `[Upstash Redis]` 경고는 무해.)

- [ ] **Step 3: (선택) 미사용 의존성 정리**

리팩터로 `@radix-ui/react-popover`가 더 이상 import되지 않는다. 코드 전역에서 사용처가 없는지 확인 후 제거할지 판단:

Run: `grep -rn "react-popover" src/`
Expected: 결과 없음 → 제거해도 안전. 제거 시 `npm uninstall @radix-ui/react-popover` 후 별도 `chore` 커밋.

---

## Self-Review (작성자 점검 완료)

- **스펙 커버리지:** (1) push 드로어 → Task 5·6·7 / (2) 모바일 시트·스프링 → Task 2·6 / (3) TTL range → Task 1·3 / (4) 잠금 토글 → Task 4. 비목표(연장 슬라이더 미적용, 헤더/푸터 push 제외) 준수.
- **Placeholder:** 모든 코드 스텝에 실제 코드 포함. "적절히 처리" 류 없음.
- **타입 일관성:** `TtlOption`/`parseTtl`/`MAX_TTL_DAYS`(Task 1) ↔ 슬라이더 `${customDays}d`(Task 3) 일치. `useManageDrawer`/`open`/`close`/`openDoc`(Task 5) ↔ 드로어·셸·버튼(Task 6·7) 동일 시그니처. `--drawer-width`(Task 2) ↔ 드로어 폭·push padding(Task 6·7) 동일.
