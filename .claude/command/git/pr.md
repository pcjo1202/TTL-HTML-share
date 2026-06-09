---
description: 현재 브랜치 작업을 프로젝트 PR 플로우대로 PR로 생성한다. 컨펌 후 gh pr create.
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git push:*), Bash(gh pr:*), Bash(gh issue:*), Bash(gh auth:*), Bash(gh label:*)
---

# /git:pr

## 머지·PR 컨벤션

- 모든 머지는 **일반 머지(merge commit)**. `main`에는 **PR 없이 머지 금지**.
- **플로우**: `feature/*`(또는 작업 브랜치) → `main` PR.
- PR 제목은 `<type>(<scope>):` prefix 없는 **간결한 명사형**.

## 절차

1. `git status`/`git log`로 브랜치 상태를 확인한다. 미커밋 변경이 있으면 먼저 `/git:commit`을 실행한다.
2. base 브랜치는 `main`이다.
3. **이번 세션 작업 범위를 식별**한다: `git log origin/main..HEAD`로 전체, `git log origin/<branch>..HEAD`로 미push 커밋을 구분한다. 모호하면 사용자에게 확인한다.
4. `.github/PULL_REQUEST_TEMPLATE.md`가 있으면 구조를 유지해 본문을 작성한다. 관련 Issue가 있으면 `Closes #번호`.
5. `.github/CODEOWNERS`와 `gh auth status`로 본인을 제외한 reviewer를 결정한다(없으면 생략).
6. PR 초안을 사용자에게 보여주고 **컨펌**받는다.
7. 미push 커밋이 있으면 `git push -u origin <branch>` 후 PR을 생성한다.

   ```bash
   gh pr create \
     --title "<명사형 요약>" \
     --body "$(cat <<'EOF'
   {PR 본문}
   EOF
   )" \
     --assignee "@me" \
     --base main
   ```

8. 결과 출력(PR 번호·URL·reviewer·Closes).
