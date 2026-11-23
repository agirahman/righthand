---
name: write-a-prd
description: "Synthesize the grilled conversation into a bounded PRD with explicit seams and module contracts, written under .righthand/prd/. No new interview."
---
# Write a PRD

Adapted from `mattpocock/skills` `to-spec`. Same synthesis discipline and template; the artifact lands under `.righthand/prd/` and each module carries a bounded contract.
Source: https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md

## When to use

- The scope is locked by grill-me and needs one written source of truth.
- A feature is big enough that slices must agree on an interface first.

## Procedure

### 1. Do not re-interview

Synthesize what is already known. If a decision is genuinely missing, go back to grill-me for one round rather than inventing an answer in the PRD.

### 2. Sketch the seams before writing

A **seam** is the public boundary where behavior is observed without reaching inside. Prefer an existing seam over a new one, and take the highest seam available. Fewer seams is better; the ideal is one. Confirm the seam list with the requester before writing.

### 3. Write to `.righthand/prd/<feature>.md`

The project tree is read-only for this skill. One file per feature. Use the template below.

```markdown
# <Feature>

## Problem Statement
The problem from the user's perspective.

## Solution
The solution from the user's perspective.

## User Stories
A long numbered list, each: As an <actor>, I want a <feature>, so that <benefit>.

## Implementation Decisions
- Modules built or modified, and the interfaces those modules expose.
- The A to B to C dependency path that must not be skipped.
- Schema changes, API contracts, and the shape behind each seam.
- Do NOT include file paths or code snippets; they go stale.

## Testing Decisions
- What makes a good test here: external behavior only, never internals.
- Which modules are tested, at which seam.
- Existing test scaffolding a slice can reuse (never duplicate setup).

## Out of Scope
The Won't list from grill-me, restated as things this PRD does not deliver.

## Further Notes
Anything that does not fit above.
```

### 4. Trace every requirement

Each user story and each implementation decision traces to a Must or Should from the locked MoSCoW. A requirement with no trace is either scope creep or a missing grill round.

### 5. Keep contracts explicit

For each module, name its input shape, its output shape, and the errors it may raise. A slice that cannot satisfy a stated contract goes back for a contract change, not a silent deviation.

## Checklist

- [ ] PRD under `.righthand/prd/`, never in the project tree.
- [ ] Seams agreed with the requester, existing seams preferred, as few as possible.
- [ ] Every module names its input and output contract and its position on the A to B to C path.
- [ ] Every requirement traces to a Must or Should.
- [ ] Out of Scope restates the Won't list.
- [ ] No file paths or code snippets that will go stale.

## Evidence

- The PRD file, plus the seam list the requester approved.