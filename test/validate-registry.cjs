#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

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

check('SUPPORTED_DISPATCH_HARNESSES equals ["commandcode"]', () => {
  if (!deepEqual(pc.SUPPORTED_DISPATCH_HARNESSES, ['commandcode'])) {
    throw new Error('SUPPORTED_DISPATCH_HARNESSES=' + JSON.stringify(pc.SUPPORTED_DISPATCH_HARNESSES));
  }
  if (!deepEqual(registry.dispatchable(), ['commandcode'])) {
    throw new Error('registry.dispatchable()=' + JSON.stringify(registry.dispatchable()));
  }
});

check('each manifest hook that exists is a function', () => {
  const hookNames = ['skillsTarget', 'userProfilesDir', 'listInstalled', 'detectInstall', 'contributesAnySetup'];
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

if (failed > 0) {
  console.error(`\nRegistry validation FAILED with ${failed} errors.`);
  process.exit(1);
}
console.log(`\nALL registry checks PASSED (${passed}).`);
