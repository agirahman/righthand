---
name: dispatch
description: "Launch a ticket-scoped agent in another harness: provision the lane, start the agent with the right persona and model, submit the brief, observe, collect, gate, and clean up."
---
# Dispatch

## When to use

- A ticket is ready to delegate to an agent in a supported harness.
- `palm` needs to launch work in another harness (Command Code, Pi, OMP, OpenCode).
- A writer or readonly persona must run in an isolated lane with a verified model from `righthand config <persona>`.

## Adapters

Four harnesses are supported: `commandcode`, `pi`, `omp`, and `opencode`, and all four are `righthand launch` targets because each manifest exposes `dispatchable: true` plus a `buildLaunch` hook. `omp` and `opencode` are copy-type installs, so run `righthand setup <harness>` once before launching them and the installed extension or plugin injects the persona. `righthand launch <harness> <persona> --print` shows the exact argv. Unverified cells say `unverified`.

| Harness id | Launch command | Persona injection | Model selection | Prompt submission | Caveat |
|---|---|---|---|---|---|
| commandcode | `righthand launch <persona> --cwd <lane>` | `--mod-option default=<persona>` | `-m <model>` (value from `righthand config <persona>`; omitted when `model=` is empty) | `herdr pane send-text <pane> "<prompt>"` then `herdr pane send-keys <pane> enter` | See verified mechanics below. |
| pi | `righthand launch pi <persona> --cwd <lane>` | `RIGHTHAND_PERSONA=<persona>` in the spawned process env; `/righthand <persona>` inside Pi | `--model <model>` from the persona's `models.pi` entry; when pinned to Pi without that entry the flag is omitted and Pi uses its own default, so a commandcode model id is never forwarded (emitted argv is asserted by `validate-launch`; that a resolved model drives a Pi session is unverified) | `herdr pane send-text <pane> "<prompt>"` then `herdr pane send-keys <pane> enter` (unverified: not exercised against a live Pi session) | See Pi verified mechanics below. |
| omp | `righthand launch omp <persona> --cwd <lane>` (spawns `omp -e <abs path to .omp/extensions/righthand.ts>`); headless is `omp -p "<pointer prompt>"` | `RIGHTHAND_PERSONA=<persona>` in the child env, or `/righthand <persona>` inside OMP | `--model=<id>` (fuzzy match; exact with a provider prefix, for example `--model=openai/gpt-5.2`) | Interactive: type the brief, or `herdr pane send-text <pane> "<prompt>"` then `send-keys <pane> enter`. Headless: pass the prompt as the `-p` argument. | Dispatchable since the manifest declares `buildLaunch`; the spawned argv passes the extension with an absolute `-e` path, so it loads in a lane that carries no copy. See OMP mechanics below. |
| opencode | `righthand launch opencode <persona> --cwd <lane>` (bare `opencode` TUI when no model or prompt is forwarded; `opencode run -m <model> --auto "<prompt>"` otherwise) | Session entry in `~/.local/state/opencode/righthand.json`, falling back to `readActivePersona`, so `RIGHTHAND_PERSONA` and `.righthand/state/active-persona.json` both work | `-m <provider>/<model>#<variant>` | Positional message to `opencode run`, or the TUI prompt | Dispatchable since the manifest declares `buildLaunch`. Headless persona injection is unverified. See OpenCode mechanics below. |

### Command Code verified mechanics

