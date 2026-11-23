---
name: triage-issue
description: Map the read-only blast radius and call stack for a bug, then file the analysis into .righthand/triage/.
tier: sdlc
persona: pinky
---

# Triage Issue

## When to use

- A bug or report needs a bounded analysis before a fix.

## Procedure

1. Read-only: map the blast radius (affected modules and dependencies) and the call stack before writing anything.
2. Find and link the existing test scaffolding a fix can reuse.
3. Write the analysis to `.righthand/triage/<issue>.md` with a slice cut that fits the blast radius.

## Checklist

- [ ] No writes to the project during triage (read-only).
- [ ] Blast radius and call stack mapped.
- [ ] Existing test scaffolding linked.

## Evidence

- The `.righthand/triage/<issue>.md` analysis.
