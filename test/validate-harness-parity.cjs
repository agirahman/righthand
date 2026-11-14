const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const common = require(path.join(root, 'dist', 'harness', 'common', 'index.js'));
let failed = 0;

function check(name, condition) {
  if (condition) console.log(`OK: ${name}`);
  else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

const surface = [
  'parseProfileFile', 'loadAllProfiles', 'loadAllPersonas', 'getRepoRoot',
  'getStatePath', 'readActivePersona', 'writeActivePersona', 'buildPersonaPrompt',
  'buildStatusLabel', 'parseRighthandArgs', 'completionCandidates', 'RETIRED_PERSONAS',
];
check('common API surface exports expected functions and retired list',
  surface.every((name) => Object.prototype.hasOwnProperty.call(common, name)) &&
  surface.slice(0, -1).every((name) => typeof common[name] === 'function') &&
  Array.isArray(common.RETIRED_PERSONAS) && common.RETIRED_PERSONAS.includes('editor'));

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-harness-parity-'));
try {
  const pkgDir = path.join(base, 'pkg', 'profiles');
  const pkgDivDir = path.join(base, 'pkgdiv', 'profiles');
  const userDir = path.join(base, 'user');
  const projDir = path.join(base, 'proj');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.mkdirSync(pkgDivDir, { recursive: true });
  fs.mkdirSync(userDir, { recursive: true });
  fs.mkdirSync(path.join(projDir, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(projDir, '.commandcode', 'profiles'), { recursive: true });

  fs.writeFileSync(path.join(pkgDir, 'architect.md'), 'PKG BODY');
  fs.writeFileSync(path.join(pkgDivDir, 'renamed.md'), '---\nname: architect\nrole: Renamed\nmode: readonly\n---\nPKG RENAMED BODY');
  fs.writeFileSync(path.join(userDir, 'architect.md'), 'OLD USER BODY');
  fs.writeFileSync(path.join(userDir, 'editor.md'), 'RETIRED BODY');
  fs.writeFileSync(path.join(userDir, 'my-custom.md'), 'CUSTOM BODY');
  fs.writeFileSync(path.join(projDir, 'profiles', 'architect.md'), 'PROJECT PROFILES BODY');
  fs.writeFileSync(path.join(projDir, '.commandcode', 'profiles', 'architect.md'), 'PROJECT BODY');

  const profiles = common.loadAllProfiles(projDir, {
    packageDir: pkgDir,
    userDir,
    projectDirs: [],
  });
  check('shipped name resolves to package body', profiles.get('architect')?.body === 'PKG BODY');

  const divProfiles = common.loadAllProfiles(projDir, {
    packageDir: pkgDivDir,
    userDir,
    projectDirs: [],
  });
  check('frontmatter name divergence blocks legacy copy', divProfiles.get('architect')?.body === 'PKG RENAMED BODY');
  check('retired persona absent', !profiles.has('editor'));
  check('custom user persona loads', profiles.get('my-custom')?.body === 'CUSTOM BODY');

  const overridden = common.loadAllProfiles(projDir, {
    packageDir: pkgDir,
    userDir,
    projectDirs: [path.join(projDir, 'profiles'), path.join(projDir, '.commandcode', 'profiles')],
  });
  check('project .commandcode profile overrides project profiles', overridden.get('architect')?.body === 'PROJECT BODY');

  const missingPkg = common.loadAllProfiles(projDir, {
    packageDir: path.join(base, 'no-such-pkg'),
    userDir,
    projectDirs: [],
  });
  check('missing package directory lets legacy file load as custom', missingPkg.get('architect')?.body === 'OLD USER BODY');
  let zeroArgOk = false;
  try {
    common.loadAllProfiles(projDir);
    zeroArgOk = true;
  } catch {}
  check('zero-argument profile load does not throw', zeroArgOk);

  const shippedProfiles = common.loadAllProfiles(root, {
    packageDir: path.join(root, 'profiles'),
    userDir: path.join(base, 'missing-user'),
    projectDirs: [],
  });
  const shippedPersonas = common.loadAllPersonas(root, {
    packageDir: path.join(root, 'profiles'),
    userDir: path.join(base, 'missing-user'),
    projectDirs: [],
  });
  check('flat persona wrapper matches profile map size',
    shippedPersonas instanceof Map && shippedPersonas.size === shippedProfiles.size);
  check('flat persona entries use map keys and reduced shape',
    [...shippedPersonas].every(([key, persona]) => key === persona.name &&
      !Object.prototype.hasOwnProperty.call(persona, 'label') &&
      !Object.prototype.hasOwnProperty.call(persona, 'sourcePath')));

  check('repo root walk finds package root and profiles',
    common.getRepoRoot() === root && fs.existsSync(path.join(common.getRepoRoot(), 'profiles')));

  const stateDir = path.join(base, '.righthand', 'state');
  const legacyPath = path.join(base, '.righthand', 'active-persona.json');
  fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
  fs.writeFileSync(legacyPath, JSON.stringify({ active: '  Legacy  ' }));
  check('legacy state fallback reads normalized persona', common.readActivePersona(base) === 'legacy');

  const canonicalPath = common.getStatePath(base);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(canonicalPath, JSON.stringify({ active: 'Canonical' }));
  check('canonical state wins over legacy state', common.readActivePersona(base) === 'canonical');

  fs.writeFileSync(canonicalPath, '{');
  check('corrupt canonical state does not fall through', common.readActivePersona(base) === null);

  common.writeActivePersona(base, 'worker');
  const written = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
  check('atomic write persists active persona and timestamp',
    common.readActivePersona(base) === 'worker' && written.active === 'worker' && typeof written.updatedAt === 'string');
  check('atomic write leaves no temporary file',
    JSON.stringify(fs.readdirSync(stateDir).sort()) === JSON.stringify(['active-persona.json']));

  const worker = shippedProfiles.get('worker');
  const piPrompt = `## Active RightHand Persona: worker (General Worker) [mode: writer]\n> ${worker.desc}\n\n${worker.body}`;
  check('default prompt exactly matches Pi adapter output',
    common.buildPersonaPrompt(worker) === piPrompt);
  const modPrompt = `## Active RightHand persona: ${worker.label} (writer)\nHerdr Tab: worker\n\n${worker.body}`;
  check('Command Code prompt options exactly match mod output',
    common.buildPersonaPrompt(worker, {
      heading: 'persona',
      label: worker.label,
      sections: ['Herdr Tab: ' + worker.name],
      includeDesc: false,
    }) === modPrompt);

  check('status label formats active persona and clears with undefined',
    common.buildStatusLabel({ name: 'worker', role: 'General Worker' }) === 'RightHand: worker (General Worker)' &&
    common.buildStatusLabel(null) === undefined);

  const args = [
    ['', { action: 'pick' }],
    ['pick', { action: 'pick' }],
    ['list', { action: 'list' }],
    ['off', { action: 'off' }],
    ['none', { action: 'off' }],
    ['default', { action: 'off' }],
    [' Worker ', { action: 'activate', name: 'worker' }],
    ['Worker', { action: 'activate', name: 'worker' }],
  ];
  check('argument parsing matches all required aliases and normalization',
    args.every(([input, expected]) => JSON.stringify(common.parseRighthandArgs(input)) === JSON.stringify(expected)));

  const names = [...shippedProfiles.keys()];
  const allCandidates = common.completionCandidates(names, '');
  check('completion candidates include base commands first and all shipped personas',
    names.length === 11 && allCandidates?.length === 13 &&
    allCandidates[0].value === 'list' && allCandidates[1].value === 'off');
  check('completion candidates filter prefixes and return null when empty',
    JSON.stringify(common.completionCandidates(names, 'wo')?.map((item) => item.value)) === JSON.stringify(['worker']) &&
    common.completionCandidates(names, 'zzz') === null);
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const harnessFiles = walk(path.join(root, 'harness')).filter((file) => file.endsWith('.ts'));
const duplicateDeclaration = /function\s+(?:parsePersona|parseProfileFile|getRepoRoot|getStatePath|readActivePersona|writeActivePersona)\s*\(/;
const outsideCommon = harnessFiles.filter((file) => !file.startsWith(path.join(root, 'harness', 'common') + path.sep));
check('no duplicated persona/state declarations outside harness/common',
  outsideCommon.every((file) => !duplicateDeclaration.test(fs.readFileSync(file, 'utf8'))));
const commonSource = harnessFiles
  .filter((file) => file.startsWith(path.join(root, 'harness', 'common') + path.sep))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
const wrapper = /export function loadAllPersonas\([^)]*\)\s*:\s*Map<[\s\S]*?(?=\nexport function|\nexport const|\nexport interface|$)/.exec(commonSource);
check('common tree has no parsePersona and wrapper does not walk directories',
  !/function\s+parsePersona\s*\(/.test(commonSource) && !!wrapper && !/readdirSync\s*\(/.test(wrapper[0]));

if (failed > 0) {
  console.error(`\nHarness parity validation FAILED with ${failed} errors.`);
  process.exit(1);
}
console.log(`\nALL harness parity checks passed (${surface.length} exports and behavioral fixtures).`);