- Worktree lanes are created with `herdr worktree create --cwd <main checkout> --branch <ticket-slug> --base <base-branch> --label <role>-<ticket> --no-focus`. `--cwd` is mandatory once a linked worktree exists, otherwise the command fails with `linked_worktree_source`.
- Herdr manages worktree lanes under its own root outside the repository (one directory per branch). Never create a `wt/` directory in the repository.
- The launch command is `righthand launch <persona> --cwd <lane>`. Without `-t` the project trust prompt blocks startup; without `--yolo` tool permissions block the run. When no user config exists the model is inherited from `palm`'s live model and may be omitted.
- `cmd` is **not** a valid `herdr agent start --kind` value. Command Code reports its own state to the Herdr socket, so the agent appears in `herdr agent list` on its own after launch.
- `herdr agent prompt <target>` rejects self-registering agents with `agent_not_ready`, even when the pane id or the agent name is valid. Submit prompts through the pane surface instead: `herdr pane send-text <pane> "<prompt>"` followed by `herdr pane send-keys <pane> enter`.
- An agent created this way has no name until `herdr agent rename <pane> <name>` is called. Rename before any name-based command.
- The Enter keystroke can be dropped, leaving the prompt visible but unsubmitted. After sending, confirm with `herdr agent get <name>` that the state became `working`; if it is still `idle`, send `enter` again rather than resending the text.
- `herdr agent wait <name>` returns the settled state. `idle` and `done` both mean ready; `blocked` means an approval or question dialog.

Lane creation follows the `worktree-lanes` skill. Reporting and board events follow `report-and-board`. Verification follows `verification`. Brief assembly follows `context-briefing`.

### Pi verified mechanics

- Install with `pi install npm:@agirahman/righthand`; `righthand setup pi` runs the same command (`bin/harness.js:22-29`, `bin/righthand.js:385-417`).
- The package manifest declares `.pi-plugin/extensions/righthand.ts` as the extension, `./skills` as the skills directory, and `https://raw.githubusercontent.com/agirahman/righthand/main/assets/righthand-banner.png` as the image (`package.json:22-29`).
- Pi loads TypeScript extensions with jiti: the installed `@earendil-works/pi-coding-agent` 1.3.0 `dist/core/extensions/loader.js:2,22-25,461-481` creates a jiti loader and calls `jiti.import(extensionPath)`; its manifest declares `jiti` 2.7.0. This is why the `.ts` extension entry runs directly.
- Activate a persona with `/righthand <persona>` in Pi or `righthand switch <persona>` from the CLI (`.pi-plugin/README.md:30-40`).
- Active persona state is stored at `<cwd>/.righthand/state/active-persona.json` (`.pi-plugin/extensions/righthand.ts:86-88`, `getStatePath`).
- Injection is automatic: the `before_agent_start` handler assigns the persona to `systemPromptOptions.sections.righthand` (`.pi-plugin/extensions/righthand.ts:155-175`, `before_agent_start`).
- Since #50, `readonly` persona tool calls are blocked by the guard/engine; before #50 Pi had no enforcement (`4cbba4e`, `.pi-plugin/extensions/righthand.ts:134-153`, `tool_call` handler).
- Pi is a dispatch target: `harness/pi/manifest.js` sets `dispatchable: true` and exposes `buildLaunch`, so `righthand launch pi <persona>` spawns `pi --approve` plus `--model <model>` when a Pi model is resolved, with `RIGHTHAND_PERSONA=<persona>` in the child process environment. The model comes from the persona's `models.pi` entry; a persona whose configured harness is commandcode contributes no Pi model, so the flag is omitted instead of forwarding a commandcode id. The argv shape is asserted by `righthand launch pi <persona> --print` and `test/validate-launch.cjs`; that a resolved model actually drives a Pi session is unverified, since no Pi model call has been exercised.
- The `RIGHTHAND_PERSONA` environment variable is read before the state file by `harness/common/state.ts` `readActivePersona`, so a dispatched Pi process uses the persona the dispatcher chose even while the state file names another persona. It is trimmed and lowercased; a blank value falls through to the file. `righthand launch pi <persona> --print` prints the command line then one `env: RIGHTHAND_PERSONA=<persona>` line.

### OMP verified mechanics

