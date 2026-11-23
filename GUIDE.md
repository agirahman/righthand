# RightHand — Cross-harness install guide

RightHand personas are portable skills. Each harness has its own install path. Use **one** route; adding more gives you overlapping copies.

## Routes overview

| Route | Best for |
|---|---|
| Plugin door | Oh My Pi |
| Pi package | Pi |
| Native extension copy | Command Code, OpenCode |
| Git clone | Any harness that reads repo skills |

## Plugin-door installs (Oh My Pi)

- **Oh My Pi**: `omp plugin marketplace add agirahman/righthand`; `omp plugin install righthand@righthand`

Updates: use each harness's own update command or re-run install. Removal: use each harness's uninstall command.

## Pi (package)

```
pi install npm:@agirahman/righthand
```

Reads `pi.skills` from `package.json`. Update with `pi update --extensions`.

## Shared-folder install

For harnesses scanning `.agents/skills/`, clone the repo and symlink/copy `skills/` into `.agents/skills/` (or project-specific skills folder). Activate via skill request:

```
cd /path/to/project
git clone https://github.com/agirahman/righthand righthand
# copy skills (or use a symlink)
cp -r righthand/skills .agents/skills/  # Unix
```

On Windows use `Copy-Item -Recurse`.

## Git-clone deep install

1. Clone the repo.
2. Launch your harness inside the repo directory (verify it reads the root skills).

## Usage modes

- Native `/righthand` slash commands and interactive persona switching are supported in **Command Code**, **Pi**, **Oh My Pi**, **OpenCode**, and via the **RightHand CLI** (`righthand switch <persona>`).
- In any of those four harnesses, a persona can also be activated by skill request: *"Act as righthand-thumb"* or *"Use the righthand-palm skill"*. Legacy names such as backend or orchestrator still resolve to the persona that absorbed them.
- Writer personas should run in isolated lanes created by Herdr outside this repository, using `scripts/herdr-spawn.*`.

## Per-persona dispatch model and harness

Dispatch harness and model are resolved per persona from `<main checkout>/.righthand/persona.json` (optional, local only). Use `righthand config [persona]` to inspect the resolved values. All four supported harnesses (`commandcode`, `pi`, `omp`, `opencode`) are dispatchable. A persona entry may also carry an optional `models` map keyed by dispatch harness, so a launch pinned to a different harness uses that harness's own model id instead of the commandcode-only one:

```json
{
  "personas": {
    "thumb": {
      "harness": "commandcode",
      "model": "9router-bili/cmc/deepseek/deepseek-v4.1-flash",
      "models": { "pi": "9router/agness/agnes-2.5-flash" }
    }
  }
}
```

`models` keys must be one of the four supported harnesses and values must be non-empty model ids. The resolved model is passed through untouched, so it must be an id the target harness accepts; discover available ids with `cmdc --list-models`.

### Launching a persona

Preview the command without running it:

    righthand launch thumb --print

Then run it for real in a lane:

    righthand launch thumb --cwd <lane>

Pin a harness for a single launch without editing `persona.json`. All four supported harnesses are launch targets:

    righthand launch pi thumb --cwd <lane>
    righthand launch omp thumb --cwd <lane>
    righthand launch opencode thumb --cwd <lane>

A Pi launch spawns `pi --approve` plus `--model <model>` only when the resolved model is non-empty, and injects the persona through `RIGHTHAND_PERSONA` in the child process environment. An OMP launch spawns `omp -e <absolute path to .omp/extensions/righthand.ts>` with the same env var and adds `--model=<id>` when an OMP model resolves. An OpenCode launch spawns the bare `opencode` TUI when nothing is forwarded, and `opencode run -m <model> --auto` when a model resolves, because OpenCode accepts a model only on its `run` subcommand. Pi reads that variable before the state file, so a dispatched process keeps the persona the dispatcher chose. When the launch is pinned to a harness other than the persona's configured one, the model comes from `models[<harness>]` if present, otherwise the flag is omitted and Pi uses its own default; a commandcode model id is never forwarded to Pi. `righthand launch pi thumb --print` prints the command line followed by an `env: RIGHTHAND_PERSONA=thumb` line.

## Readonly enforcement

Readonly personas (palm, index, pinky, middle) cannot modify the project. The Command Code mod blocks file writes and edits outside `.righthand/` and the session scratchpad, and blocks shell commands that mutate files outside those paths. Read-only commands are allowed: inspection (`git status`, `git log`, `git diff`, `git tag --list`, `git worktree list`, `git branch --list`, `git remote -v`, `git stash list`), evaluation that only prints (`node -p`, `node --print`), and test runners such as `npm test`. Shell commands are parsed into segments, so a write aimed at `.righthand/` or the scratchpad is allowed while the same verb aimed at the project is refused. Reports and reviews go under `.righthand/tickets/<ID>/reports/` or `.righthand/tickets/<ID>/reviews/`. The guard stops accidents and ordinary violations; it is not a sandbox, and a deliberately evasive shell command can still write.

## Verification

After install, list available skills (harness UI or CLI). You should see the capability modules under `skills/`.

For Command Code, `righthand setup cmdc` and `righthand update cmdc` also sync the fifteen skills into `~/.commandcode/skills`, leaving any unrelated skill directory untouched.

## Integration flow

Branch from a fresh `origin/main`, commit in small units, rebase before pushing, push with `--force-with-lease`, and keep one pull request to one concern. Full steps live in `skills/integration-flow/SKILL.md`.

## Troubleshooting

`righthand doctor` checks harness availability, package health, the project persona config at `.righthand/persona.json`, the installed Command Code mod and its version, and the fifteen skills in `~/.commandcode/skills`. With `--strict`, the command exits 1 only for real health failures: an unparseable persona config, an unsupported harness in the config, missing or stale capability skills, or mod version drift. Informational lines such as a harness not set up here or a missing persona config do not fail strict. Config validation is intentionally not part of `npm test`, because `npm test` must never read or require user-owned data.

## Known limitations

- Multi-agent tab orchestration relies on Herdr workspace tabs and `herdr-spawn.*` scripts.
