---
name: improve-codebase-architecture
description: "Scan for deepening opportunities with a fixed architecture vocabulary, report candidates visually, then grill the one the user picks and bound the resulting diff."
---
# Improve Codebase Architecture

Adapted from `mattpocock/skills` `improve-codebase-architecture`. Same deepening lens and report; the output lands in `.righthand/architecture/` and the vocabulary is fixed.
Source: https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md

Surface architectural friction and propose **deepening opportunities**: refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability, not novelty.

## When to use

- A refactor risks coupling, over-engineering, or a diff too large to review.
- Understanding one concept means bouncing between many small modules.
- The user asks where the architecture is weak, or a slice cannot be tested cleanly.

## Procedure

### 1. Use one vocabulary

Use exactly: **module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**. Do not drift into "component", "service", "API", or "boundary". A **shallow** module has an interface nearly as complex as its implementation. A **deep** module hides a large implementation behind a small interface.

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? "Concentrates" is the signal.

### 2. Scope before you scan

YAGNI. Deepening pays off by making future change easier, so weight recently changed code. If the user named a direction, take it. Otherwise walk `git log --oneline` for hot spots and let those paths pull attention first. If changes are scattered with no hot spot, widen the net.

### 3. Explore for friction

Read-only (pinky is the right persona for the sweep). Note where understanding one concept requires bouncing between many small modules, where modules are shallow, where pure functions were extracted only for testability while the real bugs hide in how they are called (no **locality**), where tightly coupled modules leak across their seams, and which parts are untested or hard to test through their current interface.

### 4. Report candidates

Write a self-contained HTML report to the OS temp directory so nothing lands in the repo: `%TEMP%` on Windows, `$TMPDIR` or `/tmp` elsewhere, named `architecture-review-<timestamp>.html`. Open it for the user and give the absolute path.

Each candidate card carries **Files**, **Problem**, **Solution**, **Benefits** in terms of locality and leverage and how tests would improve, a **Before / After** visualisation, and a **Recommendation strength** of `Strong`, `Worth exploring`, or `Speculative`. End with a **Top recommendation**. Do not propose interfaces yet; ask which candidate to explore.

### 5. Grill the chosen candidate

One grill-me session walks the constraints, the dependencies, the shape of the deepened module, what sits behind the seam, and which tests survive.

### 6. Record what was settled

Write the outcome to `.righthand/architecture/<topic>.md`. If a candidate is rejected for a load-bearing reason a future review would otherwise re-suggest, record that reason there too. Skip ephemeral and self-evident reasons.

### 7. Bound the change

Keep the interface small, add no coupling for a change that does not need it, and take the smallest diff that satisfies the contract. A deepening that cannot land as a reviewable slice is not a slice yet; sequence it per prd-to-issues, including expand, migrate, contract for a wide refactor.

## Checklist

- [ ] Vocabulary held to module, interface, depth, seam, adapter, leverage, locality.
- [ ] Deletion test applied to every shallow candidate.
- [ ] Scan scoped to recently changed code, not the whole tree.
- [ ] Report written outside the repo, opened for the user, candidates ranked.
- [ ] No interface proposed before the user picks a candidate.
- [ ] Accepted or rejected reasons recorded under `.righthand/architecture/`.
- [ ] The resulting diff is the smallest that satisfies the contract.

## Evidence

- The HTML report path, the picked candidate, and the before/after diff plus the contract it preserves.