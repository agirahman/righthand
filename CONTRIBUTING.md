# Contributing to RightHand

Thank you for your interest in contributing to **RightHand**! RightHand provides specialized AI personas and multi-agent orchestration for coding harnesses across developer workflows.

---

## Architecture Overview

RightHand supports multiple coding harnesses through dedicated, isolated harness folders and a shared persona core:

```
righthand/
├── .commandcode/         # Command Code mod, manifests, and profiles
├── .pi/                  # Pi native extension (.pi/extensions/righthand.ts)
├── .omp/                 # Oh My Pi native extension (.omp/extensions/righthand.ts)
├── .opencode/            # OpenCode server plugin (.opencode/plugins/righthand.js)
├── bin/                  # Unified CLI (`righthand switch`, `inject`, `list`, `off`)
├── profiles/             # Source persona profiles (Markdown with YAML frontmatter)
├── skills/               # Portable cross-harness skill definitions (SKILL.md)
├── scripts/              # Herdr multiplexer spawn helpers
└── test/                 # Test suites for profiles, skills, and manifests
```

---

## Persona System Conventions

Each persona is defined in `profiles/<name>.md` using YAML frontmatter:

```yaml
---
name: backend
role: Backend Engineer
mode: writer
tab: backend
---
```

### Modes
- **`readonly`**: For inspection, code review, architecture planning, security auditing, and test design. Agents in readonly mode do not modify implementation files.
- **`writer`**: For implementation tasks (frontend, backend, devops, worker). Agents work in isolated git worktree lanes (`wt/<ticket>-<slug>`).

### Synchronization
When modifying or adding a persona in `profiles/`:
1. Ensure `profiles/<name>.md` has valid frontmatter.
2. Update capability references in `skills/` only when a new capability is added; profiles reference capabilities by name.
3. Update autocomplete lists in `.commandcode/mods/righthand.ts`, `.pi/extensions/righthand.ts`, and `bin/state.js` if a new persona is added.

---

## Local Development & Testing

### Prerequisites
- Node.js >= 18
- npm or pnpm

### Testing
Run the test suites before submitting any changes:

```bash
# Validate all persona profiles and cross-harness manifests
npm test

# Typecheck TypeScript files across all harness extensions
npm run typecheck

# Build compiled output to dist/
npm run build
```

---

## Reporting Issues

Before creating a new issue, please search existing issues to avoid duplicates.

1. **Bug Reports**:
   - Use `.github/ISSUE_TEMPLATE/bug_report.yml` to specify target harness, persona, RightHand version, OS, and reproduction steps.
2. **Feature & Persona Proposals**:
   - Use `.github/ISSUE_TEMPLATE/persona_feature.yml` to propose new personas, skill expansions, or cross-harness integrations.

---

## Pull Request Guidelines

1. **Create a Topic Branch**:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Commit Hygiene**:
   - Write clear, concise commit messages.
   - Do not include automated bot trailers or unrelated file changes.
3. **Verify Everything Locally**:
    - `npm test` must pass (11/11 profiles, 11/11 skills, 10/10 manifests).
   - `npm run typecheck` must pass with 0 errors.
   - `npm run build` must compile clean to `dist/`.
4. **Submit PR**:
   - Open a pull request targeting the `main` branch on `agirahman/righthand`.
   - Complete all sections in `.github/PULL_REQUEST_TEMPLATE.md`.
5. **Main Branch Protection & Merge Requirements**:
   - All PRs require at least 1 review approval and 3 passing CI checks (`Validate Profiles & Skills`, `Typecheck TypeScript`, `Build Distribution`) before merging.
