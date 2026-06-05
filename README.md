# TTL HTML Share

단일 HTML 파일을 올리면 즉시 공유 링크가 생성되고, 지정한 TTL이 지나면 자동 만료됩니다.

## 스택
Next.js (App Router) · Tailwind CSS 4 · Vercel Blob · Upstash Redis · Vitest

## 동작 개요
- HTML 본문 → **Vercel Blob**(public)에 저장
- 메타데이터(이름·비밀번호 해시·만료시각·조회수) → **Upstash Redis**
- 만료시각은 Redis 정렬셋 `expiry:index`로 인덱싱하고, ① 열람 시 게으른 검사 ② **Vercel Cron**(매일 03:00) 청소의 2중 구조로 처리
- 열람: `GET /d/{id}` → 만료 검사 후 Blob을 프록시 서빙(`X-Robots-Tag: noindex`)

## 테스트
```bash
npm run test
```

---

## 인프라 설정 — 실제로 동작시키기

코드는 완성되어 있지만, 실제로 동작하려면 **Vercel Blob**(HTML 저장), **Upstash Redis**(메타/만료), **CRON_SECRET**(청소 cron 보호)이 연결되어야 합니다. 아래 순서대로 진행하세요.

### 1. Vercel 프로젝트 생성
GitHub 저장소(`pcjo1202/TTL-HTML-share`)를 Vercel에 임포트합니다.
- [New Project](https://vercel.com/new) → 저장소 선택 → 프레임워크는 Next.js 자동 감지 → Deploy
- 첫 배포는 스토리지 미연동 상태라 업로드 기능이 동작하지 않습니다. 아래 2~4단계 후 재배포하면 동작합니다.
- 문서: <https://vercel.com/docs/deployments>

### 2. Vercel Blob 연동 (HTML 저장)
프로젝트 대시보드 → **Storage** 탭 → **Create Database** → **Blob** 선택 → 프로젝트에 연결합니다.
- 연결하면 `BLOB_READ_WRITE_TOKEN`(형식: `vercel_blob_rw_<storeId>_<secret>`)이 프로젝트 환경변수로 **자동 주입**됩니다.
- 본 앱은 서버에서 `put(path, html, { access: "public" })`로 저장하고 `blob.url`을 받습니다(`src/lib/store.ts`).
- 문서: <https://vercel.com/docs/vercel-blob> · 서버 업로드: <https://vercel.com/docs/vercel-blob/server-upload>

### 3. Upstash Redis 연동 (메타데이터·만료)
**Storage** 탭(또는 [Marketplace](https://vercel.com/marketplace/upstash)) → **Upstash** → **Redis** 데이터베이스를 생성하고 프로젝트에 연결합니다.
- 문서: <https://upstash.com/docs/redis/howto/vercelintegration>

> ⚠️ **환경변수 이름 주의 (중요)**
> 본 앱은 `Redis.fromEnv()`를 사용하므로 **정확히** `UPSTASH_REDIS_REST_URL` 과 `UPSTASH_REDIS_REST_TOKEN` 이 필요합니다.
> 연동 방식에 따라 Vercel이 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 같은 **다른 이름**으로 주입할 수 있습니다. 그 경우 둘 중 하나로 해결하세요:
> 1. 프로젝트 환경변수에 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 을 같은 값으로 **추가**, 또는
> 2. `src/lib/redis.ts`를 명시 초기화로 변경:
> ```ts
> import { Redis } from "@upstash/redis";
> export const redis = new Redis({
>   url: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL!,
>   token: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN!,
> });
> ```
> 배포 후 실제 주입된 이름은 Vercel → Settings → Environment Variables에서 확인할 수 있습니다.

### 4. CRON_SECRET 설정 (만료 청소 cron 보호)
Vercel → Settings → **Environment Variables** 에 `CRON_SECRET`을 추가합니다(16자 이상 랜덤 문자열 권장).
```bash
# 값 생성 예시
openssl rand -hex 24
```
- Vercel은 cron 호출 시 `Authorization: Bearer <CRON_SECRET>` 헤더를 자동으로 보냅니다. 본 앱의 `GET /api/cron/sweep`이 이를 검증합니다(`src/app/api/cron/sweep/route.ts`).
- cron 스케줄은 `vercel.ts`에 정의되어 있습니다(`0 3 * * *` = 매일 03:00 UTC).
- 문서: <https://vercel.com/docs/cron-jobs> · 보안: <https://vercel.com/docs/cron-jobs/manage-cron-jobs> · 설정 파일: <https://vercel.com/docs/project-configuration/vercel-ts>

### 5. 커스텀 도메인 연결
Vercel → Settings → **Domains** 에서 보유 도메인을 추가하고 DNS 안내(A/CNAME)를 따릅니다.
```bash
# CLI 사용 시 (프로젝트 링크 후)
vercel domains add example.com
```
- 문서: <https://vercel.com/docs/domains/set-up-custom-domain>

### 6. 재배포
2~5단계 후 **Redeploy**(또는 새 커밋 push)하면 스토리지/cron이 적용된 상태로 배포됩니다.

---

## 로컬 개발

`.env.local`에 실제 값을 채우면 로컬에서도 Blob/Redis에 연결됩니다.

**방법 A — Vercel에서 가져오기(권장)**: 프로젝트를 링크한 뒤 환경변수를 내려받습니다.
```bash
npm i -g vercel
vercel link
vercel env pull .env.local
```
- 문서: <https://vercel.com/docs/cli/env>

**방법 B — 수동**: `.env.example`를 `.env.local`로 복사 후 값을 직접 입력합니다.
```bash
cp .env.example .env.local
```

그다음:
```bash
npm install
npm run dev
```

> Upstash는 72시간짜리 임시 DB를 즉시 발급받는 빠른 경로도 제공합니다(로컬 실험용): <https://upstash.com/docs/redis>

## 환경변수 요약

| 변수 | 용도 | 출처 |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | HTML 파일 저장/삭제 | Vercel Blob 연동 시 자동 주입 |
| `UPSTASH_REDIS_REST_URL` | Redis REST 엔드포인트 | Upstash 연동 (이름 주의: 3단계) |
| `UPSTASH_REDIS_REST_TOKEN` | Redis REST 토큰 | Upstash 연동 (이름 주의: 3단계) |
| `CRON_SECRET` | 청소 cron 인증 | 직접 추가 (16자+ 랜덤) |

## 동작 확인 (배포 후)
1. `/` 에서 HTML 파일 업로드 → 링크 생성 확인
2. 생성된 `/d/{id}` 열람 확인
3. `/d/{id}/manage` 에서 비밀번호로 연장/삭제 확인
4. Vercel → Settings → Cron Jobs 에서 `/api/cron/sweep` 등록 확인(만료 문서 자동 정리)

---

> 모든 의존성은 `@latest`로 유지한다. 버전을 고정하지 않는다.
