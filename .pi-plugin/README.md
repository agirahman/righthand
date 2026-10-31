# RightHand for Pi Coding Agent

Native integration for [Pi Coding Agent](https://github.com/earendil-works/pi).

## Features
- **Native Extension**: Located at `.pi/extensions/righthand.ts`
- **Dynamic Slash Command**: `/righthand` with autocomplete for all 12 personas, `/righthand list`, and `/righthand off`
- **Automatic Context Injection**: Injects active persona into `systemPromptOptions.sections.righthand` before agent start
- **Status Indicator**: Shows active persona in Pi's status bar via `ctx.ui.setStatus`
- **CLI Sync**: Shares persistent state in `.righthand/active-persona.json` with the `righthand` CLI

## Setup

### Option 1: Project-local (Automatic)
Pi automatically discovers extensions in `.pi/extensions/` when running inside this project.

### Option 2: Explicit flag
```bash
pi -e .pi/extensions/righthand.ts
```

### Option 3: Global install
Copy `.pi/extensions/righthand.ts` to `~/.pi/agent/extensions/righthand.ts`.

## Usage in Pi
- `/righthand` or `/righthand list` — Open interactive picker to choose a persona
- `/righthand backend` — Switch to `backend` persona
- `/righthand off` — Deactivate active persona

## Usage via CLI
```bash
righthand backend
righthand list
righthand off
```
Changes made via CLI immediately reflect in Pi sessions.
