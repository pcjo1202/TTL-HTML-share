---
description: 프로젝트 브랜치 컨벤션대로 새 작업 브랜치를 생성한다.
argument-hint: '<type> <설명> (예: feature 문서-목록)'
allowed-tools: Bash(git status:*), Bash(git fetch:*), Bash(git checkout:*), Bash(git branch:*), Bash(git pull:*)
---

# /git:branch

## 브랜치 컨벤션

- 형식: `<type>/<branch-name>` (branch-name = 케밥 케이스)
- **type**
  - `feature/` — 새 기능·서브 태스크
  - `feature/qa-` — QA 이슈 수정
  - `hotfix/` — 핫픽스
  - `performance/` — 리팩토링·성능 개선
  - `fix/` — 버그 수정
  - `refactor/` — 리팩토링
  - `docs/` — 문서 수정
  - `chore/` — 빌드·패키지·CI
  - `test/` — 테스트
  - `style/` — 스타일 수정
- 모든 작업 브랜치는 `main`에서 직접 분기한다.
- `main` 직접 커밋 금지.

## 절차

1. 인수에서 브랜치 타입과 설명을 파악한다. 부족하면 사용자에게 묻는다.
2. 컨벤션대로 타입·이름(케밥)을 정하고 분기 기준이 `main`임을 확인해 **사용자에게 컨펌**받는다.
3. `git fetch origin`으로 최신화 후 `git checkout -b <type>/<name> origin/main`으로 브랜치를 생성한다.
4. 결과 출력:

   ```
   ## 브랜치 생성 완료
   - 브랜치: feature/docs-list-page
   - 분기 기준: main
   ```
