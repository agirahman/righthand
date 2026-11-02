---
name: dispatch
description: Launch a ticket-scoped agent in another harness: provision the lane, start the agent with the right persona and model, submit the brief, observe, collect, gate, and clean up.
---

# Dispatch

## When to use

- A ticket is ready to delegate to an agent in a supported harness.
- The orchestrator needs to launch work in another harness (Command Code, Pi, OMP, OpenCode, Claude Code, Cursor, Codex, Kimi).
- A writer or readonly persona must run in an isolated lane with a verified model from `righthand config <persona>`.

## Adapters

Harness id, launch command, persona injection, model selection, prompt submission, and caveats. Unverified cells say `unverified`.

| Harness id | Launch command | Persona injection | Model selection | Prompt submission | Caveat |
|---|---|---|---|---|---|
| commandcode | `righthand launch <persona> --cwd <lane>` | `--mod-option default=<persona>` | `-m <model>` (value from `righthand config <persona>`; omitted when `model=` is empty) | `herdr pane send-text <pane> "<prompt>"` then `herdr pane send-keys <pane> enter` | See verified mechanics below. |
| pi | unverified | unverified | unverified | unverified | unverified |
| omp | unverified | unverified | unverified | unverified | unverified |
| opencode | unverified | unverified | unverified | unverified | unverified |
| claude-code | unverified | unverified | unverified | unverified | unverified |
| cursor | unverified | unverified | unverified | unverified | unverified |
| codex | unverified | unverified | unverified | unverified | unverified |
| kimi | unverified | unverified | unverified | unverified | unverified |

### Command Code verified mechanics

- Worktree lanes are created with `herdr worktree create --cwd <main checkout> --branch <ticket-slug> --base <base-branch> --label <role>-<ticket> --no-focus`. `--cwd` is mandatory once a linked worktree exists, otherwise the command fails with `linked_worktree_source`.
- Herdr manages worktree lanes under its own root outside the repository (one directory per branch). Never create a `wt/` directory in the repository.
- The launch command is `righthand launch <persona> --cwd <lane>`. Without `-t` the project trust prompt blocks startup; without `--yolo` tool permissions block the run. When no user config exists the model is inherited from the orchestrator and may be omitted.
- `cmd` is **not** a valid `herdr agent start --kind` value. Command Code reports its own state to the Herdr socket, so the agent appears in `herdr agent list` on its own after launch.
- `herdr agent prompt <target>` rejects self-registering agents with `agent_not_ready`, even when the pane id or the agent name is valid. Submit prompts through the pane surface instead: `herdr pane send-text <pane> "<prompt>"` followed by `herdr pane send-keys <pane> enter`.
- An agent created this way has no name until `herdr agent rename <pane> <name>` is called. Rename before any name-based command.
- The Enter keystroke can be dropped, leaving the prompt visible but unsubmitted. After sending, confirm with `herdr agent get <name>` that the state became `working`; if it is still `idle`, send `enter` again rather than resending the text.
- `herdr agent wait <name>` returns the settled state. `idle` and `done` both mean ready; `blocked` means an approval or question dialog.

Lane creation follows the `worktree-lanes` skill. Reporting and board events follow `report-and-board`. Verification follows `verification`. Brief assembly follows `context-briefing`.

## Model and harness

Per-persona dispatch settings live in `<main checkout>/.righthand/persona.json` (optional, local only). It is always read from the main checkout, never from a lane. Schema:

```json
{
  "personas": {
    "code-reviewer": { "model": "opus 5.5", "harness": "pi" },
    "worker": { "model": "my-fast-model" }
  }
}
```

Resolution order, field by field:

- `harness`: value from the persona entry; otherwise `commandcode` (the orchestrator's own harness). Source is `persona` or `orchestrator`.
- `model`: value from the persona entry; otherwise the orchestrator's live model; otherwise empty. Source is `persona`, `orchestrator`, or `harness-default`. Empty model means omit `-m` and use the harness default.

Missing file, missing `personas`, or a persona not present all mean full inheritance; the file is a delta, not a full table. Only `commandcode` is supported as a harness value today. This configuration only affects agents launched by the orchestrator. A user working directly in a harness picks the model with `/model`, and RightHand must never override it. The model value is passed through untouched, so it must be an id the target harness accepts. Today only `commandcode` is accepted as a harness, so an illustrative value such as `pi` is not launchable yet. Discover available ids with `cmdc --list-models`.

## Procedure

0. Preflight: confirm `.righthand/` exists, otherwise run `righthand init`; confirm the main checkout state; confirm no existing lane or tab for the ticket.
1. Lane: create the worktree lane for a writer ticket, or attach to the writer's lane for a readonly ticket (see `worktree-lanes`).
2. Launch: start the agent for the harness using the persona and the model for the ticket's mode, read from `righthand config <persona>` (see adapter table); `-m` is omitted when `model=` is empty.
3. Brief: create `.righthand/tickets/<TICKET>/task.md` and submit a short pointer prompt that tells the agent to read it (see `context-briefing`).
4. Observe: wait for a settled state and confirm the transition happened.
5. Collect: read `.righthand/tickets/<TICKET>/reports/<persona>.md` and the board event (see `report-and-board`).
6. Gate: verify the acceptance criteria yourself; do not trust the report (see `verification`).
7. Cleanup: close tabs you created; remove the lane only after the gate passes (see `worktree-lanes`).

## Brief schema

The brief must carry these fields:

- `persona`: target persona name.
- `mode`: `writer` or `readonly`.
- `lane`: ticket slug / lane identifier.
- `cwd`: absolute worktree path the agent runs in.
- `model`: model id for the ticket's mode, read from `righthand config <persona>`.
- `skills`: capability skills the agent must follow.
- `report_root`: absolute path to the main checkout. A lane's `.righthand/` is a different directory than the orchestrator's, so this must be absolute.
- `base`: base branch or ticket the lane stacks on.
- `objective`: one-sentence ticket objective.
- `scope`: object with `may_change`, `may_delete`, and `must_not_change` path lists.
- `acceptance`: testable checkboxes (command + expected result).
- `constraints`: rules the agent must obey.
- `deliverables`: files and artifacts expected.
- `evidence`: requirement to record command, exit code, and trimmed output.

## Failure handling

- Never resend a prompt after `blocked` or a stalled wait; inspect `herdr agent get` and `herdr pane read` first.
- After two failed attempts on the same ticket, append `blocked` to the board and escalate to the user instead of retrying.
- A timeout does not prove the prompt was not delivered.
- Report `not run` honestly when a verification step could not execute.

## Integration

The worker rebases onto `origin/main` before pushing and uses `--force-with-lease`, and never merges main into its branch.

## Checklist

- [ ] `.righthand/` exists or `righthand init` ran.
- [ ] Main checkout state confirmed.
- [ ] No existing lane or tab for the ticket.
- [ ] Lane created with `--cwd` pointing at the main checkout.
- [ ] Agent launched with persona and model from `righthand config <persona>`.
- [ ] Brief written to `.righthand/tickets/<TICKET>/task.md` with all schema fields.
- [ ] Prompt submitted through the pane surface and state confirmed `working`.
- [ ] Settled state observed (`idle`/`done` ready, `blocked` inspected).
- [ ] Report and board event collected.
- [ ] Acceptance criteria verified independently.
- [ ] Tabs closed and lane removed only after gate passes.

## Evidence

- The lane path and branch name.
- The launch command and model used.
- The prompt submission confirmation and settled state.
- The collected report path and board event.
- Independent verification output for each acceptance criterion.
