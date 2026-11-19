'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const IS_WIN = process.platform === 'win32';
const CMDC_BIN = IS_WIN ? 'cmdc' : 'cmd';

function skillsTarget(opts) {
  opts = opts || {};
  const candidates = [opts.dest, opts.destination, opts.target, opts.targetDir, opts.destDir];
  for (const c of candidates) {
    if (c) return c;
  }
  const home = opts.home || os.homedir();
  return path.join(home, '.commandcode', 'skills');
}

function userProfilesDir(opts) {
  opts = opts || {};
  const home = opts.home || os.homedir();
  return path.join(home, '.commandcode', 'profiles');
}

function listInstalled() {
  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec || 'cmd.exe';
    return spawnSync(comspec, ['/d', '/s', '/c', 'cmdc mods list'], {
      encoding: 'utf8', timeout: 10000, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  return spawnSync('cmdc', ['mods', 'list'], {
    encoding: 'utf8', timeout: 10000, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function getStatus(ctx) {
  ctx = ctx || {};
  const dc = ctx.dc || require('../../bin/doctor-checks');
  let cmdcInstalled = false;
  let cmdcVersion = null;
  try {
    const r = listInstalled();
    if (r && !r.error && r.status === 0) {
      const parsed = dc.parseModsList(r.stdout || '');
      cmdcInstalled = parsed.installed;
      cmdcVersion = parsed.version;
    }
  } catch (e) {}
  return { installed: cmdcInstalled, version: cmdcVersion };
}

module.exports = {
  key: 'cmdc',
  type: 'spawn',
  bin: CMDC_BIN,
  args: ['mods', 'add', '-g', '@agirahman/righthand'],
  aliases: ['commandcode'],
  label: 'Command Code',
  pathCheck: [CMDC_BIN],
  pathNote: ` (${IS_WIN ? 'Windows: cmdc' : 'Linux/macOS: cmd'})`,
  dispatchable: true,
  dispatchAlias: 'commandcode',
  skillsTarget: skillsTarget,
  userProfilesDir: userProfilesDir,
  listInstalled: listInstalled,
  contributesAnySetup: function contributesAnySetup(ctx) {
    return !!(ctx && ctx.modParsed && ctx.modInstalled);
  },
  strictLabel: 'mod',
  strictRequiresParsed: true,
  strictData: function strictData(ctx) {
    ctx = ctx || {};
    return { parsed: ctx.modParsed, installed: ctx.modInstalled, version: ctx.modVersion, expected: ctx.expected };
  },
  getStatus: getStatus,
};