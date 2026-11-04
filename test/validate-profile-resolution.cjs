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
  const pkgDivDir = path.join(base, 'pkgdiv', 'profiles');
  fs.mkdirSync(pkgDivDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDivDir, 'renamed.md'), '---\nname: architect\nrole: Renamed\nmode: readonly\n---\nPKG RENAMED BODY');
  fs.writeFileSync(path.join(userDir, 'architect.md'), 'OLD USER BODY');
  fs.writeFileSync(path.join(userDir, 'editor.md'), 'RETIRED BODY');
  fs.writeFileSync(path.join(userDir, 'my-custom.md'), 'CUSTOM BODY');
  fs.mkdirSync(path.join(projDir, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(projDir, 'profiles', 'architect.md'), 'PROJECT PROFILES BODY');
  fs.writeFileSync(path.join(projDir, '.commandcode', 'profiles', 'architect.md'), 'PROJECT BODY');

  const profiles = loadAllProfiles(projDir, {
    packageDir: path.join(pkgDir, 'profiles'),
    userDir,
    projectDirs: [],
  });

  check('shipped name resolves to package body', profiles.get('architect') && profiles.get('architect').body === 'PKG BODY');

  const divProfiles = loadAllProfiles(projDir, {
    packageDir: pkgDivDir,
    userDir,
    projectDirs: [],
  });
  check('frontmatter name divergence blocks legacy', divProfiles.get('architect') && divProfiles.get('architect').body === 'PKG RENAMED BODY');
  check('retired name absent', !profiles.has('editor'));
  check('custom user persona loads', profiles.get('my-custom') && profiles.get('my-custom').body === 'CUSTOM BODY');

  const overridden = loadAllProfiles(projDir, {
    packageDir: path.join(pkgDir, 'profiles'),
    userDir,
    projectDirs: [path.join(projDir, 'profiles'), path.join(projDir, '.commandcode', 'profiles')],
  });
  check('project profiles loses to project .commandcode', overridden.get('architect') && overridden.get('architect').body === 'PROJECT BODY');

  // missing package dir: legacy loads as custom
  const missingPkg = loadAllProfiles(projDir, {
    packageDir: path.join(base, 'no-such-pkg'),
    userDir,
    projectDirs: [],
  });
  check('missing package dir loads legacy as custom', missingPkg.get('architect') && missingPkg.get('architect').body === 'OLD USER BODY');

  // zero-config call does not throw
  let zeroOk = false;
  try {
    loadAllProfiles(projDir);
    zeroOk = true;
  } catch (e) {
    zeroOk = false;
  }
  check('zero-config call does not throw', zeroOk);

  if (failed > 0) {
    console.error(`\nValidation FAILED with ${failed} errors.`);
    process.exit(1);
  }
  console.log('\nALL profile resolution checks passed!');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}