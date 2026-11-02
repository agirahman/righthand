# RightHand — Cross-harness install guide

RightHand personas are portable skills. Each harness has its own install path. Use **one** route; adding more gives you overlapping copies.

## Routes overview

| Route | Best for |
|---|---|
| Plugin door | Claude Code, Codex, Cursor, Kimi, OMP |
| Pi package | Pi |
| Shared folder copy | OpenCode |
| Git clone | Any harness that reads repo skills |

## Plugin-door installs (Claude Code / Codex / Cursor / Kimi / OMP)

Install commands mirror the upstream support table:

- **Claude Code**: `/plugin marketplace add https://github.com/agirahman/righthand` then `/plugin install righthand@righthand`
- **Codex**: `codex plugin marketplace add agirahman/righthand` then `codex plugin add righthand@righthand`
- **Cursor**: `agent plugin marketplace add https://github.com/agirahman/righthand` then install from Customize panel
- **Kimi Code**: `/plugins install https://github.com/agirahman/righthand`
- **Oh My Pi**: `omp plugin marketplace add agirahman/righthand`; `omp plugin install righthand@righthand`

Updates: use each harness's own update command or re-run install. Removal: use each harness's uninstall command.

## Pi (package)

```
pi install git:github.com/agirahman/righthand
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
2. Launch your harness inside repo directory (verify it reads root skils).

## Usage modes

- Native `/righthand` slash commands and interactive persona switching are supported in **Command Code**, **Pi**, **Oh My Pi**, **OpenCode**, and via the **RightHand CLI** (`righthand switch <persona>`).
- On other harnesses (Claude Code, Cursor, Codex, Kimi), activate by requesting the persona in conversation: *"Act as righthand-backend"* or *"Use the righthand-orchestrator skill"*.
- Writer personas should run in isolated lanes created by Herdr outside this repository, using `scripts/herdr-spawn.*`.

## Per-persona dispatch model and harness

Dispatch harness and model are resolved per persona from `<main checkout>/.righthand/persona.json` (optional, local only). Use `righthand config [persona]` to inspect the resolved values. Only `commandcode` is supported as a harness today. The model value is passed through untouched, so it must be an id the target harness accepts; discover available ids with `cmdc --list-models`.

## Verification

After install, list available skills (harness UI or CLI). You should see the capability modules under `skills/`.

For Command Code, `righthand setup cmdc` and `righthand update cmdc` also sync the eight capability skills into `~/.commandcode/skills`, leaving any unrelated skill directory untouched.

## Known limitations

- For harnesses without native extension APIs (Claude Code, Cursor, Codex), persona switching relies on standard skill activation prompts rather than UI pickers.
- Multi-agent tab orchestration relies on Herdr workspace tabs and `herdr-spawn.*` scripts.
