'use strict';

const PI_BIN = 'pi';

function buildLaunchArgs(personaName, resolution) {
  const args = ['--approve'];
  const model = resolution && resolution.model;
  if (typeof model === 'string' && model.trim() !== '') {
    args.push('--model', model.trim());
  }
  return args;
}

function buildLaunch(personaName, resolution) {
  return {
    bin: PI_BIN,
    args: buildLaunchArgs(personaName, resolution),
    env: { RIGHTHAND_PERSONA: personaName },
  };
}

module.exports = {
  PI_BIN: PI_BIN,
  buildLaunchArgs: buildLaunchArgs,
  buildLaunch: buildLaunch,
};