- OMP is a copy-type harness that is also a dispatch target: `righthand setup omp` copies `.omp/extensions/righthand.ts` into `<cwd>/.omp/extensions/`, and the manifest declares `dispatchable: true` with a `buildLaunch` hook (`harness/omp/manifest.js`). `righthand launch omp <persona>` spawns `omp -e <absolute path to .omp/extensions/righthand.ts>` with `RIGHTHAND_PERSONA=<persona>` in the child env, adding `--model=<id>` when the persona resolves an OMP model. The absolute `-e` path is deliberate: it loads the repo extension even in a lane that carries no copy.
- The launch builder already passes `-e` with an absolute path, so a lane that carries no copy still loads the extension. When launching OMP by hand, the same shape works: `omp -e .omp/extensions/righthand.ts --cwd <lane>`. `--no-extensions` disables discovery but an explicit `-e` path still loads.
- Headless runs use `-p`: `omp -p "read .righthand/tickets/<TICKET>/task.md and follow it"`. Without `-p` the positional message is submitted interactively, which is the shape a pane-driven dispatch uses.
- Persona selection is unchanged from the other harnesses: the extension calls `readActivePersona(ctx.cwd)`, so `RIGHTHAND_PERSONA=<persona>` in the child environment wins over the state file, and `/righthand <persona>` switches at runtime. Both paths reach the same extension entry, `harness/omp/extension.ts`.
- Model selection is `--model=<id>`. OMP matches the value fuzzily, so an exact id needs its provider prefix (`--model=openai/gpt-5.2`). A commandcode model id is not accepted; use the persona's `models.omp` entry when one exists, otherwise let OMP use its default.
- The readonly guard runs inside OMP: the extension registers a `tool_call` handler that calls `evaluateToolGuard` and returns a block with a reason. It fails closed when the guard throws.
- Unverified: no OMP pane dispatch, no `herdr agent` self-registration, and no headless `-p` persona run has been exercised against a live OMP session. Confirm the first dispatch by reading the status bar or `herdr pane read`.

### OpenCode verified mechanics

- OpenCode is a copy-type harness that is also a dispatch target: `righthand setup opencode` copies the `righthand/` plugin directory into `~/.config/opencode/plugins/` (`destBase: 'home'` in `harness/opencode/manifest.js`), and the manifest declares `dispatchable: true` with a `buildLaunch` hook. OpenCode accepts a model only on its `run` subcommand and `run` refuses to start without a message, so a launch that forwards nothing stays the bare `opencode` TUI, while a launch that carries a model or a prompt becomes `opencode run -m <model> --auto "<prompt>"`. The persona always travels through `RIGHTHAND_PERSONA`.
- `righthand/index.js` hooks the session context event and pushes the persona prompt into `event.system`; `righthand/tui.js` registers the `/righthand` command and the footer status.
- Persona lookup for a session is a session entry in `~/.local/state/opencode/righthand.json`, falling back to `readActivePersona(cwd)` (`harness/opencode/state.ts:20-22`). That fallback is why `RIGHTHAND_PERSONA=<persona>` and `righthand switch <persona>` both reach an OpenCode session.
- Headless: `opencode run -m <provider>/<model>#<variant> "$(righthand inject) <task>"`. `opencode run` takes the message positionally, `-m` selects the model, `--agent` selects an OpenCode agent, `--format json` emits machine-readable output, and `--auto` auto-approves permissions that are not explicitly denied.
- The readonly guard is enforced in the plugin through the `execute.before` tool hook. `apply_patch` and `batch` are refused outright for readonly personas because the guard cannot classify their nested effects.
- Unverified: that `opencode run` with `righthand inject` produces a session the plugin recognises, and that a pane dispatch works. Confirm with `opencode run --format json` and read the injected system section.

## Model and harness

Per-persona dispatch settings live in `<main checkout>/.righthand/persona.json` (optional, local only). It is always read from the main checkout, never from a lane. Schema:

```json
{
  "personas": {
    "middle": { "model": "opus 5.5", "harness": "pi", "models": { "commandcode": "opus-5.5-cmdc" } },
    "thumb": { "model": "my-fast-model", "models": { "pi": "pi-fast-model" } }
  }
}
```

