## 네이밍

- 변수, 함수: camelCase / 상수: UPPER_CASE / 타입, 인터페이스, class: PascalCase / 폴더명: camelCase
- 변수/함수명은 길더라도 구체적으로 (`isOpen` X → `isErrorModalOpen` O)
- 약어 사용 금지 — 풀네임으로 작성 (`btn` X → `button` O, `msg` X → `message` O, `idx` X → `index` O)
  - 업계 표준 약어는 허용: `URL`, `API`, `HTML`, `CSS`, `ID`, `SSR`, `CDN` 등

### Boolean 변수

- `is` / `has` / `should` / `can` prefix 필수
  - 상태: `is` / 소유·존재: `has` / 조건부 동작: `should` / 능력·권한: `can`
- prefix 없는 Boolean 금지 (`loading` X → `isLoading` O)

## 타입

- `any` 사용 금지. 함수 인자와 반환값에 타입 명시
- `as` 타입 단언 지양 (특수한 경우 제외)
- 객체 형태 정의: `interface` / 유니언·교차·유틸리티 조합: `type`
- enum 대신 `as const` 객체 + `typeof` 유니언 사용
- 유틸리티 타입 적극 활용: `Pick`, `Omit`, `Partial`, `Required`, `Record`

## 코드 스타일

- 화살표 함수로 작성. 인자 3개 이상 금지 — 2개 초과 시 객체로 전달
- async/await 사용. `.then()` 체이닝 금지
- early return으로 중첩 최소화
- 삼항 연산자 1단계만 허용. 중첩 삼항 금지
- `??` (nullish coalescing), `?.` (optional chaining) 선호
- 배열/객체 직접 mutation 금지 — spread, `map`, `filter`, `toSorted` 등 새 참조 반환 메서드 사용

### 매직 넘버 / 문자열

- 의미 불명확한 리터럴 값 직접 사용 금지 — 상수로 추출

## 모듈

- 두 번 이상 사용되는 함수는 별도 모듈 파일로 분리
- 모듈 파일명 = 함수명 (camelCase), default export
- 특정 컴포넌트 전용 모듈은 해당 컴포넌트 가까운 위치에 배치

## 에러 처리

- catch 블록에서 에러를 무시하지 말 것 (빈 catch 금지)
  - 예외: 의도적 무시가 필요한 경우 `// catch-ignore: <사유>` 주석 필수
- 에러 로깅 시 원본 에러 객체 보존 (`cause` 체이닝 활용)
- SSR 데이터 페칭 실패 시 에러를 삼키지 말 것 — 에러 상태 UI 렌더링
- `src/pages/404.tsx`, `src/pages/500.tsx` 커스텀 에러 페이지 제공
