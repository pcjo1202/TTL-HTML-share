# Toast UI + 테스트 구조 정리 — 설계 문서

**작성일**: 2026-06-05
**상태**: 설계 확정 (구현 계획 대기)
**대상 코드베이스**: TTL HTML Share (Next.js App Router)

## 1. 한 줄 요약

(A) 실패/성공 피드백을 sonner 기반 Toast로 통일하고 에러 상황별 메시지를 전달한다. (B) co-located 테스트를 최상위 `tests/` 디렉터리로 옮겨 소스와 분리한다. 두 작업은 독립적이며 별도로 구현·커밋한다.

## 2. 배경

- 현재 업로드 폼은 인라인 `<p>` 메시지로, 관리 페이지는 메시지 라인으로 피드백을 보여줘 일관성이 없다.
- `fetch` 호출에 `try/catch`가 없어 네트워크/서버 장애 시 에러가 조용히 던져진다(사용자 피드백 없음).
- 복사 버튼은 피드백이 전혀 없다.
- 테스트 8개가 소스와 같은 폴더에 co-located 되어 있어 가독성이 떨어진다.

---

## Part A — Toast 에러/성공 UI

### A-1. 의존성 & 마운트
- `sonner@latest` 설치 (버전 고정 금지).
- `src/app/layout.tsx`의 `<body>` 안에 `<Toaster position="top-center" richColors />`를 1개 렌더.
  - 폰트는 Pretendard 상속, `richColors`로 에러(빨강)/성공(초록) 시맨틱 색상 적용.
  - sonner의 `<Toaster>`는 클라이언트 컴포넌트이므로 서버 레이아웃에서 그대로 import해 렌더 가능.

### A-2. 에러 메시지 매핑 (순수 함수)
새 파일 `src/lib/error-message.ts`:
```ts
export function clientErrorMessage(input: {
  networkError?: boolean;
  status?: number;
  serverMessage?: string;
}): string;
```
규칙(우선순위 순):
1. `networkError === true` → `"네트워크 연결을 확인해 주세요."`
2. `serverMessage`가 비어있지 않으면 그대로 반환 (서버가 이미 상황별 메시지 제공: 400 필수누락, 413 용량초과, 429 과다요청)
3. 그 외 `status` 기준:
   - `413` → `"파일이 너무 큽니다. (최대 10MB)"`
   - `429` → `"요청이 너무 잦아요. 잠시 후 다시 시도해 주세요."`
   - `>= 500` → `"서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요."`
   - 그 외 → `"요청을 처리하지 못했어요."`

메시지 로직을 한 곳에 모아 단위 테스트한다. UI는 결과 문자열을 `toast.error(...)`로 띄우기만 한다.

### A-3. 업로드 폼 (`src/app/upload-form.tsx`)
- `error` state와 인라인 `<p className="text-toss-red">` 제거.
- `submit`을 `try/catch`로 감싼다.
  - 클라이언트 검증 실패(파일/이름/비번 누락) → `toast.error("파일·이름·비밀번호를 입력하세요.")` 후 return.
  - `fetch`가 throw(네트워크 장애) → `toast.error(clientErrorMessage({ networkError: true }))`.
  - `!res.ok` → `toast.error(clientErrorMessage({ status: res.status, serverMessage: json?.error }))`.
  - 성공 → 기존처럼 `setResult({ url })` (결과 화면 유지).
- 복사 버튼 `onClick` → 복사 후 `toast.success("링크를 복사했습니다")`.
- `busy` 처리는 유지하되 `finally`에서 `setBusy(false)` 보장.

### A-4. 관리 페이지 (`src/app/d/[id]/manage/page.tsx`)
- `msg` state 제거.
- `run(action, ttl)`을 `try/catch`로 감싼다.
  - `fetch` throw → `toast.error(clientErrorMessage({ networkError: true }))`.
  - `!res.ok` → `toast.error(clientErrorMessage({ status: res.status, serverMessage: json?.error }))`.
  - 성공 시 `action === "delete"` → `toast.success("삭제되었습니다")`, 연장 → `toast.success("유효기간이 연장되었습니다")`.

### A-5. 범위 밖 (YAGNI)
- 업로드 성공 자체에 대한 별도 Toast(결과 화면이 이미 성공을 표현하므로 중복).
- 토스트 큐 커스텀, undo 액션, 다국어.

---

## Part B — 테스트 구조 정리 (최상위 `tests/`)

### B-1. 파일 이동 (src/ 미러링)
```
src/lib/id.test.ts                    → tests/lib/id.test.ts
src/lib/password.test.ts              → tests/lib/password.test.ts
src/lib/ttl.test.ts                   → tests/lib/ttl.test.ts
src/lib/store.test.ts                 → tests/lib/store.test.ts
src/app/api/upload/route.test.ts      → tests/app/api/upload/route.test.ts
src/app/api/manage/[id]/route.test.ts → tests/app/api/manage/[id]/route.test.ts
src/app/api/cron/sweep/route.test.ts  → tests/app/api/cron/sweep/route.test.ts
src/app/d/[id]/route.test.ts          → tests/app/d/[id]/route.test.ts
```
이동 후 `src/` 트리에는 테스트 파일이 0개가 된다.

### B-2. import 경로 수정 (상대 → `@/` 별칭)
- lib 테스트: `./id`→`@/lib/id`, `./password`→`@/lib/password`, `./ttl`→`@/lib/ttl`, `./store`→`@/lib/store`, `vi.mock("./redis")`→`vi.mock("@/lib/redis")`.
- route 테스트: `import { POST } from "./route"` → 각 라우트의 별칭 경로(`@/app/api/upload/route`, `@/app/api/manage/[id]/route`, `@/app/api/cron/sweep/route`, `@/app/d/[id]/route`).
- 이미 `@/lib/*`를 `vi.mock`하는 부분은 변경 없음.

### B-3. 설정 변경
- `vitest.config.ts`의 `test.include`를 `["src/**/*.test.ts"]` → `["tests/**/*.test.ts"]`로 변경.
- `@` 별칭은 기존대로 `./src`를 가리키므로 테스트의 `@/...` import는 그대로 동작.

### B-4. 신규 테스트
- `tests/lib/error-message.test.ts` — `clientErrorMessage`의 분기(네트워크 / serverMessage 우선 / 413·429·5xx·기타 상태코드)를 검증.

---

## 3. 테스트 전략
- 순수 로직(`clientErrorMessage`)은 단위 테스트로 커버.
- Toast 시각 동작(렌더·자동소멸·스택)은 단위 테스트 대상에서 제외(jsdom+RTL 도입은 현 범위에서 YAGNI). 로컬 `npm run dev` 수동 QA 또는 `/browse`로 확인.
- 두 Part 모두 작업 후 `npm run test`(기존 26개 + error-message 신규) 그린, `npm run build` 성공을 확인.

## 4. 커밋 분리
- Part A(Toast)와 Part B(테스트 구조)는 독립적이므로 별도 커밋으로 나눈다. 권장 순서: Part B(구조 정리) → Part A(기능 추가), 또는 그 반대. 서로 의존하지 않는다.

## 5. 영향 범위 / 비범위
- 변경: `src/app/layout.tsx`, `src/app/upload-form.tsx`, `src/app/d/[id]/manage/page.tsx`, 신규 `src/lib/error-message.ts`, `vitest.config.ts`, 테스트 파일 8개 이동 + 신규 1개, `package.json`(sonner 추가).
- 비변경: API 라우트 로직, 스토어/Redis/Blob, 디자인 토큰, TTL 로직.
