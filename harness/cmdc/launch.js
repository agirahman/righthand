'use strict';

const IS_WIN = process.platform === 'win32';
const CMDC_BIN = IS_WIN ? 'cmdc' : 'cmd';

function buildLaunchArgs(personaName, resolution) {
  const args = ['-t', '--yolo'];
  const model = resolution && resolution.model;
  if (typeof model === 'string' && model.trim() !== '') {
    args.push('-m', model);
  }
  args.push('--mod-option', `default=${personaName}`);
  return args;
}

function quoteArg(arg) {
  const s = String(arg);
  if (s === '') return '""';
  if (/[ \t\r\n"'\\]/.test(s)) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return s;
}

function formatCommand(bin, args) {
  const list = Array.isArray(args) ? args : [];
  return [bin, ...list].map(quoteArg).join(' ');
}

function buildLaunch(personaName, resolution) {
  return { bin: CMDC_BIN, args: buildLaunchArgs(personaName, resolution), env: {} };
}

module.exports = {
  CMDC_BIN: CMDC_BIN,
  buildLaunchArgs: buildLaunchArgs,
  buildLaunch: buildLaunch,
  formatCommand: formatCommand,
};
