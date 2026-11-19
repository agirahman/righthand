'use strict';

const fs = require('fs');
const path = require('path');

const MANIFEST_KEYS = ['key', 'type', 'bin', 'args', 'aliases', 'label', 'pathCheck', 'destBase', 'legacyFiles', 'files'];

function loadRegistry(harnessRoot) {
  const root = harnessRoot || __dirname;
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const manifests = [];
  for (const dir of dirs) {
    const manifestPath = path.join(root, dir, 'manifest.js');
    if (!fs.existsSync(manifestPath)) continue;
    try { delete require.cache[require.resolve(manifestPath)]; } catch (e) {}
    const manifest = require(manifestPath);
    manifests.push(manifest);
  }

  // Preserve canonical order for console output compatibility.
  const order = { cmdc: 0, pi: 1, omp: 2, opencode: 3 };
  manifests.sort((a, b) => {
    const ai = Object.prototype.hasOwnProperty.call(order, a.key) ? order[a.key] : 99;
    const bi = Object.prototype.hasOwnProperty.call(order, b.key) ? order[b.key] : 99;
    if (ai !== bi) return ai - bi;
    return String(a.key).localeCompare(String(b.key));
  });

  const HARNESSES = {};
  for (const m of manifests) {
    const entry = {};
    for (const k of MANIFEST_KEYS) {
      if (Object.prototype.hasOwnProperty.call(m, k) && k !== 'key') {
        entry[k] = m[k];
      }
    }
    HARNESSES[m.key] = entry;
  }

  return { manifests, HARNESSES };
}

const _default = loadRegistry();

function resolveHarness(name) {
  if (!name) return null;
  const lower = String(name).toLowerCase();
  if (_default.HARNESSES[lower]) return lower;
  for (const m of _default.manifests) {
    if (m.aliases && m.aliases.indexOf(lower) !== -1) return m.key;
  }
  return null;
}

function getManifest(keyOrAlias) {
  const key = resolveHarness(keyOrAlias);
  if (!key) return null;
  for (const m of _default.manifests) {
    if (m.key === key) return m;
  }
  return null;
}

function listManifests() {
  return _default.manifests.slice();
}

function dispatchable() {
  const out = [];
  for (const m of _default.manifests) {
    if (m.dispatchable) out.push(m.dispatchAlias || m.key);
  }
  return out;
}

function defaultDispatchHarness() {
  for (const m of _default.manifests) {
    if (m.dispatchable) return m.dispatchAlias || m.key;
  }
  return null;
}

function firstWithHook(hook) {
  for (const m of _default.manifests) {
    if (typeof m[hook] === 'function') return m;
  }
  return null;
}

function skillsOwner() {
  return firstWithHook('skillsTarget');
}

module.exports = {
  HARNESSES: _default.HARNESSES,
  manifests: _default.manifests,
  resolveHarness: resolveHarness,
  getManifest: getManifest,
  listManifests: listManifests,
  dispatchable: dispatchable,
  defaultDispatchHarness: defaultDispatchHarness,
  skillsOwner: skillsOwner,
  loadRegistry: loadRegistry,
};
