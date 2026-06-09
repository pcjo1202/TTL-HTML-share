---
paths:
  - "src/**/*.tsx"
---

## 역할

프론트엔드 변경을 시작하기 전에 **렌더링 위치(Server/Client Component)와 책임 경계**를 먼저 결정한다.

## 먼저 판단할 것

1. 검색 노출·초기 렌더에 필요한 정적 콘텐츠인가, 아니면 사용자 상호작용인가?
2. 입력·토글·모달·클립보드·브라우저 API(`use*` 훅, 이벤트 핸들러)가 필요한가?
3. 항상 최신이어야 하는 데이터인가? (캐시 전략을 정해야 함)
4. Server/Client 양쪽에서 재사용될 가능성이 있는가?

## Server Component vs Client Component 선택

| 조건                                              | 기본 선택                                        |
| ------------------------------------------------- | ------------------------------------------------ |
| 정적 콘텐츠·SEO 노출·초기 레이아웃                | Server Component                                 |
| 데이터 조회(서버에서 store/DB 직접 호출)          | Server Component                                 |
| 입력·토글·모달·클립보드·`use*` 훅·이벤트 핸들러   | Client Component                                 |
| 사용처가 불확실한 공유 UI                         | Server Component (상호작용 자식만 Client로 분리)  |

- 기본은 Server Component. `"use client"`는 상호작용이 필요한 **잎(leaf) 컴포넌트**에만 붙인다.
- `usePathname`/`useState` 등 클라이언트 훅을 쓰는 컴포넌트만 따로 Client로 분리한다(예: `src/app/tab-nav.tsx`).
- 페이지(서버 컴포넌트)는 데이터 조회 함수(`listDocs` 등)를 직접 호출하고, 상호작용 UI만 Client 컴포넌트로 합성한다.

## UI 변경 체크리스트

- 서버 컴포넌트 렌더 중 `Date.now()`/`Math.random()` 등 **순수하지 않은 호출 금지** — `react-hooks/purity` 린트 에러가 난다. 컴포넌트 밖 헬퍼로 분리한다.
- 항상 최신이어야 하는 SSR 페이지는 `export const dynamic = "force-dynamic"`로 Next 캐시를 끈다.
- 검색에 노출되면 안 되는 페이지는 `metadata.robots = { index: false }`.
- 외부/사용자 콘텐츠를 새 탭으로 여는 링크는 `target="_blank"`에 `rel="noreferrer"`를 함께 단다.
- 버튼·링크·토글은 네이티브 요소와 접근성 상태를 먼저 설계한다.
- 디자인은 `src/app/globals.css`의 toss 토큰(`toss-blue`, `ink`, `ink-2`, `ink-3`, `bg-2`, `line` 등)을 사용한다.

## 금지

- 단일 페이지 전용 정적 UI를 무조건 Client Component로 만들지 않는다(기본은 Server).
- UI 변경과 unrelated refactor, 포맷팅-only 변경을 섞지 않는다.
- 시각적으로 동작해 보여도 SSR 콘텐츠·접근성·캐시·SEO 영향을 확인하지 않은 채 완료하지 않는다.
