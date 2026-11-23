---
name: grill-me
description: "Interview the requester relentlessly, one round at a time, until scope and contract are shared understanding. Then hand a locked scope to write-a-prd."
tier: sdlc
persona: index
---
# Grill Me

Adapted from `mattpocock/skills` `grilling` (the `grill-me` entry point). The interview discipline is unchanged; the output is a RightHand scope lock.
Source: https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md
Source: https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md

## When to use

- A request is vague, green-field, or its scope is contested.
- A contract must be pinned down before any slice is cut or any code is written.
- The user says "grill me", "stress-test this", or pushes back on a plan.

## Procedure

### 1. Map the design tree

Every decision branches into the decisions that hang off it. Write the tree down before the first question. The tree is the artifact; the questions only walk it.

### 2. Work the frontier in rounds

The **frontier** is every decision whose prerequisites are already settled: the questions you can ask now without guessing at answers you have not heard. Ask the whole frontier in one round, then wait for answers before the next round.

Number each question and give your recommended answer. Word it so "yes" accepts the recommendation.

```text
Q1 - <question title>: <question body, may carry several options>
Recommended: <your answer>

---

Q2 - <question title>: <question body>
Recommended: <your answer>
```

Each round of answers pushes the frontier outward and unblocks questions that depended on them. A question whose answer depends on another still open this round belongs to the next round.

### 3. Facts are your job, decisions are the user's

Never ask for a fact you can look up. When a frontier question needs one from the environment, dispatch a read-only exploration (pinky, fresh context) to find it and keep asking the rest of the frontier in the meantime. Only the questions downstream of that fact wait.

### 4. Collapse the tree into MoSCoW

When the frontier is empty, fold every settled decision into one MoSCoW paragraph: Must, Should, Could, Won't. One paragraph, not a document. Every later slice traces back to a Must or Should, and a Won't stays a Won't.

### 5. Stop at the lock

Do not slice tickets, do not write code, do not open a PR until the requester confirms the shared understanding. Then hand the locked scope to write-a-prd.

## Checklist

- [ ] Design tree written, every branch visited, nothing silently assumed.
- [ ] One frontier per round; every question numbered with a recommended answer.
- [ ] No question asked that a lookup could answer.
- [ ] MoSCoW collapsed into one paragraph and confirmed by the requester.
- [ ] No code written before the lock.

## Evidence

- The design tree, the round log, and the locked MoSCoW paragraph, recorded on the ticket (`.righthand/tickets/<ID>/`).