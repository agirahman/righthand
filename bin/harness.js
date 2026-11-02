'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const skillsDir = path.join(root, 'skills');

const IS_WIN = process.platform === 'win32';
const CMDC_BIN = IS_WIN ? 'cmdc' : 'cmd';

const HARNESSES = {
  cmdc: {
    type: 'spawn',
    bin: CMDC_BIN,
    args: ['mods', 'add', '-g', '@agirahman/righthand'],
    aliases: ['commandcode'],
    label: 'Command Code',
    pathCheck: [CMDC_BIN],
  },
  pi: {
    type: 'spawn',
    bin: 'pi',
    args: ['install', 'npm:@agirahman/righthand'],
    aliases: [],
    label: 'Pi Coding Agent',
    pathCheck: ['pi'],
  },
  omp: {
    type: 'copy',
    aliases: [],
    label: 'Oh-My-Pi (OMP)',
    pathCheck: [],
    files: [
      { src: '.omp/extensions/righthand.ts', dest: '.omp/extensions/righthand.ts' },
    ],
  },
  opencode: {
    type: 'copy',
    aliases: [],
    label: 'OpenCode',
    pathCheck: ['opencode'],
    destBase: 'home',
    legacyFiles: ['.opencode/plugins/righthand-server.js', '.opencode/plugins/righthand-tui.js'],
    files: [
      { src: '.opencode-plugin/plugins/righthand-server.js', dest: 'opencode/plugins/righthand-server.js' },
      { src: '.opencode-plugin/plugins/righthand-tui.js',    dest: 'opencode/plugins/righthand-tui.js' },
    ],
  },
};

function resolveHarness(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (HARNESSES[lower]) return lower;
  for (const [key, cfg] of Object.entries(HARNESSES)) {
    if (cfg.aliases && cfg.aliases.includes(lower)) return key;
  }
  return null;
}

function configBaseDir() {
  const env = process.env.XDG_CONFIG_HOME;
  if (env && path.isAbsolute(env)) return env;
  return path.join(os.homedir(), '.config');
}

function resolveDestBase(h) {
  if (h && h.destBase === 'home') return configBaseDir();
  return process.cwd();
}

function resolveDestPath(h, dest) {
  return path.join(resolveDestBase(h), dest);
}

function isInPath(bin) {
  const { spawnSync } = require('child_process');
  const cmd = IS_WIN ? `where ${bin}` : `which ${bin}`;
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function listSkillNames() {
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir)
    .filter((f) => !f.startsWith('.') && (() => {
      try { return fs.statSync(path.join(skillsDir, f)).isDirectory(); } catch (e) { return false; }
    })())
    .sort();
}

function resolveSkillTarget(harness, opts) {
  opts = opts || {};
  const candidates = [opts.dest, opts.destination, opts.target, opts.targetDir, opts.destDir];
  for (const c of candidates) {
    if (c) return c;
  }
  const home = opts.home || os.homedir();
  return path.join(home, '.commandcode', 'skills');
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
  const canonical = (typeof key === 'string' && HARNESSES[key]) ? key : (typeof harness === 'string' ? harness.toLowerCase() : null);
  // Only cmdc is supported for skill sync.
  if (canonical !== 'cmdc') {
    return { written: 0, unchanged: 0, files: [] };
  }
  const dryRun = !!opts.dryRun;
  const targetRoot = resolveSkillTarget('cmdc', opts);
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
  const targetRoot = resolveSkillTarget('cmdc', opts);
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