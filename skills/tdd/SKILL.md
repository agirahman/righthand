---
name: tdd
description: One Red/Green/Refactor cycle per slice, reusing the test scaffolding scan mapped.
tier: sdlc
persona: thumb
---

# TDD

## When to use

- A slice is being implemented.

## Procedure

1. One test per iteration: Red to Green to Refactor, in the slice's worktree only.
2. Reuse the test scaffolding and fixtures scan mapped; never add a duplicate test setup.
3. Close the slice on a green gate; a red gate feeds the next retry.

## Checklist

- [ ] One test per iteration.
- [ ] Existing scaffolding reused, not duplicated.
- [ ] Green gate (test / lint / typecheck) closes the slice.

## Evidence

- The failing-then-passing test run for the slice.
