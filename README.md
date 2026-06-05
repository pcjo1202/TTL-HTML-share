# TTL HTML Share

단일 HTML 파일을 올리면 즉시 공유 링크가 생성되고, 지정한 TTL이 지나면 자동 만료됩니다.

## 스택
Next.js (App Router) · Tailwind CSS 4 · Vercel Blob · Upstash Redis · Vitest

## 로컬 실행
1. `npm install`
2. `.env.example`를 `.env.local`로 복사 후 값 채우기
3. `npm run dev`

## 테스트
`npm run test`

## 배포 (Vercel)
1. GitHub 저장소를 Vercel 프로젝트로 임포트
2. Storage 탭에서 **Blob** 생성/연동 → `BLOB_READ_WRITE_TOKEN` 자동 주입
3. Marketplace에서 **Upstash Redis** 연동 → `UPSTASH_REDIS_REST_*` 자동 주입
4. `CRON_SECRET` 환경변수 추가
5. 개인 도메인 연결 (Settings > Domains)
6. `vercel.ts`의 cron이 매일 03:00에 만료 문서를 청소

> 모든 의존성은 `@latest`로 유지한다. 버전을 고정하지 않는다.
