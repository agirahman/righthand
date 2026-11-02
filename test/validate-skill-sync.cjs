const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const harness = require(path.join(root, 'bin', 'harness.js'));

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function pass(msg) { console.log(`OK ${msg}`); }

const skillNames = harness.listSkillNames();
const totalSourceFiles = skillNames.reduce((n, name) => {
  const srcRoot = path.join(harness.skillsDir, name);
  return n + harness.walkFiles ? 0 : 0;
}, 0);
// walkFiles not exported; compute locally
function walkFiles(dir, base) {
  base = base || dir;
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full));
  }
  return out;
}
const totalSrc = skillNames.reduce((n, name) => n + walkFiles(path.join(harness.skillsDir, name)).length, 0);

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-sync-'));
const dest = path.join(tmpBase, 'skills');

// unrelated directory must survive
const unrelated = path.join(dest, 'unrelated-dir');
fs.mkdirSync(unrelated, { recursive: true });
fs.writeFileSync(path.join(unrelated, 'keep.txt'), 'keep me');

// dry run writes nothing
const dryRes = harness.syncSkills('cmdc', { dest, dryRun: true });
if (!dryRes || typeof dryRes.written !== 'number') fail('syncSkills dryRun did not return counts');
let dryCreated = false;
for (const n of skillNames) {
  if (fs.existsSync(path.join(dest, n))) dryCreated = true;
}
if (dryCreated) fail('dryRun created skill directories');
if (dryRes.files.length !== 0 && dryRes.written !== totalSrc) {
  // dry run should report would-write count equals total source files
  if (dryRes.written !== totalSrc) fail(`dryRun written ${dryRes.written} != ${totalSrc}`);
}
pass('dryRun writes nothing');

// first run
const r1 = harness.syncSkills('cmdc', { dest });
if (r1.written !== totalSrc) fail(`first run wrote ${r1.written}, expected ${totalSrc}`);
pass(`first run written=${r1.written} unchanged=${r1.unchanged}`);

// every destination file byte-identical to source
for (const name of skillNames) {
  const srcRoot = path.join(harness.skillsDir, name);
  const dstRoot = path.join(dest, name);
  for (const rel of walkFiles(srcRoot)) {
    const a = fs.readFileSync(path.join(srcRoot, rel));
    const b = fs.readFileSync(path.join(dstRoot, rel));
    if (Buffer.compare(a, b) !== 0) fail(`byte mismatch: ${name}/${rel}`);
  }
}
pass('all destination files byte-identical');

// files entries prefixed with skill name
for (const f of r1.files) {
  if (!skillNames.some((n) => f.startsWith(n + '/'))) fail(`unprefixed file entry: ${f}`);
}
pass('files entries prefixed with skill name');

// unrelated survives after first run
if (!fs.existsSync(path.join(unrelated, 'keep.txt'))) fail('unrelated directory was removed/changed');
pass('unrelated directory survives');

// checkSkills reports installed === total
const st = harness.checkSkills({ dest });
if (st.installed !== st.total) fail(`checkSkills installed ${st.installed}/${st.total}`);
pass('checkSkills reports all installed');

// corrupt one file and checkSkills reports the broken skill by name
const corruptSkill = skillNames[0];
const corruptFile = path.join(dest, corruptSkill, walkFiles(path.join(harness.skillsDir, corruptSkill))[0]);
fs.writeFileSync(corruptFile, 'CORRUPTED');
const st2 = harness.checkSkills({ dest });
if (!st2.missingOrStale.includes(corruptSkill)) fail(`corrupted skill not reported: ${corruptSkill}`);
pass('checkSkills reports corrupted skill by name');

// second run writes nothing (after restoring? leave corrupted; but sync will fix)
const r2 = harness.syncSkills('cmdc', { dest });
// after corruption, one file should be written
if (r2.written < 1) fail('sync did not repair corrupted file');
// run again to confirm zero
const r3 = harness.syncSkills('cmdc', { dest });
if (r3.written !== 0) fail(`third run wrote ${r3.written} files`);
pass('repair then zero writes');

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