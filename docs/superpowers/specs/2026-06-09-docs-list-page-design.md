# 문서 목록 페이지 — 설계 문서

**작성일**: 2026-06-09
**상태**: 설계 확정 (구현 계획 대기)
**대상 코드베이스**: TTL HTML Share (Next.js App Router)

## 1. 한 줄 요약

현재 등록된 문서 전체를 확인하는 목록 페이지를 별도 route(`/docs`)로 추가한다. 상단 탭(`[업로드] [문서 목록]`)으로 업로드 페이지와 전환한다. 이번 범위에서는 **인증 없는 공개 목록**이며, 게이트(인증·권한)는 후속 작업으로 분리한다.

## 2. 배경 & 목표

업로드한 문서를 한곳에서 훑어볼 방법이 없다. 링크를 따로 보관하지 않으면 다시 찾기 어렵다. 등록된 문서를 최신순으로 나열하는 목록 페이지를 추가한다.

핵심 기술 과제는 **열거(enumeration)**다. 현재 Redis에는 `doc:{id}` 개별 레코드와 `expiry:index`(만료 인덱스)만 있고, `expiry:index`에는 **만료 문서만** 들어간다(영구 문서는 미등록). 전체를 훑을 전역 인덱스가 없으므로 이를 추가한다.

## 3. 확정된 요구사항

| 항목 | 결정 |
|---|---|
| 접근 권한 | **이번 범위: 인증 없는 공개**. 게이트는 후속 작업 |
| route | 신규 `/docs` (SSR) |
| 상단 네비 | 탭 `[업로드] [문서 목록]`, 두 페이지 공유 |
| 렌더링 | SSR 서버 컴포넌트가 store를 직접 호출 (별도 조회 API 없음) |
| 열거 인덱스 | 전역 정렬셋 `docs:index` (score=createdAt) 신규 |
| 정렬 | 최신순 (createdAt desc) |
| 만료 문서 | 숨김 (읽을 때 `now > expiresAt` 게으른 필터) |
| 행 표시 | 문서명(+열기 링크), 생성일, 만료 D-day(영구는 "영구"), 조회수, 관리 링크 |
| 검색 노출 | 목록 페이지에 `noindex` |

## 4. 아키텍처 & 데이터 흐름

```
[/docs] (SSR 서버 컴포넌트, dynamic="force-dynamic", noindex)
   └─ listDocs(now) 직접 호출
        ├─ ZRANGE docs:index 0 -1 REV         (id 최신순)
        ├─ pipeline: GET doc:{id} + GET views:{id}  (N개 일괄)
        └─ now > expiresAt 인 항목 필터(숨김)
   └─ <TabNav active="docs"> + 목록 테이블 렌더
```

별도 HTTP 조회 API는 만들지 않는다. 클라이언트 측 페이지네이션/실시간 갱신이 필요해지면 그때 도입한다(YAGNI).

## 5. Vercel/Next 배포 관점 검토

- **SSR**: App Router 서버 컴포넌트는 Fluid Compute(Node.js 런타임)에서 동작. 기존 라우트도 `runtime="nodejs"`라 동일. 문제 없음.
- **캐싱 (유일한 주의점)**: 목록은 항상 최신이어야 하므로 Next의 정적/데이터 캐시를 꺼야 한다. `/docs/page.tsx`에 `export const dynamic = "force-dynamic"`를 둔다(요청마다 서버 렌더). Redis 호출이 캐시되지 않도록 보장.
- **조회 API/SSR이 배포에 미치는 영향**: 없음. 추가 함수/페이지는 기존 배포 파이프라인(Git 자동배포)에 그대로 포함되며 새 환경변수·인프라가 필요 없다.
- **비용/성능**: `ZRANGE` 1회 + 파이프라인 N건 조회. 소규모에 무난. 문서가 많아지면 6절의 페이지네이션으로 확장.

## 6. 데이터 모델 변경

신규 전역 인덱스 **`docs:index`** (Sorted Set):
- score = `createdAt`(epoch ms), member = `id`
- 영구 문서도 포함(만료 인덱스와 달리 모든 문서 등록)

