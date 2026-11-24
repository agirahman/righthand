const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const common = require(path.join(root, 'dist', 'harness', 'common', 'index.js'));
const { CANONICAL_PERSONAS, PERSONA_ALIASES, LEGACY_PERSONAS, resolvePersonaName, loadAllProfiles } = common;
const binAliases = require(path.join(root, 'bin', 'persona-aliases.js'));

let failed = 0;
function check(name, cond) {
  if (cond) {
    console.log('OK: ' + name);
  } else {
    console.error('FAIL: ' + name);
    failed++;
  }
}

check('exactly six canonical personas', CANONICAL_PERSONAS.length === 6);
check('canonical names are unique lowercase words',
  new Set(CANONICAL_PERSONAS).size === 6 && CANONICAL_PERSONAS.every((n) => /^[a-z][a-z-]*$/.test(n)));

const canonSet = new Set(CANONICAL_PERSONAS);
check('every alias target is a canonical persona',
  Object.values(PERSONA_ALIASES).every((v) => canonSet.has(v)));
check('no alias key is itself a canonical persona',
  Object.keys(PERSONA_ALIASES).every((k) => !canonSet.has(k)));

check('all eleven legacy personas are mapped to a canonical one',
  LEGACY_PERSONAS.length === 11 && LEGACY_PERSONAS.every((n) => canonSet.has(PERSONA_ALIASES[n])));
check('every legacy persona resolves onto a canonical persona',
  LEGACY_PERSONAS.every((n) => canonSet.has(resolvePersonaName(n).canonical)));

check('a canonical name resolves to itself, not an alias',
  CANONICAL_PERSONAS.every((c) => {
    const r = resolvePersonaName(c);
    return r.canonical === c && r.aliasedFrom === null;
  }));
check('resolution is case-insensitive',
  resolvePersonaName('Architect').canonical === 'index' &&
  resolvePersonaName('CODE-REVIEWER').canonical === 'middle');
check('resolution is idempotent',
  LEGACY_PERSONAS.every((n) => {
    const once = resolvePersonaName(n);
    const twice = resolvePersonaName(once.canonical);
    return twice.canonical === once.canonical && twice.aliasedFrom === null;
  }));
check('unknown names pass through unchanged',
  (() => { const r = resolvePersonaName('my-custom'); return r.canonical === 'my-custom' && r.aliasedFrom === null; })());

// The CLI is plain CommonJS and cannot require the TypeScript source, so it
// keeps its own copy of the table. The two copies must answer identically.
check('bin alias table lists the same canonical personas',
  JSON.stringify(binAliases.CANONICAL_PERSONAS) === JSON.stringify(CANONICAL_PERSONAS));
check('bin alias table lists the same legacy personas',
  JSON.stringify(binAliases.LEGACY_PERSONAS) === JSON.stringify(LEGACY_PERSONAS));
check('bin alias table maps the same names onto the same targets',
  JSON.stringify(Object.entries(binAliases.PERSONA_ALIASES).sort()) === JSON.stringify(Object.entries(PERSONA_ALIASES).sort()));
check('bin resolver agrees with the shared resolver on every known name',
  Object.keys(PERSONA_ALIASES).concat(CANONICAL_PERSONAS, LEGACY_PERSONAS, ['unknown-name', 'Palm'])
    .every((n) => {
      const a = binAliases.resolvePersonaName(n);
      const b = resolvePersonaName(n);
      return a.canonical === b.canonical && a.aliasedFrom === b.aliasedFrom;
    }));

// The loaders are the single seam every harness goes through, so an alias must
// resolve there without ever appearing as its own persona.
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-alias-'));
try {
  const pkgDir = path.join(base, 'pkg', 'profiles');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'palm.md'), '---\nname: palm\nrole: Team Orchestrator\nmode: readonly\n---\nPALM BODY');
  fs.writeFileSync(path.join(pkgDir, 'thumb.md'), '---\nname: thumb\nrole: Builder\nmode: writer\n---\nTHUMB BODY');

  const profiles = loadAllProfiles(base, {
    packageDir: pkgDir,
    userDir: path.join(base, 'no-user-dir'),
    projectDirs: [],
  });
  check('a retired name resolves to its canonical persona',
    profiles.get('orchestrator') && profiles.get('orchestrator').name === 'palm');
  check('a retirement alias resolves case-insensitively',
    profiles.get('Backend') && profiles.get('Backend').name === 'thumb');
  check('an alias is not itself a registered persona', profiles.has('backend') === false);
  check('an unknown name still resolves to nothing', profiles.get('my-custom') === undefined);
  check('the map still lists only the canonical personas',
    JSON.stringify([...profiles.keys()].sort()) === JSON.stringify(['palm', 'thumb']));

  // End to end through the CLI: a habit, a script, or an old README keeps
  // working, and the state file stores the canonical name.
  const cliCwd = fs.mkdtempSync(path.join(base, 'cwd-'));
  const run = (args) => spawnSync(process.execPath, [path.join(root, 'bin', 'righthand.js')].concat(args), {
    cwd: cliCwd,
    encoding: 'utf8',
  });
  const switched = run(['switch', 'backend']);
  check('CLI switch accepts a retired name', switched.status === 0 && /Active persona set to: thumb/.test(switched.stdout));
  const stateFile = path.join(cliCwd, '.righthand', 'state', 'active-persona.json');
  check('CLI switch stores the canonical persona',
    fs.existsSync(stateFile) && JSON.parse(fs.readFileSync(stateFile, 'utf8')).active === 'thumb');
  const injected = run(['inject']);
  check('CLI inject uses the canonical persona',
    injected.status === 0 && /## Active RightHand persona: thumb/.test(injected.stdout));
  const rejected = run(['switch', 'my-custom']);
  check('CLI switch still rejects an unknown name', rejected.status === 1 && /Unknown persona: my-custom/.test(rejected.stderr));
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}

if (failed > 0) {
  console.error('\nPersona alias validation FAILED with ' + failed + ' errors.');
  process.exit(1);
}
console.log('\nALL persona alias checks passed!');
