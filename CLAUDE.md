# CLAUDE.md

TTL HTML Share — 단일 HTML을 올리면 공유 링크가 생기고, 지정한 TTL이 지나면 자동 만료되는 서비스. Vercel에 한 번 배포해두고 업로드는 스토리지 저장만으로 처리한다(매 업로드마다 재배포하지 않음).

## 스택

Next.js (App Router, Node.js 런타임) · Tailwind CSS 4 (CSS-first) · Vercel Blob (public store) · Upstash Redis · Vitest · sonner(Toast) · nanoid

## 명령어

```bash
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드 (배포 전 통과 필수)
npm run lint         # eslint
npm run test         # vitest run (전체)
npm run test:watch   # vitest watch
```

> 빌드 중 `[Upstash Redis] Unable to find environment variable` 경고는 로컬에 env가 없어서 나는 **무해한 경고**다. "Compiled successfully"와 라우트 표가 나오면 성공.

## 구조

- `src/lib/` — 순수 로직 단위. `store.ts`(Redis+Blob 문서 CRUD), `redis.ts`, `ttl.ts`(만료 계산/`isExpired`), `password.ts`(scrypt), `id.ts`(nanoid), `ratelimit.ts`, `error-message.ts`, `expiry-page.ts`
- `src/app/` — 라우트. `page.tsx`+`upload-form.tsx`(업로드), `docs/page.tsx`(문서 목록 SSR), `d/[id]/route.ts`(서빙), `d/[id]/manage/`(관리), `api/{upload,manage/[id],cron/sweep}/route.ts`
- `tests/` — `src/` 트리를 미러링한 별도 테스트 디렉터리(co-located 아님). `@/` 별칭 = `./src`.
- `docs/superpowers/{specs,plans}/` — 설계·구현 계획 문서.

### Redis 데이터 모델
- `doc:{id}`(JSON 레코드), `views:{id}`(카운터)
- `expiry:index`(정렬셋, score=expiresAt) — **만료 문서만**. 영구 문서 미등록. cron 청소·만료 판정용.
- `docs:index`(정렬셋, score=createdAt) — **전체 문서** 열거용(영구 포함). 목록 페이지가 사용.
- HTML 본문은 Redis가 아니라 Vercel Blob(public)에 저장하고 `blobUrl`만 레코드에 보관.

## Gotchas (이 프로젝트에서 실제로 문제됐던 것들)

- **Vercel Blob + OIDC + `BLOB_STORE_ID`**: Vercel 런타임은 `VERCEL_OIDC_TOKEN`을 자동 주입하는데, env에 `BLOB_STORE_ID`가 있으면 `@vercel/blob`이 `BLOB_READ_WRITE_TOKEN`을 **무시**하고 그 스토어로 라우팅한다. private 스토어를 가리키면 `Cannot use public access on a private store`로 업로드가 실패한다. **Blob 스토어는 public이어야 하고**, 스토어 교체 시 옛 `BLOB_STORE_ID`를 반드시 지운다. (앱은 `put(..., { access: "public" })` + 서버 프록시 서빙)
- **Redis env 이름**: 연동 방식에 따라 `UPSTASH_REDIS_REST_*` 또는 `KV_REST_API_*`로 주입된다. `src/lib/redis.ts`는 **두 이름 모두 허용**하도록 명시 초기화돼 있다(`fromEnv()` 아님).
- **서버 컴포넌트에서 `Date.now()` 금지**: Next 16 + React Compiler의 `react-hooks/purity` 린트가 컴포넌트 렌더 중 `Date.now()` 호출을 에러로 막는다. 컴포넌트 밖 헬퍼(예: `loadDocs()`)로 분리할 것. (라우트 핸들러는 컴포넌트가 아니라 무관)
- **만료 판정은 `isExpired` 재사용**: 서빙(`d/[id]/route.ts`)·목록(`listDocs`)·청소가 모두 `src/lib/ttl.ts`의 `isExpired`(strict `>`)를 쓴다. 인라인으로 다시 쓰지 말 것.
- **민감 필드 노출 주의**: 목록 등 외부 응답에는 `DocSummary`(passwordHash/salt/blobUrl 제외) 같은 별도 타입을 쓴다. `DocRecord`를 그대로 내보내지 않는다.
- **SSR 캐시**: 항상 최신이어야 하는 동적 페이지(예: `/docs`)는 `export const dynamic = "force-dynamic"`로 Next 캐시를 끈다.

## 배포 / 환경

- Vercel 프로젝트 `smelljo/ttl-html-share`, GitHub(`pcjo1202/TTL-HTML-share`) push 시 자동배포. 프로덕션: https://ttl-html-share.vercel.app
- 필수 env: `BLOB_READ_WRITE_TOKEN`, `UPSTASH_REDIS_REST_*` 또는 `KV_REST_API_*`, `CRON_SECRET`. (스토리지는 Vercel 대시보드에서 연결)
- cron은 `vercel.ts`에 정의(`0 3 * * *` 만료 청소). 설정은 `vercel.json` 아님 **`vercel.ts`**(`@vercel/config`).
- 의존성은 `@latest` 유지, 버전 고정 안 함.

## 컨벤션

- 커밋/이슈/PR은 `/git` 스킬 사용. 커밋 메시지는 한글, conventional prefix(`feat:`/`fix:`/`docs:`/`refactor:`/`chore:`). 본문 끝에 `Co-Authored-By` 푸터.
- 테스트는 `tests/`에 두고 `@/` 별칭으로 import. Redis/Blob은 `vi.mock`으로 목킹.
- 기능 작업은 설계(spec) → 계획(plan) → 구현 흐름. 문서는 `docs/superpowers/`.