`src/lib/store.ts` 유지 지점:
- `createDoc`: 레코드 저장 직후 `redis.zadd("docs:index", { score: createdAt, member: id })`.
- `deleteDoc`: 기존 정리에 더해 `redis.zrem("docs:index", id)`.
- `expiry:index`는 기존 그대로(만료 청소용). 두 인덱스는 목적이 다르다.

**백필**: 불필요. 현재 프로덕션에 실제 문서 0개(전부 테스트였고 삭제됨). 인덱스 추가 이후 생성분부터 누적된다.

## 7. store 함수

```ts
export interface DocSummary {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number | "never";
  views: number;
}

export async function listDocs(now: number): Promise<DocSummary[]>;
```

동작:
1. `redis.zrange("docs:index", 0, -1, { rev: true })` → id 배열(최신순).
2. 빈 배열이면 `[]` 반환.
3. 파이프라인으로 각 id의 `doc:{id}`, `views:{id}` 일괄 조회.
4. 레코드 없음(이미 삭제됨)·`now > expiresAt`(만료) 항목 제외.
5. **요약 필드만** 매핑해 반환 — `passwordHash`/`salt`/`blobUrl`은 목록에 노출하지 않는다(별도 `DocSummary` 타입).

> 목록 경로에서 만료 문서를 **삭제하지 않는다**. 표시에서 숨기기만 하고, 실제 정리는 기존 cron/열람 시 게으른 삭제에 맡긴다(읽기 경로의 부수효과 최소화).

## 8. 라우트 & UI

### 8.1 `/docs` (신규, SSR)
- `export const dynamic = "force-dynamic"`, `noindex`(metadata `robots: { index:false }` 또는 응답 헤더).
- `listDocs(Date.now())` 호출 → 테이블 렌더.
- 각 행: 문서명(클릭/버튼 → `/d/{id}` 새 탭) · 생성일(예: "6월 9일") · 만료 D-day("D-6" / 영구는 "영구") · 조회수 · 관리(→ `/d/{id}/manage`).
- 빈 상태: "아직 등록된 문서가 없습니다" + 업로드 탭 유도.
- toss 디자인 토큰(기존 `globals.css`) 유지. 모바일은 카드, PC는 행 정렬(반응형).

### 8.2 상단 탭 `TabNav`
- 신규 클라이언트 컴포넌트 `src/app/tab-nav.tsx`. `usePathname()`으로 활성 탭 강조.
- 탭 2개: `업로드`(`/`), `문서 목록`(`/docs`).
- `/`(업로드)와 `/docs` 두 페이지 상단에 동일하게 렌더. (탭이 2개뿐이라 공유 레이아웃 route group 대신 컴포넌트 직접 배치로 최소화.)

## 9. 테스트

- `tests/lib/store.test.ts` 확장(또는 신규):
  - `listDocs`: 최신순 정렬, 만료 항목 숨김, 영구 문서 포함, 레코드 누락 항목 제외, 빈 인덱스 → `[]`.
  - `createDoc`: `docs:index`에 `zadd` 호출 검증.
  - `deleteDoc`: `docs:index`에서 `zrem` 호출 검증.
- 시각/SSR 렌더는 단위 테스트 제외(기존 방침). 로컬 `npm run dev` 또는 `/browse`로 수동 확인.
- 완료 기준: 기존 테스트 + 신규 그린, `npm run build` 성공.

## 10. 영향 범위 / 비범위

**변경:**
- `src/lib/store.ts` — `docs:index` 유지(`createDoc`/`deleteDoc`) + `listDocs` + `DocSummary` 타입.
- `src/app/page.tsx` — 상단 `TabNav` 추가.
- 신규: `src/app/docs/page.tsx`(SSR 목록), `src/app/tab-nav.tsx`(탭).
- 테스트 추가.

**비변경:**
- 업로드/서빙/관리/cron API 로직, Blob/Redis 연결, TTL 로직, `expiry:index`.

**범위 밖 (후속 작업 TODO):**
- 목록 게이트(인증·권한) — 이번엔 공개, 다음 작업에서 진행.
- 페이지네이션·검색·정렬 토글 — 문서 수가 늘면.
