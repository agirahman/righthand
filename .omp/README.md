# RightHand for Oh My Pi (OMP)

Native integration for [Oh My Pi](https://github.com/canisminor-hex/oh-my-pi).

## Features
- **Native Extension**: Located at `.omp/extensions/righthand.ts`
- **Auto-discovery**: OMP auto-discovers extensions inside `<cwd>/.omp/extensions/`
- **Dynamic Slash Command**: `/righthand` with autocomplete for all 12 personas, `/righthand list`, and `/righthand off`
- **Automatic Context Injection**: Injects active persona into `systemPromptOptions.sections.righthand` before agent start
- **Status Indicator**: Shows active persona in OMP's status bar via `ctx.ui.setStatus`
- **CLI Sync**: Shares persistent state in `.righthand/state/active-persona.json` with the `righthand` CLI

## Setup

### Option 1: Project-local (Auto-discovered)
OMP automatically loads `.omp/extensions/righthand.ts` when running in this repository directory.

### Option 2: Explicit flag
```bash
omp -e .omp/extensions/righthand.ts
```

### Option 3: Global install
Copy `.omp/extensions/righthand.ts` to `~/.omp/agent/extensions/righthand.ts`.

## Usage in OMP
- `/righthand` or `/righthand list` — Open interactive picker to choose a persona
- `/righthand backend` — Switch to `backend` persona
- `/righthand off` — Deactivate active persona

## Usage via CLI
```bash
righthand backend
righthand list
righthand off
```
