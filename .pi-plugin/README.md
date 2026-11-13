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
