const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const harness = require(path.join(root, 'bin', 'harness.js'));

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function pass(msg) { console.log(`OK ${msg}`); }

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-sync-'));
const dest = path.join(tmpBase, 'skills');

// unrelated directory must survive
const unrelated = path.join(dest, 'unrelated-dir');
fs.mkdirSync(unrelated, { recursive: true });
fs.writeFileSync(path.join(unrelated, 'keep.txt'), 'keep me');

// dry run writes nothing
const beforeDry = fs.existsSync(dest) ? fs.readdirSync(dest).length : 0;
const dryRes = harness.syncSkills('cmdc', { dest, dryRun: true });
if (!dryRes || typeof dryRes.written !== 'number') fail('syncSkills dryRun did not return counts');
// ensure no skill dirs created
const skillNames = harness.listSkillNames();
let dryCreated = false;
for (const n of skillNames) {
  if (fs.existsSync(path.join(dest, n))) dryCreated = true;
}
if (dryCreated) fail('dryRun created skill directories');
pass('dryRun writes nothing');

// first run
const r1 = harness.syncSkills('cmdc', { dest });
if (r1.written <= 0) fail('first run wrote nothing');
pass(`first run written=${r1.written} unchanged=${r1.unchanged}`);

// unrelated survives after first run
if (!fs.existsSync(path.join(unrelated, 'keep.txt'))) fail('unrelated directory was removed/changed');
pass('unrelated directory survives');

// second run writes nothing
const r2 = harness.syncSkills('cmdc', { dest });
if (r2.written !== 0) fail(`second run wrote ${r2.written} files`);
pass('second run writes nothing');

// unrelated still survives
if (fs.readFileSync(path.join(unrelated, 'keep.txt'), 'utf8') !== 'keep me') fail('unrelated content changed');
pass('unrelated content intact');

// cleanup
fs.rmSync(tmpBase, { recursive: true, force: true });

if (failed > 0) {
  console.error(`\nSkill sync validation FAILED with ${failed} errors.`);
  process.exit(1);
}
console.log('\nALL skill sync checks PASSED!');