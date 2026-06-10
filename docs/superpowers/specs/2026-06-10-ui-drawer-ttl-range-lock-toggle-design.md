# 관리 드로어 · TTL range · 열람 잠금 토글 설계

작성일: 2026-06-10

## 배경

이전 작업에서 문서 목록의 "관리"를 Radix Popover(데스크탑) / 바텀시트(모바일)로 띄웠다.
데스크탑 Popover가 목록 항목 위에 겹쳐 떠 목록을 가리고, 뜨는 위치가 들쭉날쭉한 문제가 있었다.
함께 메인 업로드 화면의 기간 선택과 열람 잠금 컨트롤의 UX도 다듬는다.

## 목표

1. 데스크탑 관리 UI를 **오른쪽 사이드 드로어**로 바꾸되, 목록을 가리지 않고 **콘텐츠를 왼쪽으로 밀어내는(push)** 방식으로 동작시킨다.
2. 모바일은 기존 **하단 바텀시트**를 유지하고, 전반 애니메이션을 **토스다운 스프링** 무드로 다듬는다.
3. 업로드 화면 기간(TTL)에 **프리셋 + "직접 설정" 슬라이더**(range)를 도입한다.
4. 업로드 화면 "열람 잠금"의 네이티브 체크박스를 **둥근 토글 스위치**로 교체한다.

비목표: 관리 드로어의 연장 버튼에 슬라이더 추가(현 프리셋 유지), 헤더/푸터까지 미는 전역 push.

## 결정 사항 (브레인스토밍 확정)

- 드로어 동작: **push**(목록 밀어내기). 오버레이 아님.
- 모바일: **바텀시트 유지**.
- 애니메이션: **토스다운 스프링**(오버슈트 cubic-bezier).
- TTL: **B안** — 기존 프리셋 + "직접 설정" 슬라이더.
- 열람 잠금: **A안** — 토글 스위치, 켜지면 열람 비밀번호 칸이 펼쳐짐.
- 데스크탑 push 시 어두운 scrim 없이 **투명 오버레이**(바깥 클릭·ESC 닫기용)만. 모바일 시트는 어두운 scrim 유지.
- "직접 설정" 범위: **1~365일** (`MAX_TTL_DAYS = 365`).

## 1. 관리 드로어 (push)

### 문제

현재 `manage-button.tsx`는 행마다 독립적으로 Popover/Dialog를 띄운다. push를 하려면 열린 드로어가
한 번에 하나여야 하고, 페이지 콘텐츠가 옆으로 밀려야 하므로 **드로어 상태를 페이지 레벨로 끌어올린다**.

### 컴포넌트

- `src/app/docs/manage-drawer-context.tsx` (신규, client)
  - context 값: `{ openDoc: { id: string; name: string } | null; open: (doc) => void; close: () => void }`
  - `useManageDrawer()` 훅 export.
- `src/app/docs/docs-shell.tsx` (신규, client)
  - context Provider. 자식으로 가운데 컬럼을 렌더.
  - 전체 폭 래퍼에 `transition`과 드로어 열림 시 `padding-right: var(--drawer-width)`를 적용한다.
    안쪽 `mx-auto max-w-2xl` 컬럼이 좁아진 영역에서 재정렬되며 왼쪽으로 밀린다.
  - 단일 `<ManageDrawer />`를 렌더(`openDoc` 기준).
- `src/app/docs/manage-drawer.tsx` (신규, client)
  - Radix Dialog 기반(focus trap, ESC, 스크롤 락, a11y).
  - `useMediaQuery("(min-width: 768px)")`로 분기:
    - 데스크탑: 오른쪽 고정 패널(`fixed inset-y-0 right-0 w-[var(--drawer-width)]`) + 슬라이드 인. 투명 오버레이.
    - 모바일: 기존 하단 바텀시트 + 어두운 scrim.
  - 내부에 기존 `ManagePanel`을 그대로 재사용. 액션 완료 시 `close()` + `router.refresh()`.
- `src/app/docs/manage-button.tsx` (수정)
  - Popover/Dialog 제거. context의 `open({ id, name })`만 호출하는 트리거 버튼으로 축소.
- `src/app/docs/page.tsx` (수정, server)
  - 가운데 컬럼을 `DocsShell` 안으로 이동: `<DocsShell><h1/><p/><DocList/></DocsShell>`.
  - `dynamic = "force-dynamic"`, `loadDocs()` 패턴 유지.

`src/app/docs/use-media-query.ts`는 그대로 사용. `ManagePanel`(비밀번호/연장/삭제) 로직 변경 없음.

