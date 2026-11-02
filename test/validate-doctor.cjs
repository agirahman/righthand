const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dc = require(path.join(root, 'bin', 'doctor-checks.js'));

let failed = 0;
let passed = 0;

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rh-doc-'));
}
function rmTmp(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
}
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

// 1. missing config
check('missing config', () => {
  const d = mkTmp();
  try {
    const r = dc.checkPersonaConfig(d);
    if (r.status !== 'missing') throw new Error('status ' + r.status);
    if (r.entries !== 0) throw new Error('entries');
    if (r.unknownPersonas.length !== 0) throw new Error('unknown');
    if (r.unsupportedHarnesses.length !== 0) throw new Error('unsupported');
  } finally { rmTmp(d); }
});

// 2. valid config with unknown persona name
check('valid config with unknown persona name', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personas: { 'no-such-persona': {} } }));
    const r = dc.checkPersonaConfig(d);
    if (r.status !== 'ok') throw new Error('status ' + r.status);
    if (r.entries !== 1) throw new Error('entries');
    if (r.unknownPersonas.indexOf('no-such-persona') === -1) throw new Error('unknown missing');
  } finally { rmTmp(d); }
});

// 3. config with harness: pi
check('config with harness pi', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personas: { backend: { harness: 'pi' } } }));
    const r = dc.checkPersonaConfig(d);
    if (r.status !== 'error') throw new Error('status ' + r.status);
    if (!r.message) throw new Error('no message');
  } finally { rmTmp(d); }
});

// 4. malformed JSON
check('malformed JSON', () => {
  const d = mkTmp();
  try {
    const dir = path.join(d, '.righthand');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'persona.json'), '{ not json');
    const r = dc.checkPersonaConfig(d);
    if (r.status !== 'error') throw new Error('status ' + r.status);
  } finally { rmTmp(d); }
});

// parseModsList
check('parseModsList real list', () => {
  const out = 'Mods (1)\n  righthand  v1.3.0  · user · from npm:@agirahman/righthand\n';
  const r = dc.parseModsList(out);
  if (!r.installed) throw new Error('installed');
  if (r.version !== '1.3.0') throw new Error('version ' + r.version);
});
check('parseModsList unrelated list', () => {
  const out = 'Mods (1)\n  auto-compact  · user · ~\\.commandcode\\mods\\auto-compact.ts\n';
  const r = dc.parseModsList(out);
  if (r.installed) throw new Error('installed true');
});
check('parseModsList empty', () => {
  const r = dc.parseModsList('');
  if (r.installed) throw new Error('installed true');
  if (r.version !== null) throw new Error('version');
});

// compareVersions
check('compareVersions match', () => {
  if (dc.compareVersions('1.2.0', '1.2.0') !== 'match') throw new Error('match');
  if (dc.compareVersions('v1.2.0', '1.2.0') !== 'match') throw new Error('match v');
});
check('compareVersions drift', () => {
  if (dc.compareVersions('1.2.0', '1.3.0') !== 'drift') throw new Error('drift');
});
check('compareVersions unknown', () => {
  if (dc.compareVersions('abc', '1.2.0') !== 'unknown') throw new Error('unknown');
  if (dc.compareVersions('1.2.0', null) !== 'unknown') throw new Error('unknown2');
});

// collectStrictFailures
check('collectStrictFailures healthy', () => {
  const r = dc.collectStrictFailures({
    personaConfig: { status: 'ok', entries: 1, unknownPersonas: [], unsupportedHarnesses: [] },
    skills: { installed: 8, total: 8, missingOrStale: [] },
    mod: { parsed: true, installed: true, version: '1.2.0', expected: '1.2.0' }
  });
  if (r.length !== 0) throw new Error('expected empty: ' + r.join(', '));
});
check('collectStrictFailures config error', () => {
  const r = dc.collectStrictFailures({
    personaConfig: { status: 'error', message: 'bad json', unsupportedHarnesses: [] },
    skills: { installed: 8, total: 8, missingOrStale: [] },
    mod: { parsed: true, installed: true, version: null, expected: '1.2.0' }
  });
  if (r.length === 0) throw new Error('expected failure');
});
check('collectStrictFailures unsupported harness', () => {
  const r = dc.collectStrictFailures({
    personaConfig: { status: 'ok', entries: 1, unknownPersonas: [], unsupportedHarnesses: [{ persona: 'backend', harness: 'pi' }] },
    skills: { installed: 8, total: 8, missingOrStale: [] },
    mod: { parsed: true, installed: true, version: null, expected: '1.2.0' }
  });
  if (r.length === 0) throw new Error('expected failure');
});
check('collectStrictFailures skills missing', () => {
  const r = dc.collectStrictFailures({
    personaConfig: { status: 'ok', entries: 1, unknownPersonas: [], unsupportedHarnesses: [] },
    skills: { installed: 7, total: 8, missingOrStale: ['foo'] },
    mod: { parsed: true, installed: true, version: null, expected: '1.2.0' }
  });
  if (r.length === 0) throw new Error('expected failure');
});
check('collectStrictFailures mod drift', () => {
  const r = dc.collectStrictFailures({
    personaConfig: { status: 'ok', entries: 1, unknownPersonas: [], unsupportedHarnesses: [] },
    skills: { installed: 8, total: 8, missingOrStale: [] },
    mod: { parsed: true, installed: true, version: '1.1.0', expected: '1.2.0' }
  });
  if (r.length === 0) throw new Error('expected failure');
});
check('collectStrictFailures informational only', () => {
  const r = dc.collectStrictFailures({
    personaConfig: { status: 'missing', entries: 0, unknownPersonas: ['x'], unsupportedHarnesses: [] },
    skills: { installed: 8, total: 8, missingOrStale: [] },
    mod: { parsed: false, installed: false, version: null, expected: '1.2.0' }
  });
  if (r.length !== 0) throw new Error('expected empty: ' + r.join(', '));
});

if (failed > 0) {
  console.error(`\nDoctor validation FAILED with ${failed} errors.`);
  process.exit(1);
}
console.log(`\nALL doctor checks PASSED (${passed}).`);