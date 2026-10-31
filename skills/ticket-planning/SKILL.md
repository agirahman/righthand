---
name: ticket-planning
description: Decompose an initiative into atomic, ticket-scoped units with a clear contract, dependencies, and acceptance criteria before any implementation starts.
---

# Ticket Planning

## When to use

- A user request spans more than one file or role.
- Work must be split across Herdr tabs or writer lanes.
- Acceptance criteria are not yet explicit.

## Procedure

1. Restate the initiative in one sentence and list the observable outcomes.
2. Identify the roles needed (readonly vs writer) and which outputs each produces.
3. Split into atomic tickets: one concern, one owner, one lane. Name them `T<n>-<slug>`.
4. For each ticket write the contract:
   - Objective (one sentence).
   - Scope: files/dirs that may change; files that must not.
   - Acceptance criteria as runnable checks (command + expected result).
   - Dependencies: ticket IDs that must finish first.
   - Base branch/ticket for stacked lanes.
5. Order tickets by dependency; mark parallel-safe groups.
6. Confirm no two tickets write the same file unless sequenced.
7. Hand each ticket to context-briefing before dispatch.

## Checklist

- [ ] Every ticket has an objective, scope, and acceptance criteria.
- [ ] Dependencies are explicit and acyclic.
- [ ] No ticket mixes readonly review with writer implementation.
- [ ] Acceptance criteria are commands, not prose.
- [ ] Scope lists both may-change and must-not-change paths.

## Evidence

- The ticket list with IDs, owners, dependencies, and acceptance criteria.
- A dependency ordering (or parallel groups) agreed before dispatch.