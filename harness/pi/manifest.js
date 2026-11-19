'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const IS_WIN = process.platform === 'win32';

function isInPath(bin) {
  const cmd = IS_WIN ? `where ${bin}` : `which ${bin}`;
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function detectInstall(deps) {
  deps = deps || {};
  const dc = deps.dc || require('../../bin/doctor-checks');
  if (!isInPath('pi')) return null;
  const r = IS_WIN
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'pi list'], { encoding: 'utf8', timeout: 10000, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawnSync('pi', ['list'], { encoding: 'utf8', timeout: 10000, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!r || r.error || r.status !== 0) return null;
  const installed = dc.parsePiList(r.stdout).find((p) => p.id === 'npm:@agirahman/righthand');
  if (!installed || !installed.path) return null;
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(installed.path, 'package.json'), 'utf8')); } catch (e) { return null; }
  if (manifest.name !== '@agirahman/righthand') return null;
  return { path: installed.path, version: manifest.version || installed.version, manifest: manifest };
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
  strictLabel: 'pi package',
  strictRequiresParsed: false,
  strictData: function strictData(ctx) {
    ctx = ctx || {};
    const piPackage = ctx.piPackage;
    return { installed: !!piPackage, version: piPackage && piPackage.version, expected: ctx.expected };
  },
};