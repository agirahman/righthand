---
name: report-and-board
description: Define the report, review, and append-only board contract that agents and reviewers use to hand off verified results.
---

# Report and Board

## When to use

- An agent finishes or blocks on a ticket.
- A reviewer produces a verdict.
- Progress must be recorded for orchestration and merge gating.

## Procedure

1. Reports go to the absolute `report_root` from the brief: `.righthand/tickets/<TICKET>/reports/<persona>.md`.
2. Reviews go to `.righthand/tickets/<TICKET>/reviews/<persona>.md`.
3. Never write reports to a path relative to the agent's own worktree.
4. Append events to `.righthand/tickets/<TICKET>/board.jsonl`, one JSON object per line, append-only.
5. Each event has fields: `v`, `ts`, `ticket`, `persona`, `event`, plus event-specific fields.
6. Event vocabulary: `claim`, `progress`, `blocked`, `done`, `verdict`, `abandoned`.
7. Append `done` only after verification passes; include evidence in the report.
8. A review persona appends `verdict` with `pass` or `fail` (and severity findings).
9. Fold rule: a ticket is complete only when a `done` event exists and, if a review persona participated, a `verdict` with `pass`.
10. On block, append `blocked` with the reason and needed input; do not append `done`.

## Checklist

- [ ] Report and review paths use absolute `report_root`.
- [ ] Board file is append-only; no lines rewritten or deleted.
- [ ] Every event has `v`, `ts`, `ticket`, `persona`, `event`.
- [ ] `done` appears only with verification evidence.
- [ ] `verdict` uses `pass`/`fail` and references findings.

## Evidence

- The report file at the absolute path.
- The appended board line(s) with required fields.
- For completion: `done` event plus `verdict: pass` when reviewed.

## Notes

- Example event: `{"v":1,"ts":"2026-...","ticket":"T4","persona":"worker","event":"done"}`.
- Append with a single atomic line write; never rewrite the file.