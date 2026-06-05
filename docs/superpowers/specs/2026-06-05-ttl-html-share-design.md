# TTL HTML Share — 설계 문서

**작성일**: 2026-06-05
**상태**: 설계 확정 (구현 계획 대기)

## 1. 한 줄 요약

단일 HTML 문서를 올리면 즉시 공유 링크가 생성되고, 지정한 유효기간(TTL)이 지나면 자동 만료되는 내부 공유 서비스. Vercel에 한 번 배포해두고 업로드는 저장만으로 처리한다.

## 2. 배경 & 목표

개발 후 산출물을 단일 HTML 문서(리포트·대시보드 등)로 만들어 팀에 공유하는 일이 잦아졌다. 문서 파일을 직접 주고받는 대신, **올리는 즉시 링크로 공유**하고 **일정 기간 뒤 자동 정리**되는 서비스를 만든다.

**핵심 원칙**: 매 업로드마다 실제 배포를 트리거하지 않는다. 서비스는 한 번만 배포하고, 업로드된 HTML은 스토리지에 저장 → 동적 라우트(`/d/{id}`)로 즉시 서빙한다. 링크는 저장 즉시 생성된다.

## 3. 확정된 요구사항

| 항목 | 결정 |
|---|---|
| 열람 권한 | 링크만 알면 누구나 (추측 어려운 랜덤 ID) |
| 문서 형태 | 단일 self-contained HTML 파일 |
| 수명 | 기본 TTL + 수동 연장/영구 전환 |
| TTL 옵션 | 1일 / 7일 / 30일 / 영구, **기본 7일** |
| 관리 자격 | 계정 없음. 문서별 **이름 + 비밀번호** |
| 업로드 접근 | 게이트 없이 공개 (악용 완화책으로 보완) |
| 파일 크기 상한 | **10MB** |
| 서빙 | 단일 도메인 `/d/{id}` (별도 서브도메인 격리 안 함) |
| 배포 | Vercel + 개인 도메인 |
| 디자인 | toss.im 디자인 시스템 참고 |
| CSS | Tailwind CSS 4 (CSS-first) |

## 4. 기술 스택

- **프레임워크**: Next.js (App Router) on Vercel (Fluid Compute, Node.js 24)
- **HTML 저장**: Vercel Blob (public store) — `@vercel/blob`
- **메타데이터 / 만료 인덱스 / 레이트리밋**: Upstash Redis (Vercel Marketplace 연동) — `@upstash/redis`, `@upstash/ratelimit`
- **스케줄러**: Vercel Cron (`vercel.ts`의 `crons`)
- **ID 생성**: `nanoid` (URL-safe, 10자)
- **CSS**: Tailwind CSS 4 (`@tailwindcss/postcss` + `@import "tailwindcss"`)

## 5. 아키텍처 & 데이터 흐름

```
[업로드 페이지] --(HTML 파일 + 이름 + 비번 + TTL)--> [POST /api/upload]
       |                                                  |
       |                            1) HTML → Vercel Blob (public) → blobUrl
       |                            2) 메타 → Upstash Redis (doc:{id})
       |                            3) 만료시각 → Sorted Set (expiry:index)
       v
   [링크 즉시 반환: https://{도메인}/d/{id}]

[열람자] --GET /d/{id}--> [Next.js] → Redis 조회 → 만료 검사
                                          ├ 유효: Blob HTML 스트리밍 (text/html, X-Robots-Tag: noindex)
                                          └ 만료/없음: 만료 안내 페이지
```

## 6. 데이터 모델

### Vercel Blob (public store)
- HTML 본문. 경로: `docs/{id}.html`. `put(path, html, { access: 'public', contentType: 'text/html' })`.

### Upstash Redis
- `doc:{id}` (Hash):
  - `name` — 올린 사람/문서 이름 (표시용)
  - `passwordHash` — PBKDF2/scrypt + per-doc salt
  - `salt` — per-doc salt
  - `blobUrl` — Blob 객체 URL (서빙/삭제용)
  - `createdAt` — epoch ms
  - `expiresAt` — epoch ms 또는 `"never"`
  - `views` — 조회 카운트 (정수)
- `expiry:index` (Sorted Set):
  - score = `expiresAt`(epoch ms), member = `id`
  - **영구 문서는 등록하지 않음**

> **만료를 Redis 네이티브 TTL로 자동삭제하지 않는 이유**: 레코드가 사라지면 정리 시점에 `blobUrl`을 잃어 Blob 객체가 고아로 남는다. 대신 만료시각을 값으로 저장하고 ① 읽을 때 게으른 검사(authoritative) ② cron으로 sorted set을 훑어 Blob+레코드 동시 삭제 — 이 조합이 정확하고 비용도 회수된다.

## 7. 페이지 & API 라우트 (App Router)

