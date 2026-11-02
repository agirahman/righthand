#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readState, writeState } = require('./state');
const { readConfig, resolvePersona, formatResolution, ConfigError } = require('./persona-config');

const pkg = require('../package.json');
const root = path.resolve(__dirname, '..');
const profilesDir = path.join(root, 'profiles');
const skillsDir = path.join(root, 'skills');

const IS_WIN = process.platform === 'win32';
const CMDC_BIN = IS_WIN ? 'cmdc' : 'cmd';

// ---------------------------------------------------------------------------
// Harness table (data-driven)
// ---------------------------------------------------------------------------
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

// Resolve alias → canonical name
function resolveHarness(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (HARNESSES[lower]) return lower;
  for (const [key, cfg] of Object.entries(HARNESSES)) {
    if (cfg.aliases && cfg.aliases.includes(lower)) return key;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Destination resolution (shared by setup/update/doctor)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Persona helpers
// ---------------------------------------------------------------------------
function listProfiles() {
  if (!fs.existsSync(profilesDir)) return [];
  return fs.readdirSync(profilesDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3))
    .sort();
}

function loadProfile(name) {
  const p = path.join(profilesDir, `${name}.md`);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

// ---------------------------------------------------------------------------
// PATH check
// ---------------------------------------------------------------------------
function isInPath(bin) {
  const cmd = IS_WIN ? `where ${bin}` : `which ${bin}`;
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
function cmdVersion() {
  console.log(`righthand v${pkg.version}`);
}

function cmdInit() {
  const cwd = process.cwd();
  const rhDir = path.join(cwd, '.righthand');
  const dirs = ['.righthand/tickets', '.righthand/skills', '.righthand/state'];

  // Validate .righthand itself
  if (fs.existsSync(rhDir)) {
    const st = fs.statSync(rhDir);
    if (!st.isDirectory()) {
      console.error('Error: .righthand exists and is not a directory');
      process.exit(1);
    }
  }

  for (const rel of dirs) {
    const full = path.join(cwd, rel);
    if (fs.existsSync(full)) {
      const st = fs.statSync(full);
      if (!st.isDirectory()) {
        console.error(`Error: ${rel} exists and is not a directory`);
        process.exit(1);
      }
      console.log(`${rel} exists`);
    } else {
      fs.mkdirSync(full, { recursive: true });
      console.log(`${rel} created`);
    }
  }

  // .gitignore handling
  const giPath = path.join(cwd, '.gitignore');
  const line = '.righthand/';
  let giStatus = 'unchanged';
  if (!fs.existsSync(giPath)) {
    fs.writeFileSync(giPath, line + '\n');
    giStatus = 'updated';
  } else {
    const raw = fs.readFileSync(giPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const has = lines.some(l => l.trim() === line);
    if (!has) {
      let content = raw;
      if (content.length > 0 && !content.endsWith('\n')) content += '\n';
      content += line + '\n';
      fs.writeFileSync(giPath, content);
      giStatus = 'updated';
    }
  }
  console.log(`.gitignore ${giStatus}`);
}

function cmdHelp() {
  console.log(`
RightHand v${pkg.version} — specialist agent personas for coding harnesses

Usage: righthand [command] [args]

Persona Commands:
  list                     List all personas
  switch <persona>         Activate a persona
  off                      Deactivate current persona
  inject                   Print active persona prompt to stdout
  status                   Show active persona and setup harnesses

Setup Commands:
  init                     Initialize .righthand/ in current project
  setup <harness|all>      Install RightHand into a harness
  update [harness]         Re-sync harness files (omp/opencode) after npm update
  doctor                   Check harness availability and setup health

Dispatch Commands:
  config [persona]         Resolve dispatch harness and model for a persona

Harnesses: cmdc (commandcode), pi, omp, opencode

Flags:
  -v, --version            Print version
  -h, --help               Print this help

Examples:
  righthand list
  righthand switch backend
  righthand off
  righthand setup pi
  righthand setup all
  righthand doctor
  righthand config code-reviewer
`.trim());
}

function cmdList() {
  const names = listProfiles();
  const state = readState(process.cwd());
  console.log('RightHand personas:');
  for (const n of names) {
    const mark = state.active === n ? ' [ACTIVE]' : '';
    console.log(`  - ${n}${mark}`);
  }
  console.log('\nUsage: righthand switch <name> | righthand off | righthand inject');
}

function cmdSwitch(name) {
  if (!name) {
    console.error('Usage: righthand switch <persona>');
    process.exit(1);
  }
  const names = listProfiles();
  if (!names.includes(name)) {
    console.error(`Unknown persona: ${name}`);
    console.error(`Available: ${names.join(', ')}`);
    process.exit(1);
  }
  writeState({ active: name, updatedAt: new Date().toISOString() }, process.cwd());
  console.log(`Active persona set to: ${name}`);
}

function cmdOff() {
  writeState({ active: null, updatedAt: new Date().toISOString() }, process.cwd());
  console.log('Persona deactivated');
}

function cmdInject() {
  const state = readState(process.cwd());
  if (!state.active) return;
  const raw = loadProfile(state.active);
  if (!raw) return;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const body = m ? m[2] : raw;
  console.log(`## Active RightHand persona: ${state.active}\n\n${body.trim()}\n`);
}

function cmdStatus() {
  const state = readState(process.cwd());

  if (state.active) {
    console.log(`Active persona : ${state.active}`);
    if (state.updatedAt) console.log(`Last updated   : ${state.updatedAt}`);
  } else {
    console.log('Active persona : none');
    console.log('Run: righthand switch <persona>');
  }
}

function cmdConfig(personaArg) {
  const cwd = process.cwd();
  const names = listProfiles();
  let config;
  try {
    config = readConfig(cwd);
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`Error: ${e.message}`);
      process.exit(2);
    }
    throw e;
  }

  const configPersonas = (config && config.personas) || {};
  for (const key of Object.keys(configPersonas)) {
    if (!names.includes(key)) {
      console.error(`Warning: .righthand/persona.json configures unknown persona "${key}"`);
    }
  }

  const om = (function () {
    try {
      const pc = require('./persona-config');
      return pc.orchestratorModel();
    } catch (e) {
      return null;
    }
  })();

  if (personaArg) {
    if (!names.includes(personaArg)) {
      console.error(`Unknown persona: ${personaArg}`);
      console.error(`Available: ${names.join(', ')}`);
      process.exit(1);
    }
    try {
      console.log(formatResolution(cwd, personaArg, { orchestratorModel: om }));
    } catch (e) {
      if (e instanceof ConfigError) {
        console.error(`Error: ${e.message}`);
        process.exit(2);
      }
      throw e;
    }
    return;
  }

  for (const n of names) {
    try {
      console.log(formatResolution(cwd, n, { orchestratorModel: om }));
    } catch (e) {
      if (e instanceof ConfigError) {
        console.error(`Error: ${e.message}`);
        process.exit(2);
      }
      throw e;
    }
  }
}

function cmdSetup(target) {
  const cwd = process.cwd();
  const targets = target === 'all'
    ? Object.keys(HARNESSES)
    : target ? [resolveHarness(target)].filter(Boolean) : null;

  if (!targets || targets.length === 0) {
    console.error(`Unknown harness: ${target}`);
    console.error(`Available: ${Object.keys(HARNESSES).join(', ')}, all`);
    process.exit(1);
  }

  for (const key of targets) {
    const h = HARNESSES[key];
    console.log(`\n[${h.label}]`);

    if (h.type === 'spawn') {
      // Check binary available
      if (!isInPath(h.bin)) {
        console.log(`  ✗ "${h.bin}" not found in PATH — install ${h.label} first`);
        continue;
      }
      console.log(`  → running: ${h.bin} ${h.args.join(' ')}`);
      const r = spawnSync(h.bin, h.args, { shell: true, stdio: 'inherit' });
      if (r.status === 0) {
        console.log(`  ✓ installed via ${h.bin}`);
      } else {
        console.log(`  ✗ install failed (exit ${r.status})`);
      }
    } else if (h.type === 'copy') {
      let ok = true;
      for (const { src, dest } of h.files) {
        const srcPath = path.join(root, src);
        const destPath = resolveDestPath(h, dest);
        if (!fs.existsSync(srcPath)) {
          console.log(`  ✗ source not found: ${src}`);
          ok = false;
          continue;
        }
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        console.log(`  ✓ copied → ${destPath}`);
      }
    }
  }
}

function cmdUpdate(target) {
  const cwd = process.cwd();

  // Determine copy harness candidates
  const allCopy = Object.keys(HARNESSES).filter(k => HARNESSES[k].type === 'copy');
  const copyCandidates = target
    ? [resolveHarness(target)].filter(k => k && HARNESSES[k]?.type === 'copy')
    : allCopy;

  // spawn targets
  const spawnTargets = target
    ? [resolveHarness(target)].filter(k => k && HARNESSES[k]?.type === 'spawn')
    : [];

  // Check if any copy harness has existing destination files
  const existingCopy = copyCandidates.filter(key => {
    const h = HARNESSES[key];
    return h.files.some(({ dest }) => fs.existsSync(resolveDestPath(h, dest)));
  });

  if (copyCandidates.length > 0 && existingCopy.length === 0 && spawnTargets.length === 0) {
    console.log('No harness files found. Run: righthand setup <harness>');
    return;
  }

  if (existingCopy.length > 0) {
    console.log('Re-syncing harness files...');
    for (const key of existingCopy) {
      const h = HARNESSES[key];
      console.log(`\n[${h.label}]`);
      for (const { src, dest } of h.files) {
        const srcPath = path.join(root, src);
        const destPath = resolveDestPath(h, dest);
        if (!fs.existsSync(srcPath)) {
          console.log(`  ✗ source not found: ${src}`);
          continue;
        }
        if (!fs.existsSync(path.dirname(destPath))) {
          console.log(`  ✗ dest folder not found: ${path.dirname(destPath)} (run setup first?)`);
          continue;
        }
        if (!fs.existsSync(destPath)) {
          // only re-sync existing files
          continue;
        }
        fs.copyFileSync(srcPath, destPath);
        console.log(`  ✓ updated → ${destPath}`);
      }
    }
  }

  // Spawn harnesses (cmdc/pi) auto-update via package manager
  if (spawnTargets.length > 0) {
    for (const key of spawnTargets) {
      const h = HARNESSES[key];
      console.log(`\n[${h.label}] — updating via package manager`);
      if (!isInPath(h.bin)) {
        console.log(`  ✗ "${h.bin}" not found in PATH`);
        continue;
      }
      const r = spawnSync(h.bin, h.args, { shell: true, stdio: 'inherit' });
      if (r.status === 0) {
        console.log(`  ✓ updated`);
      } else {
        console.log(`  ✗ update failed (exit ${r.status})`);
      }
    }
  }

  if (existingCopy.length === 0 && spawnTargets.length === 0) {
    // maybe target copy with no existing files
    if (copyCandidates.length > 0) {
      console.log('No harness files found. Run: righthand setup <harness>');
    } else {
      console.log('Nothing to update. For Pi/CommandCode, use their own package manager.');
    }
  }
}

function cmdDoctor() {
  const cwd = process.cwd();
  console.log(`RightHand Doctor v${pkg.version}`);
  console.log('══════════════════════════════\n');

  // Package health
  const profileCount = listProfiles().length;
  const skillCount = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).filter(f => !f.startsWith('.')).length : 0;
  console.log('Package:');
  console.log(`  ✓ righthand  v${pkg.version}`);
  console.log(`  ${profileCount > 0 ? '✓' : '✗'} profiles   ${profileCount} personas`);
  console.log(`  ${skillCount > 0 ? '✓' : '✗'} skills     ${skillCount} skills`);

  // Harness PATH check
  console.log('\nHarness PATH:');
  for (const [key, h] of Object.entries(HARNESSES)) {
    if (h.pathCheck && h.pathCheck.length > 0) {
      const found = h.pathCheck.some(b => isInPath(b));
      const displayBin = h.pathCheck.join(' / ');
      const extra = key === 'cmdc' ? ` (${IS_WIN ? 'Windows: cmdc' : 'Linux/macOS: cmd'})` : '';
      console.log(`  ${found ? '✓' : '✗'} ${displayBin.padEnd(12)} ${found ? 'found' : 'not in PATH'}${extra}`);
    } else {
      console.log(`  - ${key.padEnd(12)} auto-discovered (no binary)`);
    }
  }

  // Setup status
  console.log('\nSetup Status (this project):');
  console.log(`  righthand initialized: ${fs.existsSync(path.join(cwd, '.righthand', 'tickets')) ? 'yes' : 'no'}`);

  let anySetup = false;

  for (const [key, h] of Object.entries(HARNESSES)) {
    if (h.type === 'copy') {
      const allExist = h.files.every(({ dest }) => fs.existsSync(resolveDestPath(h, dest)));
      const status = allExist ? '✓' : '✗';
      if (allExist) anySetup = true;
      console.log(`  ${status} ${key.padEnd(10)} ${allExist ? 'files present' : 'not set up'}`);
      for (const { dest } of h.files) {
        const destPath = resolveDestPath(h, dest);
        const exists = fs.existsSync(destPath);
        console.log(`             ${exists ? '✓' : '✗'} ${destPath}`);
      }
      if (!allExist) {
        console.log(`             Run: righthand setup ${key}`);
      }
      if (h.legacyFiles) {
        const stale = h.legacyFiles
          .map(p => path.isAbsolute(p) ? p : path.join(os.homedir(), p))
          .filter(p => fs.existsSync(p));
        if (stale.length > 0) {
          console.log(`             ⚠ legacy stale install found (remove manually):`);
          for (const p of stale) console.log(`               ${p}`);
        }
      }
    } else if (h.type === 'spawn') {
      const found = h.pathCheck && h.pathCheck.length > 0 ? h.pathCheck.some(b => isInPath(b)) : false;
      console.log(`  - ${key.padEnd(10)} installed globally via ${h.bin}`);
      if (found) anySetup = true;
    }
  }

  // Active persona
  const state = readState(cwd);
  console.log(`\nActive Persona: ${state.active ? `${state.active}` : 'none'}`);
}

// ---------------------------------------------------------------------------
// CLI routing
// ---------------------------------------------------------------------------
const [,, cmd, arg] = process.argv;

if (!cmd || cmd === 'list') {
  cmdList();
} else if (cmd === 'switch') {
  cmdSwitch(arg);
} else if (cmd === 'off') {
  cmdOff();
} else if (cmd === 'inject') {
  cmdInject();
} else if (cmd === 'status') {
  cmdStatus();
} else if (cmd === 'init') {
  cmdInit();
} else if (cmd === 'setup') {
  cmdSetup(arg || 'all');
} else if (cmd === 'update') {
  cmdUpdate(arg);
} else if (cmd === 'doctor') {
    cmdDoctor();
  } else if (cmd === 'config') {
    cmdConfig(arg);
  } else if (cmd === '-v' || cmd === '--version' || cmd === 'version') {
  cmdVersion();
} else if (cmd === '-h' || cmd === '--help' || cmd === 'help') {
  cmdHelp();
} else {
  console.error(`Unknown command: ${cmd}`);
  console.error('Run: righthand --help');
  process.exit(1);
}
