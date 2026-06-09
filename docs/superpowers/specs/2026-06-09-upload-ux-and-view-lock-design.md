# 업로드 파일 UX 개선 + 열람 잠금 설계

- 작성일: 2026-06-09
- 상태: 승인됨 (구현 계획 대기)

## 목표

두 가지 기능을 추가한다.

1. **업로드 파일 등록 UX 개선** — 파일명만 보이던 것을 아이콘이 포함된 파일 칩으로 바꾸고, 제출 전에 선택한 파일을 교체/제거할 수 있게 한다.
2. **열람 잠금** — 문서 생성 시 잠금 여부를 설정하고(별도 열람 비밀번호), 잠긴 링크 접근 시 비밀번호 입력 후 열람하게 한다. 문서 목록에서 잠금 여부를 표시한다.

## 결정 사항 (확정)

- **F1 "수정" 범위**: 제출 전 파일 교체만. 생성된 문서의 본문 재업로드는 범위 밖. 데이터 모델 변경 없음.
- **열람 비밀번호**: 기존 "관리 비밀번호"(연장/삭제)와 **완전 별도**. 레코드에 열람 해시/솔트를 따로 저장.
- **잠금 해제 유지**: 세션 동안 기억(브라우저 세션 쿠키). 한 번 풀면 만료/세션종료 전까지 재입력 불필요.
- **목록 노출**: 이름 + 🔒 배지 표시. 이름·메타데이터는 그대로 보이고 본문만 보호.
- **게이트 구현 방식**: 접근 A — 라우트 핸들러 내장 게이트 + 무상태 쿠키.

## 현재 모델 (변경 전)

- 비밀번호는 "관리 비밀번호" 하나뿐(`passwordHash`/`salt`). 연장·삭제 용도.
- 문서 본문 `/d/{id}`는 링크만 있으면 누구나 열람 가능(잠금 개념 없음). `/docs` 목록도 공개(단, noindex).
- `d/[id]/route.ts`는 Node Route Handler로 Blob 본문을 프록시 서빙.

---

## 1. Feature 1 — 업로드 파일 칩 UI

`src/app/upload-form.tsx` 내부만 수정한다. 파일 선택 전/후 렌더를 분리한다.

- **선택 전**: 기존 점선 드롭존 `<label>` 유지(드래그앤드롭 그대로).
- **선택 후**: 드롭존 대신 **파일 칩 카드** 렌더.
  - 구성: `📄 파일 아이콘 + 파일명 + 용량(예: 24KB)` + 우측 `교체` / `제거` 버튼.
  - `교체`: `useRef`로 보관한 숨김 file input을 다시 연다.
  - `제거`: `setFile(null)` + input value 리셋.
- 칩 카드는 `<label>` 밖에 배치한다. 현재처럼 label로 감싸면 버튼 클릭이 파일 피커로 버블링되므로, 선택 후에는 label이 아닌 일반 카드로 렌더해 버블링을 차단한다.
- 단일 사용이므로 별도 컴포넌트로 분리하지 않고 폼 내부에 인라인 구현한다(single-use 추상화 금지 컨벤션).
- 파일 검증은 기존 `htmlFileError`(`src/lib/upload-file.ts`)를 그대로 재사용한다.

## 2. Feature 2 — 데이터 모델

`src/lib/store.ts`:

```ts
interface DocRecord {
  // ...기존 필드 유지
  viewPasswordHash?: string;  // 잠금 시에만 존재
  viewSalt?: string;
}
```

- `createDoc` 입력에 `viewPassword?: string` 추가. 값이 있으면 `hashPassword`로 해시해 `viewPasswordHash`/`viewSalt`에 저장한다.
- `DocSummary`에 `isLocked: boolean` 추가. 민감 필드 노출 금지 원칙에 따라 해시는 내보내지 않고 파생 boolean만 노출한다.
- `listDocs`에서 `isLocked: record.viewPasswordHash != null`로 채운다.

## 3. 새 모듈

### `src/lib/view-lock.ts` (순수 함수)

- `unlockToken({ id, viewPasswordHash }): string` = `sha256(\`${id}:${viewPasswordHash}\`)`의 hex.
  - `viewPasswordHash`는 Redis에만 존재하는 서버 전용 값이므로, 별도 시크릿 env 없이도 클라이언트가 토큰을 위조할 수 없다.
