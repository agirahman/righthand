---
name: worktree-lanes
description: Create and manage isolated Herdr worktree lanes for ticket-scoped writes, keeping the main checkout untouched.
---

# Worktree Lanes

## When to use

- A writer persona will modify files for a ticket.
- Parallel agents need isolated checkouts to avoid conflicts.
- Tickets stack on prior ticket changes.

## Procedure

1. Create a lane with: `herdr worktree create --cwd <main checkout> --branch <ticket-slug> --base <base> --label <role>-<ticket> --no-focus`.
2. `--cwd` is required once a linked worktree already exists; always pass the main checkout path.
3. Lanes live outside the repository under Herdr's managed path; never create a `wt/` directory in the repo.
4. Branch naming: `<ticket>-<slug>` (e.g. `T4-capabilities`). One lane per ticket.
5. Stack tickets by passing the prior ticket branch as `--base`.
6. Work only inside the lane; never edit the main checkout.
7. After the gate passes, clean up with `herdr worktree remove --workspace <id>`.
8. Do not remove a lane with uncommitted or unmerged changes unless confirmed.

## Checklist

- [ ] `--cwd` points at the main checkout, not a worktree.
- [ ] Branch name follows `<ticket>-<slug>`.
- [ ] No `wt/` directory created in the repository.
- [ ] Lane removed only after gate passes.
- [ ] Main checkout left clean.

## Evidence

- The lane path and branch name.
- `git status` output from both lane and main checkout.

## Notes

- Never create `wt/` inside the repository; lanes live under Herdr's managed path.
- Confirm the main checkout is clean before creating a lane.