### 드로어 폭

`--drawer-width`를 CSS 변수로 정의(예: 320px). push 래퍼의 `padding-right`와 드로어 패널 `width`가 같은 값을 쓴다.

## 2. 애니메이션 (토스다운 스프링)

`src/app/globals.css`:

- `@keyframes drawer-in` — `translateX(100%) → translateX(0)`, `cubic-bezier(0.34, 1.56, 0.64, 1)`, ~280ms.
- `@keyframes sheet` — 기존 keyframe을 스프링 cubic-bezier로 업그레이드.
- 닫힘은 Radix `data-[state=closed]`에 ease-in 역재생 keyframe.
- push 래퍼 `padding-right` 전환도 동일 스프링 타이밍/이징.
- 열람 비밀번호 펼침: height/opacity 전환(스프링).

## 3. 기간(TTL) range — B안

### 프론트엔드 (`src/app/upload-form.tsx`)

- 기존 칩(1일/7일/30일/영구) + "직접 설정" 칩 추가.
- "직접 설정" 선택 시 `<input type="range" min={1} max={365}>` 펼침 + "N일 후 만료" 실시간 라벨.
- 커스텀이면 제출 시 `ttl = \`${days}d\``. 프리셋이면 기존 토큰 그대로.

### 백엔드 (`src/lib/ttl.ts`) 일반화

- `MAX_TTL_DAYS = 365` 상수.
- 타입: `TtlOption = "never" | \`${number}d\``.
- `parseTtl(value: string): number | "never" | null`
  - `"never"` → `"never"`.
  - `^\d+d$` 매칭 후 1 ≤ N ≤ `MAX_TTL_DAYS`면 `N` 반환, 아니면 `null`.
- `isValidTtl(value)` → `parseTtl(value) !== null`.
- `computeExpiresAt(ttl, now)` → `parseTtl` 결과로 `now + days*DAY_MS` 또는 `"never"`.
- `isExpired`는 변경 없음(`isExpired` 재사용 원칙 유지).
- `createDoc`/`extendDoc`(`src/lib/store.ts`), `api/upload`, `api/manage/[id]`는 검증만 일반화되고 시그니처 동일.
  기존 `"7d"/"30d"/"never"`는 계속 유효.

### 비목표

관리 드로어 연장 버튼(+7일/+30일/영구)은 현 프리셋 유지. 슬라이더 미적용(자동으로 계속 동작).

## 4. 열람 잠금 토글 — A안

`src/app/upload-form.tsx`:

- 네이티브 `<input type="checkbox">`를 Radix Switch(`@radix-ui/react-switch`, 이미 Radix 생태계 사용) 기반
  둥근 토글로 교체. 토스 토큰(`toss-blue`, `line` 등) 사용.
- 켜지면 열람 비밀번호 입력칸이 스프링 모션으로 펼쳐짐. 끄면 접힘 + 값 초기화.
- 제출 검증 로직(`isLocked && !viewPassword`)은 그대로.

## 데이터 흐름

업로드/관리 API 계약은 동일. TTL만 임의 일수 문자열을 허용하도록 검증이 넓어진다.
Redis 모델(`doc:{id}`, `expiry:index`, `docs:index`)·Blob 저장 방식 변경 없음.

## 에러 처리

- 서버: 범위 밖 TTL(`parseTtl === null`)은 기존 400 경로로 거절("필수 항목이 누락되었습니다." 분기 유지).
- 클라이언트: 슬라이더가 1~365로 클램프되어 잘못된 값 전송 불가.

## 테스트

- `tests/lib/ttl.test.ts` — `parseTtl` 경계값(`"0d"`, `"366d"`, `"-1d"`, `"abc"`, `"7d"`, `"365d"`, `"never"`),
  `isValidTtl`, `computeExpiresAt` 확장. 기존 테스트 갱신.
- UI는 프로젝트 관례상 단위 테스트 비중이 낮으므로 TTL 로직에 집중하고,
  `npm run build` · `npm run lint`로 회귀 검증.

## 영향 파일 요약

신규: `manage-drawer-context.tsx`, `docs-shell.tsx`, `manage-drawer.tsx`
수정: `manage-button.tsx`, `docs/page.tsx`, `upload-form.tsx`, `globals.css`, `lib/ttl.ts`,
`tests/lib/ttl.test.ts` (필요 시 `store.ts`/route의 타입 import 갱신)
의존성 추가: `@radix-ui/react-switch@latest`
