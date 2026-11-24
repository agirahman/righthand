---
name: report-and-board
description: Define the machine-readable report envelope, shared sections, and append-only board contract that agents and reviewers use to hand off verified results.
---
# Report and Board

## When to use

- An agent finishes or blocks on a ticket.
- A reviewer produces a verdict.
- Progress must be recorded for orchestration and merge gating.

## Procedure

Write at the absolute `report_root` from the brief: reports to `tickets/<TICKET>/reports/<persona>.md`, reviews to `tickets/<TICKET>/reviews/<persona>.md`; never a worktree-relative path.

Every report and review file opens with a YAML frontmatter envelope, keys in this exact order:

```yaml
ticket: <T##>
persona: <persona>
kind: report | review
status: completed | partial | blocked
verdict: pass | fail
commit: <sha> | none
round: <n>
```

`verdict` is present only in `kind: review` files and omitted from reports. `commit` is the lane commit sha or `none`. `round` starts at 1.

After the envelope, every report carries these three shared sections, in order: `## Outcome` (what happened, 1-3 sentences), `## Verification` (the commands or manual checks that prove it, with results), `## Risks & Follow-up` (open risks and follow-up tickets, or `None open`). A persona then adds only its own extra sections, declared in its profile.

Board events append to `.righthand/tickets/<TICKET>/board.jsonl`, one JSON object per line, append-only:

1. Every event has fields `v`, `ts`, `ticket`, `persona`, `event`, plus event-specific fields.
2. Event vocabulary: `claim`, `progress`, `blocked`, `done`, `verdict`, `abandoned`.
3. Append `done` only after verification passes; include evidence in the report.
4. A review persona appends `verdict` with `pass` or `fail` and severity findings.
5. Fold rule: a ticket is complete only when a `done` event exists and, where a review persona participated, a `verdict` of `pass`.
6. On block, append `blocked` with the reason and needed input; never append `done`.
7. Append with a single atomic line write; never rewrite the file.

## Checklist

- [ ] Report and review files open with the envelope, keys in the fixed order.
- [ ] `verdict` only in reviews; `status` in every file.
- [ ] The three shared sections appear, in order, after the envelope.
- [ ] Board file is append-only; no lines rewritten or deleted.
- [ ] Every event has `v`, `ts`, `ticket`, `persona`, `event`.
- [ ] `done` appears only with verification evidence.

## Evidence

- The report or review file at the absolute path, with envelope and shared sections.
- The appended board line(s) with required fields.
- For completion: a `done` event plus `verdict: pass` when reviewed.
