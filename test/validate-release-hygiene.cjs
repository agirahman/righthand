const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

console.log('Checking release hygiene: spawn writer roles, manifest versions, doc counts...');

let failed = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`OK ${label}`);
  } else {
    console.error(`FAIL: [release-hygiene] ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

// The writer set is derived from profiles/, never hard-coded, so it stays correct
// when personas are added, merged, or retired.
const profilesDir = path.join(root, 'profiles');
const writers = [];
for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
  const raw = fs.readFileSync(path.join(profilesDir, entry.name), 'utf8');
  if (/^mode:\s*writer\s*$/m.test(raw)) writers.push(path.basename(entry.name, '.md'));
}
check('profiles declare at least one writer', writers.length > 0, `found ${writers.length}`);

const ps1 = fs.readFileSync(path.join(root, 'scripts', 'herdr-spawn.ps1'), 'utf8');
const sh = fs.readFileSync(path.join(root, 'scripts', 'herdr-spawn.sh'), 'utf8');

function quotedList(source, regex) {
  const m = source.match(regex);
  if (!m) return null;
  return Array.from(m[1].matchAll(/'([^']+)'|"([^"]+)"/g)).map((x) => x[1] || x[2]);
}

const ps1Roles = quotedList(ps1, /\$WriterRoles\s*=\s*@\(([^)]*)\)/);
const shRoles = quotedList(sh, /WRITER_ROLES=\(([^)]*)\)/);

check('herdr-spawn.ps1 declares WriterRoles', Array.isArray(ps1Roles));
check('herdr-spawn.sh declares WRITER_ROLES', Array.isArray(shRoles));
for (const writer of writers) {
  check(`herdr-spawn.ps1 treats ${writer} as a writer`, (ps1Roles || []).includes(writer));
  check(`herdr-spawn.sh treats ${writer} as a writer`, (shRoles || []).includes(writer));
}

// A stale marketplace version makes an install look like an update.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const rel of ['.omp-plugin/marketplace.json', '.agents/plugins/marketplace.json']) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  const plugins = Array.isArray(manifest.plugins) ? manifest.plugins : [];
  check(`${rel} declares exactly one plugin`, plugins.length === 1, `found ${plugins.length}`);
  check(`${rel} version matches package.json`, plugins[0] && plugins[0].version === pkg.version, `manifest ${plugins[0] && plugins[0].version} vs package ${pkg.version}`);
}

// Word-number counts in shipped docs drift every time personas or skills change.
const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
const personas = fs.readdirSync(profilesDir).filter((f) => f.endsWith('.md')).length;
const skills = fs.readdirSync(path.join(root, 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory()).length;

const DOCS = ['README.md', 'GUIDE.md', '.pi-plugin/README.md', '.omp/README.md', '.opencode-plugin/README.md'];
for (const rel of DOCS) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;
  const body = fs.readFileSync(full, 'utf8');
  for (const m of body.matchAll(/\b([a-z]+)\s+(personas?|skills?)\b/gi)) {
    const word = m[1].toLowerCase();
    const noun = m[2].toLowerCase().replace(/s$/, '');
    if (!(word in NUMBERS)) continue;
    const claimed = NUMBERS[word];
    const actual = noun === 'persona' ? personas : skills;
    check(`${rel} says "${m[0]}" and ${actual} ${noun} dirs exist`, claimed === actual, `claim ${claimed}, actual ${actual}`);
  }
}

if (failed > 0) {
  console.error(`\nRelease hygiene validation FAILED with ${failed} error(s).`);
  process.exit(1);
}

console.log('\nALL release hygiene checks passed.');