Resolution order, field by field:

- `harness`: value from the persona entry; otherwise `commandcode` (the orchestrator's own harness). Source is `persona` or `orchestrator`.
- `model`, no explicit harness launch: value from the persona entry; otherwise the orchestrator's live model; otherwise empty. Source is `persona`, `orchestrator`, or `harness-default`. Empty model means omit the model flag and use the harness default.
- `model`, explicit harness launch that matches the configured harness: unchanged from the no-explicit-harness case.
- `model`, explicit harness launch that differs from the configured harness (the configured harness defaults to `commandcode` when the entry has no `harness`): the persona's `models[<explicit harness>]`; otherwise empty. Source is `persona-models` or `harness-default`. The persona's own model and the orchestrator model are never forwarded cross-harness, because a model id one harness accepts is usually rejected by another.

Missing file, missing `personas`, or a persona not present all mean full inheritance; the file is a delta, not a full table. Every supported harness is dispatchable, so all four (`commandcode`, `pi`, `omp`, `opencode`) are valid `models` keys and valid `launch` targets. This configuration only affects agents launched by `palm`. A user working directly in a harness picks the model with `/model`, and RightHand must never override it. The model value is passed through untouched, so it must be an id the target harness accepts. `righthand launch <harness> <persona>` overrides the configured harness for that single launch without editing the file. Discover available ids with `cmdc --list-models`, `omp --help` for OMP model matching, and `opencode models` for OpenCode provider ids.

## Procedure

0. Preflight: confirm `.righthand/` exists, otherwise run `righthand init`; confirm the main checkout state; confirm no existing lane or tab for the ticket.
1. Lane: create the worktree lane for a writer ticket, or attach to the writer's lane for a readonly ticket (see `worktree-lanes`).
2. Launch: start the agent for the harness using the persona and the model for the ticket's mode, read from `righthand config <persona>` (see adapter table); `righthand launch <persona>` uses the configured harness, while `righthand launch <harness> <persona>` pins one harness for that launch; the model flag is omitted when `model=` is empty.
3. Brief: create `.righthand/tickets/<TICKET>/task.md` and submit a short pointer prompt that tells the agent to read it (see `context-briefing`).
4. Observe: wait for a settled state and confirm the transition happened.
5. Collect: read `.righthand/tickets/<TICKET>/reports/<persona>.md` and the board event (see `report-and-board`).
6. Gate: verify the acceptance criteria yourself; do not trust the report (see `verification`).
7. Integrate: once the gate passes, `palm` commits nothing but pushes the ticket branch and opens or updates the pull request itself, following `integration-flow`. A writer's job ends at the commit inside its lane.
8. Cleanup: close tabs you created; remove the lane only after the gate passes and the branch is pushed (see `worktree-lanes`).

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

A writer ends at the commit inside its lane and reports the branch and SHA; it does not push and does not open a pull request. `palm` owns integration: after the gate passes it pushes the ticket branch and opens or updates the pull request, following `integration-flow` (rebase onto `origin/main`, `--force-with-lease`, never merge main into the branch). The guard enforces this split: writer personas may write and commit, and only `palm` among the readonly personas may run `git fetch`, `git rebase`, `git push` and `gh pr create/edit`.

## Release

After a release pull request merges, `palm` cuts the version itself: bump `version` in `package.json` and `package-lock.json`, `git add` them, `git commit -m "chore(release): <version>"`, `git tag v<version>`, `git push origin v<version>`, then `gh release create v<version>` with the note format of the previous release.

The guard allows only a version change to those manifests, so a `scripts` entry cannot be introduced and then run through `npm run`. It still blocks `git commit --amend`, `git commit --no-verify`, a message-less commit or annotated tag, `git tag -d/-f/-e`, force and delete pushes, pushes to `main`, `gh pr merge`, `npm version` and `npm publish`. Publishing to npm is the maintainer's step.

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

