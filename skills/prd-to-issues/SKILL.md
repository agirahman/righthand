---
name: prd-to-issues
description: "Break a locked PRD into tracer-bullet vertical slices with explicit blocking edges, published under .righthand/tasks/. Wide refactors expand-contract instead."
tier: sdlc
persona: palm
---
# PRD to Issues

Adapted from `mattpocock/skills` `to-tickets`. Same tracer-bullet slicing and blocking edges; tickets land under `.righthand/tasks/` for the Herdr board.
Source: https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md

## When to use

- A PRD is approved and must become executable, independently verifiable slices.
- A plan or a long conversation needs cutting into work an agent can finish in one context window.

## Procedure

### 1. Gather context

Work from the conversation and the PRD. If given a path or ticket reference, read its full body and comments before slicing.

### 2. Explore only if you have not already

Slice titles and contracts use the project vocabulary from the area being touched. Look for prefactoring that makes the implementation easy, then make the easy change.

### 3. Cut vertical slices

Each slice is a **tracer bullet**: a narrow but complete path through every layer, demoable or verifiable on its own, sized to fit one fresh context window. Vertical, never a horizontal slice of a single layer. Prefactoring comes first as its own slice.

### 4. Give every slice its blocking edges

A slice declares the slices that must complete before it can start. No blockers means it can start immediately. Work the frontier, which is any slice whose blockers are done.

**Wide refactor is the exception.** One mechanical change whose blast radius fans across the codebase cannot land green as a vertical slice. Sequence it **expand, migrate, contract**: add the new form beside the old, migrate call sites in batches sized by blast radius (each batch blocked by the expand), then delete the old form in a slice blocked by every batch. When batches cannot stay green alone they share an integration branch that blocks one final integrate-and-verify slice.

### 5. Quiz the requester before publishing

Present the numbered breakdown with each slice's title, blockers, and the end-to-end behavior it delivers. Ask whether the granularity is right, whether each edge genuinely gates, and whether any slice should merge or split. Iterate until approved.

### 6. Publish

Write one file per slice to `.righthand/tasks/<slice>.json` (or the board for this ticket), numbered in dependency order, blockers first. Never one combined file.

```markdown
# <NN>: <slice title>

What to build: the end-to-end behavior this slice makes work, from the user's perspective.
Blocked by: the slices that gate this one, or "none".
Contract: the interface this slice honors and the files it may touch.
Tests: the existing scaffolding it reuses.

- [ ] Acceptance criterion
```

### 7. Independence

Slices are mergeable in any order with no shared mutable state. If two slices must write the same file, key, or branch, either order them with a blocking edge or merge them into one slice.

## Checklist

- [ ] Every slice is vertical, demoable alone, and fits one context window.
- [ ] Every slice names its blockers, its contract, and its target files.
- [ ] Prefactoring sliced first; wide refactors sequenced expand, migrate, contract.
- [ ] No two slices share mutable state without a blocking edge.
- [ ] Breakdown approved by the requester before writing files.

## Evidence

- The approved numbered breakdown and the published slice files under `.righthand/tasks/`.