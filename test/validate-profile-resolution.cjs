const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mod = require(path.join(root, 'dist', '.commandcode-mod', 'mods', 'righthand.js'));
const { loadAllProfiles, RETIRED_PERSONAS } = mod;

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`OK: ${name}`);
  else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

// retired lists match between mod and bin/righthand.js
const binSrc = fs.readFileSync(path.join(root, 'bin', 'righthand.js'), 'utf8');
const m = binSrc.match(/const RETIRED_PERSONAS\s*=\s*\[([^\]]*)\]/);
const binList = m
  ? (m[1].match(/'([^']*)'/g) || []).map((s) => s.slice(1, -1))
  : null;
check('retired lists match', Array.isArray(binList) && JSON.stringify(binList) === JSON.stringify(RETIRED_PERSONAS));

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-prof-'));
try {
  const pkgDir = path.join(base, 'pkg');
  const userDir = path.join(base, 'user');
  const projDir = path.join(base, 'proj');
  fs.mkdirSync(path.join(pkgDir, 'profiles'), { recursive: true });
  fs.mkdirSync(userDir, { recursive: true });
  fs.mkdirSync(path.join(projDir, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(projDir, '.commandcode', 'profiles'), { recursive: true });

  fs.writeFileSync(path.join(pkgDir, 'profiles', 'architect.md'), 'PKG BODY');
  fs.writeFileSync(path.join(userDir, 'architect.md'), 'OLD USER BODY');
  fs.writeFileSync(path.join(userDir, 'editor.md'), 'RETIRED BODY');
  fs.writeFileSync(path.join(userDir, 'my-custom.md'), 'CUSTOM BODY');
  fs.writeFileSync(path.join(projDir, '.commandcode', 'profiles', 'architect.md'), 'PROJECT BODY');

  const profiles = loadAllProfiles(projDir, {
    packageDir: path.join(pkgDir, 'profiles'),
    userDir,
    projectDirs: [],
  });

  check('shipped name resolves to package body', profiles.get('architect') && profiles.get('architect').body === 'PKG BODY');
  check('retired name absent', !profiles.has('editor'));
  check('custom user persona loads', profiles.get('my-custom') && profiles.get('my-custom').body === 'CUSTOM BODY');

  const overridden = loadAllProfiles(projDir, {
    packageDir: path.join(pkgDir, 'profiles'),
    userDir,
    projectDirs: [path.join(projDir, 'profiles'), path.join(projDir, '.commandcode', 'profiles')],
  });
  check('project-level overrides both', overridden.get('architect') && overridden.get('architect').body === 'PROJECT BODY');

  if (failed > 0) {
    console.error(`\nValidation FAILED with ${failed} errors.`);
    process.exit(1);
  }
  console.log('\nALL profile resolution checks passed!');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}