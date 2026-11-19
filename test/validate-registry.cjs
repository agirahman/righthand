#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const harnessRoot = path.join(repoRoot, 'harness');
const registry = require(path.join(harnessRoot, 'registry'));
const pc = require(path.join(repoRoot, 'bin', 'persona-config'));

let failed = 0;
let passed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`OK: ${label}`);
    passed++;
  } catch (e) {
    console.error(`FAIL: ${label} -> ${e && e.message ? e.message : e}`);
    failed++;
  }
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rh-reg-'));
}

function rmTmp(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

check('every harness dir with extension.ts or bundle.config.cjs has a manifest', () => {
  const dirs = fs.readdirSync(harnessRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  for (const dir of dirs) {
    const full = path.join(harnessRoot, dir);
    const hasExt = fs.existsSync(path.join(full, 'extension.ts'));
    const hasBundle = fs.existsSync(path.join(full, 'bundle.config.cjs'));
    if (hasExt || hasBundle) {
      const manifestPath = path.join(full, 'manifest.js');
      if (!fs.existsSync(manifestPath)) {
        throw new Error(`missing manifest for harness dir ${dir}`);
      }
    }
  }
});

check('registry HARNESSES deep-equals expected four-entry shape', () => {
  const IS_WIN = process.platform === 'win32';
  const CMDC_BIN = IS_WIN ? 'cmdc' : 'cmd';
  const expected = {
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
      legacyFiles: [
        '.opencode/plugins/righthand-server.js',
        '.opencode/plugins/righthand-tui.js',
      ],
      files: [
        { src: '.opencode-plugin/plugins/righthand-server.js', dest: 'opencode/plugins/righthand-server.js' },
        { src: '.opencode-plugin/plugins/righthand-tui.js',    dest: 'opencode/plugins/righthand-tui.js' },
      ],
    },
  };
  if (!deepEqual(registry.HARNESSES, expected)) {
    throw new Error('HARNESSES mismatch:\nexpected=' + JSON.stringify(expected) + '\nactual=' + JSON.stringify(registry.HARNESSES));
  }
  const keys = Object.keys(registry.HARNESSES);
  if (keys.join(',') !== 'cmdc,pi,omp,opencode') {
    throw new Error('HARNESSES order mismatch: ' + keys.join(','));
  }
});

check('resolveHarness alias and case behaviour', () => {
  const cases = [
    ['cmdc', 'cmdc'],
    ['commandcode', 'cmdc'],
    ['pi', 'pi'],
    ['omp', 'omp'],
    ['opencode', 'opencode'],
    ['CMDC', 'cmdc'],
    ['CommandCode', 'cmdc'],
    ['nope', null],
    ['', null],
    [null, null],
  ];
  for (const [input, expected] of cases) {
    const actual = registry.resolveHarness(input);
    if (actual !== expected) {
      throw new Error(`resolveHarness(${JSON.stringify(input)}) => ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
    }
  }
});

check('SUPPORTED_DISPATCH_HARNESSES equals ["commandcode","pi"]', () => {
  if (!deepEqual(pc.SUPPORTED_DISPATCH_HARNESSES, ['commandcode', 'pi'])) {
    throw new Error('SUPPORTED_DISPATCH_HARNESSES=' + JSON.stringify(pc.SUPPORTED_DISPATCH_HARNESSES));
  }
  if (!deepEqual(registry.dispatchable(), ['commandcode', 'pi'])) {
    throw new Error('registry.dispatchable()=' + JSON.stringify(registry.dispatchable()));
  }
});

check('each manifest hook that exists is a function', () => {
  const hookNames = ['buildLaunch', 'skillsTarget', 'userProfilesDir', 'listInstalled', 'detectInstall', 'contributesAnySetup', 'statusInfo', 'doctorSetupLines', 'doctorModLines', 'strictData'];
  for (const m of registry.listManifests()) {
    for (const name of hookNames) {
      if (Object.prototype.hasOwnProperty.call(m, name) && typeof m[name] !== 'function') {
        throw new Error(`manifest ${m.key} hook ${name} is not a function`);
      }
    }
  }
  const cmdc = registry.getManifest('cmdc');
  if (!cmdc || typeof cmdc.skillsTarget !== 'function') throw new Error('cmdc skillsTarget missing');
  if (!cmdc || typeof cmdc.userProfilesDir !== 'function') throw new Error('cmdc userProfilesDir missing');
  if (!cmdc || typeof cmdc.listInstalled !== 'function') throw new Error('cmdc listInstalled missing');
  if (!cmdc || cmdc.dispatchable !== true) throw new Error('cmdc dispatchable flag missing');
  const pi = registry.getManifest('pi');
  if (!pi || typeof pi.detectInstall !== 'function') throw new Error('pi detectInstall missing');
  for (const m of registry.listManifests()) {
    if (m.dispatchable === true && typeof m.buildLaunch !== 'function') {
      throw new Error(`dispatchable manifest ${m.key} has no buildLaunch hook`);
    }
  }
});

check('fifth-harness discovery in temp copy without editing bin/', () => {
  const tmp = mkTmp();
  try {
    const harnessTmp = path.join(tmp, 'harness');
    fs.mkdirSync(harnessTmp, { recursive: true });
    // Copy existing manifests
    for (const name of fs.readdirSync(harnessRoot)) {
      const src = path.join(harnessRoot, name);
      const dst = path.join(harnessTmp, name);
      const st = fs.statSync(src);
      if (st.isDirectory()) {
        fs.mkdirSync(dst, { recursive: true });
        for (const f of fs.readdirSync(src)) {
          fs.copyFileSync(path.join(src, f), path.join(dst, f));
        }
      } else if (st.isFile()) {
        fs.copyFileSync(src, dst);
      }
    }
    // Add a fifth harness manifest only
    const fakeDir = path.join(harnessTmp, 'fakeharness');
    fs.mkdirSync(fakeDir, { recursive: true });
    fs.writeFileSync(path.join(fakeDir, 'manifest.js'), "module.exports = { key: 'fakeharness', type: 'copy', aliases: ['fake'], label: 'Fake Harness', pathCheck: [], files: [] };\n", 'utf8');
    const loaded = registry.loadRegistry(harnessTmp);
    if (!loaded.HARNESSES.fakeharness) throw new Error('fakeharness not discovered in HARNESSES');
    const keys = Object.keys(loaded.HARNESSES);
    if (keys.indexOf('fakeharness') === -1) throw new Error('fakeharness key missing');
    const manifests = loaded.manifests.map((m) => m.key);
    if (manifests.indexOf('fakeharness') === -1) throw new Error('fakeharness manifest missing');
  } finally {
    rmTmp(tmp);
  }
});

function copyTree(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyTree(path.join(src, name), path.join(dst, name));
    }
  } else if (st.isFile()) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

const FIFTH_LABEL = 'Fifty Fifth Harness';
const FIFTH_BIN = 't72-fifth-probe-bin';

function makeCliCopy() {
  const tmp = mkTmp();
  for (const name of ['bin', 'harness', 'profiles', 'skills']) {
    copyTree(path.join(repoRoot, name), path.join(tmp, name));
  }
  for (const name of ['package.json', 'plugin.json']) {
    fs.copyFileSync(path.join(repoRoot, name), path.join(tmp, name));
  }
  const fifthDir = path.join(tmp, 'harness', 'fifth');
  fs.mkdirSync(fifthDir, { recursive: true });
  fs.writeFileSync(
    path.join(fifthDir, 'manifest.js'),
    'module.exports = {\n' +
    "  key: 'fifth',\n" +
    "  type: 'spawn',\n" +
    `  bin: '${FIFTH_BIN}',\n` +
    "  args: ['install', 'fifth'],\n" +
    '  aliases: [],\n' +
    `  label: '${FIFTH_LABEL}',\n` +
    `  pathCheck: ['${FIFTH_BIN}'],\n` +
    '};\n',
    'utf8'
  );
  return tmp;
}

function runCli(tmp, args, env) {
  const r = spawnSync(process.execPath, [path.join(tmp, 'bin', 'righthand.js'), ...args], {
    cwd: tmp,
    encoding: 'utf8',
    timeout: 60000,
    env: env || process.env,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

check('fifth spawn harness appears in CLI status output', () => {
  const tmp = makeCliCopy();
  try {
    const r = runCli(tmp, ['status']);
    if (r.status !== 0) throw new Error(`status exited ${r.status}: ${r.stderr.trim()}`);
    if (!/^ {2}[\u2713-] fifth: /m.test(r.stdout)) {
      throw new Error('status did not list the fifth harness:\n' + r.stdout);
    }
  } finally {
    rmTmp(tmp);
  }
});

check('fifth spawn harness appears in CLI doctor output', () => {
  const tmp = makeCliCopy();
  try {
    const r = runCli(tmp, ['doctor']);
    if (r.status === null) throw new Error('doctor failed to run');
    const pathLine = new RegExp('^ {2}[\\u2713\\u2717] ' + FIFTH_BIN + ' ', 'm');
    if (!pathLine.test(r.stdout)) {
      throw new Error('doctor PATH section did not include the fifth harness bin:\n' + r.stdout);
    }
    if (!/^ {2}[\u2713\u2717] fifth\s+\S/m.test(r.stdout)) {
      throw new Error('doctor Setup Status did not list the fifth harness:\n' + r.stdout);
    }
  } finally {
    rmTmp(tmp);
  }
});

check('CLI setup accepts the fifth spawn harness with --dry-run', () => {
  const tmp = makeCliCopy();
  try {
    const r = runCli(tmp, ['setup', 'fifth', '--dry-run']);
    if (r.status !== 0) throw new Error(`setup exited ${r.status}: ${r.stderr.trim()}`);
    if (r.stdout.indexOf(`[${FIFTH_LABEL}]`) === -1) {
      throw new Error('setup did not print the fifth harness label:\n' + r.stdout);
    }
  } finally {
    rmTmp(tmp);
  }
});

check('status uses strict cmdc probe while doctor stays lenient on nonzero exit', () => {
  const tmp = makeCliCopy();
  try {
    const fakeBin = path.join(tmp, 'fakebin');
    fs.mkdirSync(fakeBin, { recursive: true });
    const listBody = [
      'Mods (1)',
      '  righthand  v9.9.9  - user - from npm:@agirahman/righthand',
    ];
    if (process.platform === 'win32') {
      fs.writeFileSync(
        path.join(fakeBin, 'cmdc.cmd'),
        '@echo off\r\n' + listBody.map((l) => 'echo ' + l + '\r\n').join('') + 'exit /b 1\r\n',
        'utf8'
      );
    } else {
      // The fake must be named `cmdc` here, not `cmd`: the cmdc manifest's
      // listInstalled() spawns `cmdc` on every platform, while CMDC_BIN
      // (`cmd` on non-win32) only names the spawn bin and the PATH check.
      // Renaming this file to `cmd` would make the check a Linux no-op.
      const script = path.join(fakeBin, 'cmdc');
      fs.writeFileSync(script, '#!/bin/sh\n' + listBody.map((l) => 'echo "' + l + '"\n').join('') + 'exit 1\n', 'utf8');
      fs.chmodSync(script, 0o755);
    }
    const delim = process.platform === 'win32' ? ';' : ':';
    const env = { ...process.env, PATH: fakeBin + delim + (process.env.PATH || '') };
    delete env.HERDR_PANE_ID;

    const st = runCli(tmp, ['status'], env);
    if (st.status !== 0) throw new Error(`status exited ${st.status}: ${st.stderr.trim()}`);
    if (!/^ {2}- cmdc: not set up or unverified/m.test(st.stdout)) {
      throw new Error('status treated a nonzero-exit mods list as installed:\n' + st.stdout);
    }

    const doc = runCli(tmp, ['doctor'], env);
    if (doc.status === null) throw new Error('doctor failed to run');
    if (!/^ {2}[\u2713\u2717-] mod: installed v9\.9\.9/m.test(doc.stdout)) {
      throw new Error('doctor no longer accepts a nonzero-exit mods list:\n' + doc.stdout);
    }
  } finally {
    rmTmp(tmp);
  }
});

if (failed > 0) {
  console.error(`\nRegistry validation FAILED with ${failed} errors.`);
  process.exit(1);
}
console.log(`\nALL registry checks PASSED (${passed}).`);