'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { isInPath } = require('../lib/path');

const IS_WIN = process.platform === 'win32';

function detectInstall(deps) {
  deps = deps || {};
  if (!deps.dc) throw new Error('pi manifest detectInstall requires deps.dc');
  if (deps.cache && Object.prototype.hasOwnProperty.call(deps.cache, 'pi')) return deps.cache.pi;
  const result = (function () {
    if (!isInPath('pi')) return null;
    const r = IS_WIN
      ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'pi list'], { encoding: 'utf8', timeout: 10000, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawnSync('pi', ['list'], { encoding: 'utf8', timeout: 10000, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    if (!r || r.error || r.status !== 0) return null;
    const installed = deps.dc.parsePiList(r.stdout).find((p) => p.id === 'npm:@agirahman/righthand');
    if (!installed || !installed.path) return null;
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(path.join(installed.path, 'package.json'), 'utf8')); } catch (e) { return null; }
    if (manifest.name !== '@agirahman/righthand') return null;
    return { path: installed.path, version: manifest.version || installed.version, manifest: manifest };
  })();
  if (deps.cache) deps.cache.pi = result;
  return result;
}

function statusInfo(ctx) {
  const pi = detectInstall(ctx);
  return {
    mark: pi ? '\u2713' : '-',
    text: pi ? `installed v${pi.version || 'unknown'}` : 'not set up',
  };
}

function doctorSetupLines(ctx) {
  ctx = ctx || {};
  const key = module.exports.key;
  const pkg = ctx.pkg || {};
  const pi = detectInstall(ctx);
  const lines = [];
  if (pi) {
    const cmp = pi.version ? ctx.dc.compareVersions(pi.version, pkg.version) : 'unknown';
    const mark = cmp === 'match' ? '\u2713' : (cmp === 'drift' ? '✗' : '-');
    lines.push(`  ${mark} ${key.padEnd(10)} installed v${pi.version || 'unknown'}`);
    if (cmp === 'drift') lines.push(`             version drift: ${pi.version} vs ${pkg.version}`);
    const piConfig = pi.manifest.pi || {};
    const resourceExists = (entries) => Array.isArray(entries) && entries.some((entry) => {
      const resourcePath = typeof entry === 'string' ? entry : entry && entry.path;
      return typeof resourcePath === 'string' && fs.existsSync(path.join(pi.path, resourcePath));
    });
    for (const [resource, provided] of [
      ['extension entry', resourceExists(piConfig.extensions)],
      ['skills directory', resourceExists(piConfig.skills)],
      ['image', typeof piConfig.image === 'string' && piConfig.image.length > 0],
    ]) lines.push(`             ${provided ? '\u2713' : '✗'} ${resource}${provided ? '' : ' not provided or missing'}`);
  } else {
    const found = module.exports.pathCheck.some((b) => isInPath(b));
    lines.push(`  ✗ ${key.padEnd(10)} not installed${found ? ' (pi binary found)' : ''} \u2014 Run: righthand setup ${key}`);
  }
  return { lines, anySetup: !!pi };
}

module.exports = {
  key: 'pi',
  type: 'spawn',
  bin: 'pi',
  args: ['install', 'npm:@agirahman/righthand'],
  aliases: [],
  label: 'Pi Coding Agent',
  pathCheck: ['pi'],
  detectInstall: detectInstall,
  statusInfo: statusInfo,
  doctorSetupLines: doctorSetupLines,
  strictLabel: 'pi package',
  strictRequiresParsed: false,
  strictData: function strictData(ctx) {
    ctx = ctx || {};
    const pi = detectInstall(ctx);
    return { installed: !!pi, version: pi && pi.version, expected: ctx.expected };
  },
};