| 경로 | 역할 |
|---|---|
| `/` | 업로드 폼 (반응형: 모바일=세로 카드, PC=좌우 2분할) |
| `POST /api/upload` | id 생성 → Blob put → Redis 저장 → `{ id, url }` 반환 |
| `GET /d/{id}` | 문서 열람. 만료 검사 후 HTML 서빙. `views` 증가 |
| `/d/{id}/manage` | 관리 페이지 (비번 입력 → 연장/삭제 UI) |
| `POST /api/manage/{id}` | 비번 검증 후 TTL 갱신(연장/영구) 또는 삭제 |
| `GET /api/cron/sweep` | Vercel Cron(매일). 만료분 Blob+Redis 삭제 |

## 8. 화면 설계 (UI)

### 8.1 업로드 페이지 `/` (반응형)
- **모바일**: 가운데 단일 카드 — 드롭존 → 이름 → 비밀번호 → 유효기간 pill → "링크 생성" 버튼 (세로 흐름)
- **PC**: 좌우 2분할 — 왼쪽 큰 드롭존, 오른쪽 설정(이름·비번·TTL·버튼)
- 유효기간 pill: 1일 / 7일(기본 선택) / 30일 / 영구
- 파일 검증: 확장자/`text/html`, 10MB 상한

### 8.2 업로드 완료 화면 (미니멀)
필수 요소만 (QR·Slack·썸네일 모두 제외):
- 생성된 링크 + **복사** 버튼
- "새 탭에서 열기" / "관리 페이지" 버튼
- 만료일 표시 (예: "7일 후 만료 · 6월 12일")
- ⚠️ **비밀번호 보관 경고** ("분실 시 연장·삭제 불가")

### 8.3 관리 페이지 `/d/{id}/manage`
- 문서 정보: 이름 · 올린 사람 · 만료일(D-day) · 조회수
- 관리 비밀번호 입력
- 연장: +7일 / +30일 / 영구 보관
- 즉시 삭제 (위험 강조 스타일)

### 8.4 만료 안내 페이지
- 만료된 링크 접근 시: ⏳ 아이콘 + "링크가 만료되었습니다" + "새 문서 올리기" 유도

## 9. TTL / 만료 메커니즘

- **만료 판정(정답)**: `/d/{id}` 읽을 때 `now > expiresAt`이면 만료 페이지. cron이 안 돌아도 정확.
- **연장**: manage에서 `expiresAt` 갱신 + sorted set score 갱신. 영구 전환 = sorted set에서 제거 & `expiresAt="never"`.
- **청소(비용 회수)**: 매일 cron이 `ZRANGEBYSCORE expiry:index 0 {now}`로 만료분을 찾아 Blob 객체 삭제 → `doc:{id}` 삭제 → sorted set에서 제거.

## 10. 보안 / 악용 완화 (게이트 없는 공개 업로드 보완)

- 업로드 크기 상한 10MB (base64 인라인 이미지 고려).
- 레이트 리밋: `@upstash/ratelimit`로 IP당 분당 N회 (예: 10회).
- 비밀번호는 PBKDF2/scrypt + per-doc salt 해시 저장 (평문 저장 금지). Node.js 런타임의 `crypto` 사용.
- 모든 문서 응답에 `X-Robots-Tag: noindex` → 검색 색인 차단.
- 업로드된 HTML은 사용자 콘텐츠이므로 그대로 렌더(자체 JS/CSS 동작 허용). 출처 격리는 이번 범위에서 제외(단일 도메인 결정).

## 11. 디자인 시스템 (toss.im 참고)

> 아래 토큰은 널리 알려진 Toss 디자인 언어를 기준으로 한 근사치다. 구현 시 실제 TDS와 대조해 미세 조정한다.

- **Primary**: Toss Blue `#3182F6`
- **텍스트**: `#191F28`(기본) / `#4E5968`(보조) / `#8B95A1`(흐림)
- **배경/보더**: `#FFFFFF` / `#F9FAFB` / `#F2F4F6` / 보더 `#E5E8EB`
- **위험(삭제)**: 레드 계열 `#F04452`
- **폰트**: Pretendard (Toss Product Sans 대체 오픈폰트)
- **모양**: 넉넉한 여백, 카드 라운드 16~20px, 부드러운 그림자, 큰 굵은 헤딩, 친근한 마이크로카피

### Tailwind CSS 4 설정 (CSS-first)
- `postcss.config.mjs` → `@tailwindcss/postcss` 플러그인
- `globals.css`:
  ```css
  @import "tailwindcss";
  @theme {
    --color-toss-blue: #3182F6;
    --color-toss-red: #F04452;
    --font-sans: "Pretendard", system-ui, sans-serif;
    /* 그레이 스케일 등 */
  }
  ```
- `tailwind.config.js` 불필요 (CSS-first).

## 12. 범위 밖 (YAGNI)

- 계정/OAuth 로그인
- 멀티파일/zip 업로드, 폴더 서빙
- 팀 전체 문서 대시보드 (계정이 없어 식별 불가)
- 별도 서브도메인 출처 격리
- QR / Slack / 미리보기 썸네일

## 13. 열린 항목 (구현 중 확정)

- Redis 마켓플레이스 통합의 정확한 env 변수명 (Vercel 연동 시 자동 주입)
- 레이트리밋 임계값 최종값
- Pretendard 폰트 로딩 방식 (CDN vs self-host)
