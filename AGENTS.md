# RightHand Contributor & Agent Guide

Welcome to **RightHand**! This guide is intended for human contributors and AI agents working on this repository to understand the project structure, contribution workflow, persona system conventions, and mandatory pre-submission checks so you do not lose direction.

---

## 1. Project Overview & Architecture

RightHand provides specialist AI agent personas and multi-agent orchestration across multiple coding harnesses:
- **`.commandcode-mod/`**: Command Code mod hooks and profile definitions.
- **`.pi-plugin/`**: Pi native extension (`.pi-plugin/extensions/righthand.ts`).
- **`.omp/`**: Oh My Pi native extension (`.omp/extensions/righthand.ts`).
- **`.opencode-plugin/`**: OpenCode server and TUI plugins.
- **`profiles/`**: Source persona profile definitions in Markdown with YAML frontmatter.
- **`skills/`**: Portable cross-harness skill definitions (`skills/righthand-<persona>/SKILL.md`).
- **`bin/`**: Unified CLI executable (`righthand switch`, `inject`, `list`, `off`).
- **`test/`**: Validation test suites for profiles, skills, and cross-harness manifests.

---

## 2. Public Contribution Workflow (Fork & Pull Request)

All external contributions follow the standard GitHub Fork and Pull Request model:

1. **Fork the Repository**:
   - Create a fork of `agirahman/righthand` to your own GitHub account.
2. **Create a Focused Topic Branch**:
   - Create a topic branch naming the scope: `feat/<feature-name>`, `fix/<bug-name>`, or `chore/<task-name>`.
3. **Keep Changes Minimal and Atomic**:
   - Follow the rule of smallest effective change. Do not refactor unrelated files or introduce new dependencies without discussion.
4. **Submit a Pull Request**:
   - Push your topic branch to your fork and open a Pull Request targeting `main` on `agirahman/righthand`.
   - Complete the PR template checklist in full.

---

## 3. Mandatory Pre-PR Verification Checks

Before submitting any Pull Request, you MUST run and verify all three local validation checks:

```bash
# 1. Validate all 11 persona profiles, 11 skills, and 10 cross-harness manifests
npm test

# 2. Typecheck TypeScript across all harness extensions (0 errors required)
npm run typecheck

# 3. Compile TypeScript output to dist/
npm run build
```

PRs with failing tests or type errors will not be merged.

---

## 4. Persona System & Skill Synchronization Conventions

Each persona is defined in `profiles/<name>.md` with frontmatter:
- **`mode: readonly`**: Inspection, review, architecture, security auditing, testing.
- **`mode: writer`**: Implementation tasks in isolated lanes created by Herdr outside this repository, never a `wt/` directory inside it.

When modifying or adding a persona in `profiles/`:
1. Ensure `profiles/<name>.md` has valid frontmatter.
2. Update capability references in `skills/` only when a new capability is added; profiles reference capabilities by name.
3. Update autocomplete lists in `.commandcode-mod/mods/righthand.ts`, `.pi-plugin/extensions/righthand.ts`, and `bin/state.js` if adding a new persona.
4. Run `npm test` to verify all 11 profiles, 11 skills, and 10 manifests pass validation.

---

## 5. Code Style Guidelines

- Use descriptive variable names.
- Follow existing patterns in the codebase.
- Extract complex conditions into meaningful boolean variables.
- Write clear, concise commit messages without automated bot trailers.

---

## 6. Scope Boundary: Development Only

Work in this repository stops once a pull request is open. The developer loop is:

1. Open an issue for a large task. A small task goes straight to a branch.
2. Create a topic branch: `feat/*`, `fix/*`, or `chore/*`. Never commit to `main`.
3. Edit the code.
4. Commit with a conventional commit message.
5. Push the branch to origin.
6. Open a pull request against `main`.

Review, security scanning, approval, merging, version bumps, tagging, npm publishing and GitHub releases belong to the maintainer. An agent must not run `gh pr merge`, `gh pr review`, `git tag`, `npm publish` or `gh release create`, and must not close or merge an open pull request.

Local verification before committing (`npm test`, `npm run typecheck`, `npm run build`) is still required. That is developer work, not review.

---

## Lessons

<!-- Newest on top. Delete what no longer applies. -->
- When integrating a branch, rebase onto `origin/main` and push with `--force-with-lease`, never a merge commit.