- `isValidUnlockCookie({ cookieValue, id, viewPasswordHash }): boolean` — `timingSafeEqual`로 비교.
- 인자 2개 초과 시 객체 전달 컨벤션을 따른다.

### `src/lib/lock-page.ts`

- `lockPageHtml({ id, error? }): string` — `expiry-page.ts`와 동일한 자체완결 HTML 패턴.
- 내용: 비밀번호 입력 폼(`method="POST"`, action `/d/{id}`, 필드 `password`), 오류 시 인라인 에러 메시지, `<meta name="robots" content="noindex">`, toss 톤의 인라인 스타일.

## 4. 서빙 / 게이트 흐름

`src/app/d/[id]/route.ts` (Node Route Handler):

**GET**
1. 문서 없음 또는 만료 → 기존 410 만료 페이지(변경 없음).
2. 잠금 아님(`viewPasswordHash` 없음) → 기존대로 본문 서빙(변경 없음).
3. 잠금:
   - 요청 쿠키 `unlock_{id}` 파싱 → `isValidUnlockCookie`로 검증.
   - 유효 → 본문 서빙 + `incrementViews`.
   - 무효/없음 → `lockPageHtml({ id })` 반환(200, noindex). 조회수 증가하지 않음.

**POST** (신규, 같은 route.ts에 export)
1. 문서 없음/만료 → 410. 잠금 아님 → `/d/{id}`로 리다이렉트.
2. form `password` 검증(`verifyPassword`):
   - 성공 → `Set-Cookie: unlock_{id}=<토큰>` (세션 쿠키: `Max-Age`/`Expires` 없음 = 브라우저 세션 동안 유지, `httpOnly`, `SameSite=Lax`, `Secure`, `path=/d/{id}`) + 303 리다이렉트 `/d/{id}`.
   - 실패 → `lockPageHtml({ id, error })` 401.

## 5. 업로드 경로

`src/app/upload-form.tsx`:
- **열람 잠금 토글**(체크박스/스위치) 추가. 켜면 **열람 비밀번호** 입력 노출.
- 토글이 켜졌는데 열람 비밀번호가 비어 있으면 제출 차단(toast).
- 제출 시 FormData에 `lock`/`viewPassword` 포함.

`src/app/api/upload/route.ts`:
- form에서 `lock`/`viewPassword` 파싱 → `createDoc`에 전달.
- `lock`이 켜졌는데 `viewPassword`가 비어 있으면 400.

## 6. 문서 목록

`src/app/docs/page.tsx`:
- 문서명 옆에 `isLocked`일 때 **🔒 배지** 표시. 이름·등록일·만료·조회수는 그대로.
- 목록은 이미 noindex라 잠금 표시와 일관.

## 7. 에러 처리 / 보안

- 열람 비밀번호 무차별 대입 방지: `src/lib/ratelimit.ts`에 **`unlockRatelimit`** 추가. POST 언락을 IP 단위로 제한, 초과 시 429.
- 비번 불일치는 무시하지 않고 게이트에 인라인 에러로 표시(빈 catch 금지 컨벤션 준수).
- 쿠키는 `httpOnly`로 JS 접근 차단, `path=/d/{id}`로 다른 문서에 재사용 불가.

## 8. 테스트

`tests/`는 `src/` 트리 미러링, `@/` 별칭, Redis·Blob은 `vi.mock`.

- `tests/lib/view-lock.test.ts`: 토큰 결정성(같은 입력 → 같은 토큰), 유효/무효 쿠키 검증, 다른 해시면 무효.
- `tests/lib/store.test.ts`(확장):
  - `createDoc({ viewPassword })` → `viewPasswordHash`/`viewSalt` 저장.
  - `listDocs` → 잠금 문서 `isLocked:true`, 무잠금 `isLocked:false`, 해시·솔트 미노출.
- `tests/app/api/upload`: `lock`/`viewPassword` 파싱(성공 / lock=on·viewPassword 누락 시 400).
- F1(파일 칩)은 상호작용 UI라 단위테스트 생략. 파일 검증은 기존 `htmlFileError` 테스트로 커버.

## 범위 밖 (이번 작업 아님)

- 생성된 문서 본문 재업로드/편집.
- 관리 페이지에서 잠금 설정 변경(이번엔 생성 시점에만 설정).
- 열람 비밀번호 분실 복구(관리 비밀번호로 삭제 후 재업로드).
