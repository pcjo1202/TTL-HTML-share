# 업로드 드래그앤드롭 수정 — 설계 문서

**작성일**: 2026-06-09
**상태**: 설계 확정 (구현 계획 대기)
**대상 코드베이스**: TTL HTML Share (Next.js App Router)
**유형**: 버그 수정

## 1. 한 줄 요약

업로드 폼의 드롭존이 "끌어다 놓거나 클릭"이라고 안내하지만 드래그앤드롭이 동작하지 않는다. 드롭 핸들러를 추가해 파일 드롭을 지원하고, 드래그 중 시각 강조와 HTML·용량 검증 피드백을 더한다.

## 2. 근본 원인

`src/app/upload-form.tsx`의 드롭존(현재 `:75-78`)은 숨겨진 `<input type="file" class="hidden">`을 감싼 `<label>`이다.

- **클릭**은 동작한다 — label이 파일 선택창을 연다.
- **드래그앤드롭은 동작하지 않는다** — `onDrop`/`onDragOver` 핸들러가 없다. input이 `hidden`(display:none)이라 네이티브 input의 드롭 영역도 없다. 점선 박스에 파일을 떨어뜨리면 아무 일도 일어나지 않고, 브라우저 기본 동작으로 그 파일을 열어버린다.

즉 안내 문구가 약속하는 드롭이 **구현되지 않은** 상태다.

## 3. 범위

| 항목 | 결정 |
|---|---|
| 드롭으로 파일 지정 | 추가 |
| 드래그 중 시각 강조 | 추가 |
| 드롭 파일 검증(HTML·용량) + Toast | 추가 |
| 클릭 경로 | 그대로 유지(`accept` 소프트 필터). 검증 추가 안 함 |
| 서버 라우트(`/api/upload`) | 변경 없음 |
| 멀티파일 드롭 | 범위 밖(첫 파일만) |

## 4. 설계

### 4.1 검증 로직 분리 (순수 함수 + 단위 테스트)

기존 `src/lib/error-message.ts`와 동일한 "순수 로직은 lib에 두고 단위 테스트" 패턴을 따른다.

신규 `src/lib/upload-file.ts`:
```ts
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// 통과하면 null, 실패하면 사용자용 에러 메시지를 반환한다.
export function htmlFileError(
  file: { name: string; type: string; size: number },
  maxBytes: number,
): string | null;
```
규칙(우선순위 순):
1. HTML이 아니면(`type !== "text/html"` 그리고 파일명이 `.html`/`.htm`로 끝나지 않음) → `"HTML 파일만 올릴 수 있어요."`
2. `size > maxBytes` → `"파일이 너무 큽니다. (최대 10MB)"` (서버 413 응답 문구와 동일)
3. 그 외 → `null`

> 인자를 `File`이 아니라 `{ name, type, size }` 구조로 받아, 테스트에서 실제 `File` 객체를 만들 필요 없이 검증한다. 클라이언트에서는 `File`을 그대로 넘기면 된다.

### 4.2 업로드 폼 (`src/app/upload-form.tsx`)

- `isDragging` boolean state 추가.
- 드롭존 `<label>`에 핸들러 추가:
  - `onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}` — 기본 동작(브라우저 파일 열기) 방지 + 드롭 허용.
  - `onDragLeave={() => setIsDragging(false)}`
  - `onDrop`: `e.preventDefault()` → `setIsDragging(false)` → `const f = e.dataTransfer.files[0]` → 없으면 return → `htmlFileError(f, MAX_UPLOAD_BYTES)` 검사 → 메시지 있으면 `toast.error(message)`, 없으면 `setFile(f)`.
- 클릭 경로(`<input onChange>`)는 그대로 둔다.
- 시각 강조: `isDragging`이면 `border-toss-blue bg-[#eef4ff]`, 아니면 기존 `border-line bg-white`. 나머지 클래스는 유지.

### 4.3 데이터 흐름

```
[파일 드롭] → onDrop(preventDefault)
   → e.dataTransfer.files[0]
   → htmlFileError(file, MAX_UPLOAD_BYTES)
        ├ 메시지 → toast.error(메시지)  (파일 미설정)
        └ null   → setFile(file)        (기존 제출 흐름으로 이어짐)
```

## 5. 테스트

- `tests/lib/upload-file.test.ts` — `htmlFileError`:
  - `text/html` 통과(null)
  - 확장자 `.htm`/`.html`로 통과(type 비어도)
  - 비-HTML(예: `image/png`, `.png`) 거부 → HTML 메시지
  - 용량 초과 거부 → 용량 메시지
  - 정상 파일 → null
- 실제 드래그/드롭 인터랙션과 강조는 단위 테스트 제외(jsdom/RTL 미도입 — 기존 방침). 로컬 `npm run dev` 또는 `/browse`로 수동 확인.
- 완료 기준: 기존 + 신규 테스트 그린, `npm run build`·`npm run lint` 성공.

## 6. 영향 범위 / 비범위

**변경:**
- 신규 `src/lib/upload-file.ts`(+ 테스트).
- `src/app/upload-form.tsx` — `isDragging` state, 드롭존 드래그 핸들러, 강조 클래스.

**비변경:**
- 서버 업로드 라우트, store/Redis/Blob, TTL 로직, 클릭 경로 동작.

**범위 밖:**
- 클릭 경로 검증 추가, 멀티파일 드롭, 드롭 미리보기.
