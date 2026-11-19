'use strict';

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

function probe(ctx) {
  ctx = ctx || {};
  if (!ctx.dc) throw new Error('cmdc manifest probe requires ctx.dc');
  if (ctx.cache && ctx.cache.cmdc) return ctx.cache.cmdc;
  let parsed = false;
  let installed = false;
  let version = null;
  try {
    const r = listInstalled();
    const out = (r && r.stdout) ? r.stdout : '';
    if (r && !r.error && r.status === 0) {
      const p = ctx.dc.parseModsList(out);
      installed = p.installed;
      version = p.version;
      parsed = true;
    } else if (out.indexOf('righthand') !== -1) {
      const p = ctx.dc.parseModsList(out);
      installed = p.installed;
      version = p.version;
      parsed = true;
    }
  } catch (e) {}
  const res = { parsed, installed, version };
  if (ctx.cache) ctx.cache.cmdc = res;
  return res;
}

function statusInfo(ctx) {
  const st = probe(ctx);
  return {
    mark: st.installed ? '\u2713' : '-',
    text: st.installed ? `installed${st.version ? ` v${st.version}` : ''}` : 'not set up or unverified',
  };
}

function doctorModLines(ctx) {
  const expected = ctx && ctx.expected;
  const st = probe(ctx);
  if (!st.parsed) return ['  - mod: unverified'];
  if (!st.installed) return ['  ✗ mod: not installed'];
  if (st.version === null) return ['  \u2713 mod: installed (version not reported)'];
  const cmp = ctx.dc.compareVersions(st.version, expected);
  const mark = cmp === 'match' ? '\u2713' : (cmp === 'drift' ? '✗' : '-');
  return [`  ${mark} mod: installed v${st.version}`];
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
  probe: probe,
  statusInfo: statusInfo,
  doctorModLines: doctorModLines,
  contributesAnySetup: function contributesAnySetup(ctx) {
    const st = probe(ctx);
    return !!(st.parsed && st.installed);
  },
  strictLabel: 'mod',
  strictRequiresParsed: true,
  strictData: function strictData(ctx) {
    const st = probe(ctx);
    return { parsed: st.parsed, installed: st.installed, version: st.version, expected: ctx && ctx.expected };
  },
};
