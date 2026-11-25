'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const registry = require('../harness/registry');
const { isInPath } = require('../harness/lib/path');

const root = path.resolve(__dirname, '..');
const skillsDir = path.join(root, 'skills');

const HARNESSES = registry.HARNESSES;

function resolveHarness(name) {
  return registry.resolveHarness(name);
}

function configBaseDir() {
  const env = process.env.XDG_CONFIG_HOME;
  if (env && path.isAbsolute(env)) return env;
  return path.join(os.homedir(), '.config');
}

function resolveDestBase(h) {
  if (h && h.destBase === 'home') return configBaseDir();
  if (h && h.destBase === 'omp') {
    // OMP keeps its extension tree under $PI_CONFIG_DIR when that override
    // is set, otherwise under ~/.omp.
    if (process.env.PI_CONFIG_DIR) return process.env.PI_CONFIG_DIR;
    return path.join(os.homedir(), '.omp');
  }
  return process.cwd();
}

function resolveDestPath(h, dest) {
  return path.join(resolveDestBase(h), dest);
}

function listSkillNames() {
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir)
    .filter((f) => !f.startsWith('.') && (() => {
      try { return fs.statSync(path.join(skillsDir, f)).isDirectory(); } catch (e) { return false; }
    })())
    .sort();
}

function skillsOwnerManifest() {
  const m = registry.skillsOwner();
  if (!m || typeof m.skillsTarget !== 'function') {
    throw new Error('no harness manifest declares a skillsTarget hook');
  }
  return m;
}

function resolveSkillTarget(harness, opts) {
  opts = opts || {};
  // Preserve historical behaviour: ignores the harness argument and always
  // resolves the skills-owning manifest's target.
  return skillsOwnerManifest().skillsTarget(opts);
}

function walkFiles(dir, base) {
  base = base || dir;
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, base));
    } else if (entry.isFile()) {
      out.push(path.relative(base, full));
    }
  }
  return out;
}

function readSafe(p) {
  try { return fs.readFileSync(p); } catch (e) { return null; }
}

function syncSkills(harness, opts) {
  opts = opts || {};
  const key = typeof harness === 'string' ? resolveHarness(harness) : harness;
  const canonical = (typeof key === 'string' && HARNESSES[key]) ? key : (typeof harness === 'string' ? String(harness).toLowerCase() : null);
  const m = canonical ? registry.getManifest(canonical) : null;
  // Only harnesses declaring a skillsTarget sync.
  if (!m || typeof m.skillsTarget !== 'function') {
    return { written: 0, unchanged: 0, files: [] };
  }
  const dryRun = !!opts.dryRun;
  const targetRoot = m.skillsTarget(opts);
  const names = listSkillNames();
  let written = 0;
  let unchanged = 0;
  const files = [];
  const failed = [];
  const skills = {};

  for (const name of names) {
    const srcRoot = path.join(skillsDir, name);
    const destRoot = path.join(targetRoot, name);
    const relFiles = walkFiles(srcRoot, srcRoot);
    const skillStats = { written: 0, unchanged: 0, failed: 0, files: [] };
    for (const rel of relFiles) {
      const srcFile = path.join(srcRoot, rel);
      const destFile = path.join(destRoot, rel);
      let srcBuf;
      try { srcBuf = fs.readFileSync(srcFile); } catch (e) { continue; }
      const destBuf = readSafe(destFile);
      const identical = destBuf !== null && Buffer.compare(srcBuf, destBuf) === 0;
      const prefixed = name + '/' + rel.split(path.sep).join('/');
      files.push(prefixed);
      skillStats.files.push(prefixed);
      if (identical) {
        unchanged++;
        skillStats.unchanged++;
        continue;
      }
      if (dryRun) {
        written++;
        skillStats.written++;
        continue;
      }
      try {
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        fs.writeFileSync(destFile, srcBuf);
        written++;
        skillStats.written++;
      } catch (e) {
        failed.push(prefixed);
        skillStats.failed++;
      }
    }
    skills[name] = skillStats;
  }
  return { written, unchanged, files, failed, skills };
}

function checkSkills(opts) {
  opts = opts || {};
  // Check the skills-owning manifest's target (reported by doctor today).
  const targetRoot = resolveSkillTarget(null, opts);
  const names = listSkillNames();
  const missingOrStale = [];
  let installed = 0;
  for (const name of names) {
    const srcRoot = path.join(skillsDir, name);
    const destRoot = path.join(targetRoot, name);
    const relFiles = walkFiles(srcRoot, srcRoot);
    let ok = relFiles.length > 0;
    for (const rel of relFiles) {
      const srcBuf = readSafe(path.join(srcRoot, rel));
      const destBuf = readSafe(path.join(destRoot, rel));
      if (srcBuf === null || destBuf === null || Buffer.compare(srcBuf, destBuf) !== 0) {
        ok = false;
        break;
      }
    }
    if (ok) installed++;
    else missingOrStale.push(name);
  }
  return { installed, total: names.length, missingOrStale };
}

module.exports = {
  HARNESSES,
  resolveHarness,
  resolveDestBase,
  resolveDestPath,
  isInPath,
  skillsDir,
  root,
  listSkillNames,
  syncSkills,
  checkSkills,
  resolveSkillTarget,
};