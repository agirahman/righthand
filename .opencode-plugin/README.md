# RightHand for OpenCode

Native integration for [OpenCode](https://github.com/opencode-ai/opencode).

## Features
- **Native Plugin**: Located at `.opencode/plugins/righthand.js`
- **Session Injection**: Automatically injects active persona into OpenCode sessions
- **CLI Sync**: Shares persistent state in `.righthand/active-persona.json` with the `righthand` CLI
- **Headless & Interactive**: Works seamlessly in both `opencode run` and interactive sessions

## Usage via CLI
```bash
righthand backend
righthand list
righthand off
```

## Running with OpenCode CLI
Prepend the active persona into your OpenCode prompt or workflow:
```bash
# Set persona
righthand backend

# Run with injected persona context
opencode run "$(righthand inject) Help me design the REST API endpoints"
```
Or configure the plugin in `.opencode/` or `~/.config/opencode/plugins/`.
