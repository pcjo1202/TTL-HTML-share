---
description: 변경사항을 논리 단위로 묶어 프로젝트 Git 컨벤션대로 커밋한다. push 전 컨펌.
argument-hint: '[추가 지시(선택)]'
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*), Bash(git push:*), Bash(git branch:*), Bash(npm run lint:*), Bash(npm run format:*)
---

# /git:commit

## 커밋 컨벤션

- 커밋은 **작업 브랜치에서만**. `main` 직접 커밋 금지.
- 메시지 형식: `<type>(<scope>): <message>` — **scope**는 케밥 케이스, **message**는 한글·구어체(~합니다)
- **type**
  - `feat` — 새 기능·API 연동
  - `fix` — 버그/이슈 수정
  - `style` — 로직 외 수정(포맷팅·세미콜론 등)
  - `perf` — 성능 개선
  - `refactor` — 동작 변경 없는 구조 개선
  - `docs` — 문서·주석
  - `chore` — 빌드·패키지·CI 등 코드 외 작업
  - `test` — 테스트
  - `init` — 최초 프로젝트 구축
- 커밋은 최대한 잘게 쪼개어 **단일 행위 단위**로.
- 타입 경계: 포맷·네이밍만=`style` / 동작 동일·구조 개선=`refactor` / 수치 개선=`perf` / 설정·버전=`chore` / 문서만=`docs`.

## 절차

1. 현재 브랜치를 확인한다 — `main`이면 커밋을 중단하고 `/git:branch`로 작업 브랜치 생성을 안내한다.
2. `npm run lint`로 검증한다. 실패하면 `npm run format` 후 재시도하고, 그래도 실패하면 사용자에게 알리고 중단한다.
3. `git status`와 `git diff`(staged/unstaged)로 변경을 분석한다.
4. 변경을 **논리적 작업 단위**로 그룹핑한다(같은 기능=한 커밋, 설정/문서는 별도 커밋).
5. `git log --oneline -10`으로 최근 커밋 스타일을 확인한다.
6. 그룹별로 **해당 파일만** `git add <파일들>`(절대 `git add -A`/`git add .` 금지) 후 HEREDOC으로 커밋한다 — **body는 필수**("무엇을 왜").
7. **커밋 후 push 금지.** 결과를 보여주고 push 컨펌을 받는다. 승인 시 `git push`, 거절 시 아무것도 안 한다.

## 커밋 명령 형식

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <message>

<body(필수)>

<footer(선택)>
EOF
)"
```

## Body / Footer

- **body (필수)**: 모든 커밋에 작성 — "무엇을 왜" 중심으로 자유 형식.
- **footer (선택)**: 이슈 연결 시 `Closes #번호` / `Refs #번호`. Breaking Change는 `BREAKING CHANGE: 설명`.

```
feat(docs): 문서 목록 페이지를 추가합니다

등록된 문서를 최신순으로 보여주는 SSR 목록 페이지를 추가합니다.

Closes #1
BREAKING CHANGE: listDocs 반환 타입이 DocSummary로 변경됩니다
```

## push 컨펌 출력

```
## 커밋 완료
1. abc1234 feat(docs): 문서 목록 페이지를 추가합니다
2. def5678 chore(eslint): ESLint 규칙을 업데이트합니다

push 하시겠습니까? (브랜치: feature/docs-list-page → origin)
```
