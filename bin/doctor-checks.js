'use strict';

const fs = require('fs');
const path = require('path');

const pc = require('./persona-config');

const profilesDir = path.resolve(__dirname, '..', 'profiles');

function listProfileNames() {
  try {
    if (!fs.existsSync(profilesDir)) return [];
    return fs.readdirSync(profilesDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3));
  } catch (e) {
    return [];
  }
}

function checkPersonaConfig(cwd) {
  const p = pc.configPath(cwd);
  const base = {
    status: 'missing',
    path: p,
    entries: 0,
    unknownPersonas: [],
    unsupportedHarnesses: [],
  };

  if (!fs.existsSync(p)) {
    return base;
  }

  let data;
  try {
    data = pc.readConfig(cwd);
  } catch (e) {
    if (e instanceof pc.ConfigError) {
      return Object.assign({}, base, { status: 'error', message: e.message });
    }
    throw e;
  }

  const personas = (data && data.personas) || {};
  const entries = Object.keys(personas).length;
  const known = new Set(listProfileNames());
  const unknownPersonas = Object.keys(personas).filter((name) => !known.has(name));

  const unsupportedHarnesses = [];
  for (const [name, entry] of Object.entries(personas)) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry) &&
        typeof entry.harness === 'string' && entry.harness.trim() !== '' &&
        !pc.SUPPORTED_DISPATCH_HARNESSES.includes(entry.harness)) {
      unsupportedHarnesses.push({ persona: name, harness: entry.harness });
    }
  }

  return {
    status: 'ok',
    path: p,
    entries: entries,
    unknownPersonas: unknownPersonas,
    unsupportedHarnesses: unsupportedHarnesses,
  };
}

function parseModsList(output) {
  const text = String(output == null ? '' : output);
  const lines = text.split(/\r?\n/);
  // Find lines referencing righthand
  const relevant = lines.filter((l) => /righthand/i.test(l));
  const installed = relevant.length > 0;

  let version = null;
  const searchLines = relevant.length > 0 ? relevant : lines;
  for (const line of searchLines) {
    const m = line.match(/v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
    if (m) {
      version = m[1];
      break;
    }
  }
  // If no version found in relevant lines but installed, try whole output
  if (installed && version === null) {
    const m = text.match(/righthand[^\n]*?v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/i);
    if (m) version = m[1];
  }

  return { installed: installed, version: version };
}

function parseVersion(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareVersions(installed, expected) {
  const a = parseVersion(installed);
  const b = parseVersion(expected);
  if (!a || !b) return 'unknown';
  if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) return 'match';
  return 'drift';
}

module.exports = {
  checkPersonaConfig: checkPersonaConfig,
  parseModsList: parseModsList,
  compareVersions: compareVersions,
};