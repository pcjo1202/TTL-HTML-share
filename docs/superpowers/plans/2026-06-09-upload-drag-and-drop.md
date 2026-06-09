# 업로드 드래그앤드롭 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 업로드 폼 드롭존에 드래그앤드롭(파일 드롭 + 드래그 강조 + HTML·용량 검증 Toast)을 추가한다.

**Architecture:** 검증 로직은 순수 함수 `htmlFileError`로 분리해 단위 테스트하고(기존 `error-message.ts` 패턴), 드롭존 `<label>`에 `onDragOver`/`onDragLeave`/`onDrop` 핸들러와 `isDragging` 상태를 추가해 드롭 파일을 검증 후 설정한다. 클릭 경로·서버 라우트는 그대로 둔다.

**Tech Stack:** Next.js App Router(클라이언트 컴포넌트), React, sonner(Toast), Vitest.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/lib/upload-file.ts` (신규) | `MAX_UPLOAD_BYTES` 상수 + 순수 검증 함수 `htmlFileError` |
| `tests/lib/upload-file.test.ts` (신규) | `htmlFileError` 분기 단위 테스트 |
| `src/app/upload-form.tsx` (수정) | `isDragging` 상태 + 드롭존 드래그/드롭 핸들러 + 강조 클래스 |

---

## Task 1: 검증 순수 함수 `htmlFileError`

**Files:**
- Create: `src/lib/upload-file.ts`
- Test: `tests/lib/upload-file.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/lib/upload-file.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { htmlFileError, MAX_UPLOAD_BYTES } from "@/lib/upload-file";

const file = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "report.html",
  type: "text/html",
  size: 1000,
  ...over,
});

