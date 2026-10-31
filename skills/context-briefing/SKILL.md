---
name: context-briefing
description: Assemble the self-contained brief a dispatched agent receives, including ticket, scope, constraints, and absolute report path.
---

# Context Briefing

## When to use

- A ticket is ready to dispatch to a Herdr tab or sub-agent.
- An agent needs all inputs in one place before starting work.

## Procedure

1. Copy the ticket ID, objective, and acceptance criteria verbatim from ticket-planning.
2. State the lane: ticket slug, base branch, and worktree path (from worktree-lanes).
3. List `may_change` and `must_not_change` paths exactly; never broaden scope.
4. Provide the absolute `report_root` and the report file path: `<report_root>/tickets/<TICKET>/reports/<persona>.md`.
5. Include relevant context: neighboring files, existing patterns, and prior reports to read.
6. State verification commands the agent must run before claiming completion.
7. State the board event contract: which events to append and when (report-and-board).
8. Keep the brief self-contained; the agent must not need to re-derive context.
9. End with the Execution Gate: wait for explicit "gas" before system-modifying commands.

## Checklist

- [ ] Ticket ID, objective, and acceptance criteria are verbatim.
- [ ] Scope paths are explicit and absolute where possible.
- [ ] Report path uses the absolute `report_root`, not a worktree-relative path.
- [ ] Verification commands are listed.
- [ ] No persona is told to invent scope or paths.

## Evidence

- The brief text handed to the agent.
- The agent's acknowledgment of scope and report path.

## Notes

- If a path is ambiguous, resolve it to an absolute path in the brief.
- Never let the agent infer scope from repository layout alone.