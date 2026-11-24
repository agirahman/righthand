'use strict';

// OpenCode accepts a model only on its `run` subcommand, and `run` refuses to
// start without a message. So a launch that forwards a model or a prompt becomes
// `opencode run -m <model> --auto [prompt]`; a launch with neither stays the bare
// interactive TUI. The persona travels through RIGHTHAND_PERSONA.

const OPENCODE_BIN = 'opencode';

function buildLaunchArgs(personaName, resolution) {
  const model = resolution && resolution.model;
  const prompt = resolution && resolution.prompt;
  const hasModel = typeof model === 'string' && model.trim() !== '';
  const hasPrompt = typeof prompt === 'string' && prompt.trim() !== '';
  if (!hasModel && !hasPrompt) return [];
  const args = ['run'];
  if (hasModel) args.push('-m', model.trim());
  args.push('--auto');
  if (hasPrompt) args.push(prompt.trim());
  return args;
}

function buildLaunch(personaName, resolution) {
  return {
    bin: OPENCODE_BIN,
    args: buildLaunchArgs(personaName, resolution),
    env: { RIGHTHAND_PERSONA: personaName },
  };
}

module.exports = {
  OPENCODE_BIN: OPENCODE_BIN,
  buildLaunchArgs: buildLaunchArgs,
  buildLaunch: buildLaunch,
};
