---
name: tdd
description: "The red to green loop, with seams agreed first, vertical tracer-bullet slices, and the anti-patterns that make tests worthless."
tier: sdlc
persona: thumb
---

# Test-Driven Development

Adapted from `mattpocock/skills` `tdd` (including its tests and mocking references). The loop is unchanged; the seam must be agreed and the scaffolding reused.
Source: https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md
Source: https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/tests.md
Source: https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/mocking.md

TDD is the red to green loop. Every section below applies on every cycle: consult them before and during the loop, not after.

## When to use

- Implementing any slice of a PRD.
- Fixing a bug test-first.
- The user mentions red-green-refactor or asks for integration tests.

## Procedure

### 1. Agree the seams before writing a test

A **seam** is the public boundary where you observe behavior without reaching inside. Tests live at seams, never against internals. Write down the seams under test and confirm them with the requester. No test is written at an unconfirmed seam. Give each seam one line on what it catches and what it misses.

### 2. Reuse the existing scaffolding

Search for test helpers, fixtures, and setup that already exist for this area and reuse them. Never add a second setup for something already covered. Duplicate scaffolding is the defect, not a convenience.

### 3. Run vertical slices, not horizontal ones

One test, then one implementation, then repeat. Each test is a tracer bullet that responds to what the last cycle taught. Writing all tests first tests imagined behavior, goes insensitive to real change, and commits to structure before the implementation is understood.

### 4. Red before green

Write the failing test first. Then write only enough code to pass it. Do not anticipate future tests or add speculative features. One seam, one test, one minimal implementation per cycle.

### 5. Refactoring is not part of the loop

Refactoring belongs to the review stage (the code-review skill), not the red to green cycle. Finish the green, then review.

### 6. Close on the gate

A green gate (test, lint, typecheck) closes the slice. A red gate feeds the next retry with the failure as context; it never closes a slice.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely and the tests should not. A good test reads like a specification: "user can checkout with a valid cart" tells you exactly what capability exists and survives refactors because it does not care about internal structure.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel. The tell: the test breaks on a refactor while behavior is unchanged.
- **Tautological**: the assertion recomputes the expected value the way the code does, so it passes by construction and can never disagree. Expected values come from an independent source of truth: a known-good literal, a worked example, the PRD.
- **Horizontal slicing**: all tests first, then all implementation. Covered above; work vertically instead.

## What to mock

Mock at **system boundaries** only: external APIs, a database (prefer a real test database), time and randomness, and sometimes the file system.

Do not mock your own modules, internal collaborators, or anything you control. A test that mocks an internal collaborator is testing the mock.

At a system boundary, design the interface so it is easy to mock: pass the dependency in rather than constructing it inside, and prefer one specific function per external operation over a single generic fetcher with conditional logic. Each mock then returns one known shape, test setup has no branching, and it is obvious which endpoints a test exercises.
## Checklist

- [ ] Seams written down and confirmed before the first test.
- [ ] Existing scaffolding reused; no duplicate setup.
- [ ] Every cycle: failing test, minimal code, green.
- [ ] Assertions on observable behavior, with independent expected values.
- [ ] Refactoring deferred to review, not smuggled into the loop.
- [ ] Slice closed on a green test, lint, and typecheck gate.

## Evidence

- The failing-then-passing run for each cycle, and the confirmed seam list.