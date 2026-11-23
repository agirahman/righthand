'use strict';

// OMP runs the repo extension explicitly. `-e <file>` always loads it, which we
// measured to work where project-directory auto-discovery did not. The persona
// travels through RIGHTHAND_PERSONA, which the extension reads on every tool call.

const path = require('path');

const OMP_BIN = 'omp';
const OMP_EXTENSION = path.resolve(__dirname, '..', '..', '.omp', 'extensions', 'righthand.ts');

function buildLaunchArgs(personaName, resolution) {
  const args = ['-e', OMP_EXTENSION];
  const model = resolution && resolution.model;
  if (typeof model === 'string' && model.trim() !== '') {
    args.push('--model=' + model.trim());
  }
  return args;
}

function buildLaunch(personaName, resolution) {
  return {
    bin: OMP_BIN,
    args: buildLaunchArgs(personaName, resolution),
    env: { RIGHTHAND_PERSONA: personaName },
  };
}

module.exports = {
  OMP_BIN: OMP_BIN,
  OMP_EXTENSION: OMP_EXTENSION,
  buildLaunchArgs: buildLaunchArgs,
  buildLaunch: buildLaunch,
};
