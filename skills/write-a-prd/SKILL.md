---
name: write-a-prd
description: Produce a bounded PRD with explicit module contracts into .righthand/prd/.
tier: sdlc
persona: index
---

# Write a PRD

## When to use

- A feature needs a written PRD before it is sliced.

## Procedure

1. Write to `.righthand/prd/<feature>.md` only; the project tree is read-only for this skill.
2. Define each module's input/output schema and the A to B to C dependency path that must not be skipped.
3. Trace every requirement to a Must or Should from grill-me.

## Checklist

- [ ] PRD lives under `.righthand/prd/`, not the project tree.
- [ ] Each module names its input and output contract.
- [ ] No requirement without a MoSCoW trace.

## Evidence

- The PRD file with module contracts and dependency path.
