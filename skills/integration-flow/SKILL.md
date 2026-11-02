---
name: integration-flow
description: Integrate a finished branch without conflicts: branch from a fresh main, rebase instead of merge, push with force-with-lease, and keep one pull request to one concern.
---

# Integration Flow

## When to use

- Before the first push on a ticket branch.
- Again whenever `main` moves under an open pull request.

## Procedure

1. `git fetch origin --prune`
2. starting a new ticket: create the branch from `origin/main`: `git switch -c feat/<scope>-<short-desc> origin/main`. Already inside the ticket branch: skip creation and verify the base with `git log --oneline -1 origin/main` and `git merge-base --is-ancestor origin/main HEAD`.
3. commit in small units with conventional messages
4. before pushing: `git status --short` must be empty; if it is not, commit or stash first, and never rebase with unstaged changes. Then `git fetch origin` and `git rebase origin/main`.
5. resolve, `git add -A`, `git rebase --continue`, repeat until clean
6. `git push -u origin HEAD --force-with-lease`
7. open the pull request: title from the conventional commit, body with What, Why, Verification and Risk
8. when `main` moves: repeat steps 4 and 6, the pull request updates itself

## Checklist

- [ ] `git grep -n '^<<<<<<<'` is empty
- [ ] `git log --oneline origin/main..HEAD` contains no merge commit
- [ ] `npm test` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] first push used `--force-with-lease`

## Evidence

- The command list with exit codes for fetch, rebase, and push.
- The push output showing --force-with-lease succeeded.

## Rules

- Never `git merge origin/main` into a feature branch, and never push a merge commit on a pull request branch.
- One pull request, one concern: two tickets that must edit the same file are sequenced, never run in parallel.
