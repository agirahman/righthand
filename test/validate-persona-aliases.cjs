const path = require('node:path');
const root = path.join(__dirname, '..');
const common = require(path.join(root, 'dist', 'harness', 'common', 'index.js'));
const { CANONICAL_PERSONAS, PERSONA_ALIASES, LEGACY_PERSONAS, resolvePersonaName } = common;

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

if (failed > 0) {
  console.error('\nPersona alias validation FAILED with ' + failed + ' errors.');
  process.exit(1);
}
console.log('\nALL persona alias checks passed!');