describe("htmlFileError", () => {
  it("text/html 파일은 통과한다(null)", () => {
    expect(htmlFileError(file(), MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("type이 비어도 .html 확장자면 통과한다", () => {
    expect(htmlFileError(file({ type: "", name: "a.html" }), MAX_UPLOAD_BYTES)).toBeNull();
  });

  it(".htm 확장자도 통과한다", () => {
    expect(htmlFileError(file({ type: "", name: "a.HTM" }), MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("HTML이 아니면 거부 메시지를 반환한다", () => {
    expect(htmlFileError(file({ type: "image/png", name: "a.png" }), MAX_UPLOAD_BYTES)).toBe(
      "HTML 파일만 올릴 수 있어요.",
    );
  });

  it("용량을 초과하면 거부 메시지를 반환한다", () => {
    expect(htmlFileError(file({ size: MAX_UPLOAD_BYTES + 1 }), MAX_UPLOAD_BYTES)).toBe(
      "파일이 너무 큽니다. (최대 10MB)",
    );
  });

  it("HTML이면서 용량 정상이면 통과한다", () => {
    expect(htmlFileError(file({ size: MAX_UPLOAD_BYTES }), MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("MAX_UPLOAD_BYTES는 10MB다", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test`
Expected: FAIL — `@/lib/upload-file` 모듈이 없음.

- [ ] **Step 3: 구현 작성**

Create `src/lib/upload-file.ts`:

```ts
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface FileLike {
  name: string;
  type: string;
  size: number;
}

const isHtml = (file: FileLike): boolean => {
  if (file.type === "text/html") return true;
  const name = file.name.toLowerCase();
  return name.endsWith(".html") || name.endsWith(".htm");
};

// 통과하면 null, 실패하면 사용자용 에러 메시지를 반환한다.
export function htmlFileError(file: FileLike, maxBytes: number): string | null {
  if (!isHtml(file)) return "HTML 파일만 올릴 수 있어요.";
  if (file.size > maxBytes) return "파일이 너무 큽니다. (최대 10MB)";
  return null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test`
Expected: PASS (신규 7개 + 기존 전부 그린).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/upload-file.ts tests/lib/upload-file.test.ts
git commit -m "$(cat <<'EOF'
feat: 업로드 파일 검증 순수 함수를 추가합니다

HTML 여부와 용량 상한을 검사해 에러 메시지를 반환하는 htmlFileError를
추가합니다. 드롭 경로에서 재사용합니다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 드롭존 드래그앤드롭 핸들러

**Files:**
- Modify: `src/app/upload-form.tsx`

> 이 작업은 UI 인터랙션이라 단위 테스트 대상이 아니다(프로젝트는 jsdom/RTL 미도입). 검증은 빌드·린트 통과 + 수동 확인으로 한다.

- [ ] **Step 1: import와 상태 추가**

`src/app/upload-form.tsx` 상단 import를 바꾼다. 현재:
```tsx
import { useState } from "react";
import { toast } from "sonner";
import { clientErrorMessage } from "@/lib/error-message";
```
아래로 바꾼다(`DragEvent` 타입 추가 + 검증 함수 import 한 줄 추가):
```tsx
import { useState, type DragEvent } from "react";
import { toast } from "sonner";
import { clientErrorMessage } from "@/lib/error-message";
import { htmlFileError, MAX_UPLOAD_BYTES } from "@/lib/upload-file";
```

> 이 파일은 `React` 네임스페이스를 import하지 않으므로(새 JSX transform), 핸들러 타입은 `React.DragEvent`가 아니라 `react`에서 가져온 `DragEvent`를 쓴다.

`busy` 상태 선언 바로 아래에 `isDragging` 상태를 추가한다. 현재:
```tsx
  const [busy, setBusy] = useState(false);
```
아래로 바꾼다:
```tsx
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
```

- [ ] **Step 2: 드롭 핸들러 함수 추가**

`copyLink` 함수 정의 바로 아래(`if (result)` 분기 위)에 드롭 핸들러를 추가한다:

```tsx
  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (!dropped) return;
    const error = htmlFileError(dropped, MAX_UPLOAD_BYTES);
    if (error) {
      toast.error(error);
      return;
    }
    setFile(dropped);
  }
```

- [ ] **Step 3: 드롭존 `<label>`에 핸들러·강조 적용**

현재 드롭존 `<label>`(파일 input을 감싼 요소):
```tsx
      <label className="flex min-h-[160px] cursor-pointer items-center justify-center rounded-[20px] border-2 border-dashed border-line bg-white text-center text-sm text-ink-3">
        <input type="file" accept="text/html,.html" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? <span className="font-medium text-ink">{file.name}</span> : <span>⬆️ HTML 파일을 끌어다 놓거나 클릭<br />(최대 10MB)</span>}
      </label>
```
아래로 바꾼다(핸들러 3개 + `isDragging` 조건부 클래스 추가, 내부 input/문구는 그대로):
```tsx
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex min-h-[160px] cursor-pointer items-center justify-center rounded-[20px] border-2 border-dashed text-center text-sm text-ink-3 ${
          isDragging ? "border-toss-blue bg-[#eef4ff]" : "border-line bg-white"
        }`}
      >
        <input type="file" accept="text/html,.html" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? <span className="font-medium text-ink">{file.name}</span> : <span>⬆️ HTML 파일을 끌어다 놓거나 클릭<br />(최대 10MB)</span>}
      </label>
```

- [ ] **Step 4: 빌드·린트 확인**

Run: `npm run build && npm run lint`
Expected: 성공, 에러 없음. (빌드 중 `[Upstash Redis] Unable to find environment variable` 경고는 무해. "Compiled successfully" 확인.)

- [ ] **Step 5: 커밋**

```bash
git add src/app/upload-form.tsx
git commit -m "$(cat <<'EOF'
fix: 업로드 드롭존에 드래그앤드롭을 구현합니다

onDragOver/onDragLeave/onDrop 핸들러를 추가해 파일 드롭을 받고,
htmlFileError로 검증 후 설정합니다. 드래그 중에는 테두리를 강조합니다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 최종 검증

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 테스트 그린**

Run: `npm run test`
Expected: 모든 테스트 PASS.

- [ ] **Step 2: 빌드·린트**

Run: `npm run build && npm run lint`
Expected: 성공.

- [ ] **Step 3: 수동 QA (선택)**

`.env.local`이 있으면 `npm run dev` 후 또는 `/browse`로:
- 점선 박스에 HTML 파일을 드래그하면 테두리가 파랗게 강조된다.
- HTML 파일을 드롭하면 파일명이 표시되고(설정됨), 이후 제출이 동작한다.
- HTML이 아닌 파일을 드롭하면 `"HTML 파일만 올릴 수 있어요."` Toast가 뜨고 파일은 설정되지 않는다.
- 10MB 초과 파일을 드롭하면 `"파일이 너무 큽니다. (최대 10MB)"` Toast가 뜬다.
- 기존 클릭 업로드도 그대로 동작한다.

---

## 비범위 (이 플랜에 포함하지 않음)

- 클릭 경로(`<input onChange>`)에 검증 추가.
- 서버 업로드 라우트 변경.
- 멀티파일 드롭·드롭 미리보기.
