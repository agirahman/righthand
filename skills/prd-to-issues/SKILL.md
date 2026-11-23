---
name: prd-to-issues
description: Split a PRD into independent slices into .righthand/tasks/ with target files and contracts.
tier: sdlc
persona: palm
---

# PRD to Issues

## When to use

- A PRD is ready and must become executable slices.

## Procedure

1. Emit independent slices into `.righthand/tasks/<slice>.json`; one concern per slice.
2. Each slice names its target files, the contract it must honor, and the reusable test helper it may call.
3. Ensure slices are mergeable in any order with no shared mutable state.

## Checklist

- [ ] One concern per slice.
- [ ] Target files and contract named per slice.
- [ ] Slices independent (any order, no shared mutable state).

## Evidence

- The `.righthand/tasks/` slice set.
