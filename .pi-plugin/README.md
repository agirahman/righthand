# RightHand for Pi Coding Agent

Native integration for [Pi Coding Agent](https://github.com/earendil-works/pi).

## Features
- **Native Extension**: Located at `.pi-plugin/extensions/righthand.ts`
- **Dynamic Slash Command**: `/righthand` with autocomplete for all 11 personas and `/righthand off`
- **Automatic Context Injection**: Injects active persona into `systemPromptOptions.sections.righthand` before agent start
- **Status Indicator**: Shows active persona in Pi's status bar via `ctx.ui.setStatus`
- **CLI Sync**: Shares persistent state in `.righthand/state/active-persona.json` with the `righthand` CLI

## Setup

### Option 1: Project-local extension
From the repository root, load the extension explicitly:

```bash
pi -e .pi-plugin/extensions/righthand.ts
```

### Option 2: Install the package

```bash
pi install npm:@agirahman/righthand
```

### Option 3: Global extension
Copy `.pi-plugin/extensions/righthand.ts` to `~/.pi/agent/extensions/righthand.ts`.

## Usage in Pi
- `/righthand` — Open the interactive picker to choose a persona
- `/righthand <persona>` — Switch to a persona
- `/righthand off` — Deactivate the active persona

## Usage via CLI
```bash
righthand switch <persona>
righthand off
```
Changes made via CLI immediately reflect in Pi sessions.

## Dispatch

Pi is a dispatch target: `righthand launch pi <persona> [--cwd <lane>]` spawns `pi --approve` plus `--model <model>` when a model is resolved, and sets `RIGHTHAND_PERSONA=<persona>` in the child process environment. That variable is read before the state file, so a dispatched process runs the dispatcher's persona even when `.righthand/state/active-persona.json` names another one. `--print` shows the command line followed by an `env: RIGHTHAND_PERSONA=<persona>` line. The `--model` flag is verified against `pi --help`; that a resolved model actually drives a Pi session is unverified, since no Pi model call has been exercised.
