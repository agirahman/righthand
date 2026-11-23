---
name: improve-codebase-architecture
description: Keep module boundaries deep and contracts tight while blocking over-engineering and huge diffs.
tier: sdlc
persona: thumb, middle
---

# Improve Codebase Architecture

## When to use

- A refactor risks coupling, over-engineering, or a giant diff.

## Procedure

1. Keep modules deep: a small interface hiding a large implementation.
2. Ensure inter-service contracts do not leak; add no new coupling for a simple change.
3. Reject over-engineering and giant diffs; take the smallest change that meets the contract.

## Checklist

- [ ] Module interface stayed small.
- [ ] No new coupling introduced.
- [ ] Diff is the smallest change that meets the contract.

## Evidence

- The before/after diff plus the contract it preserves.
