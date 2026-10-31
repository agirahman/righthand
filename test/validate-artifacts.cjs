const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { buildPlan } = require(path.join(root, 'scripts', 'build-agents.js'));

console.log('Checking generated artifacts against build plan...');

let failed = 0;
const plan = buildPlan(root);

// Collect planned paths
const planned = new Set(Object.keys(plan));

// Collect disk paths for generated directories
const disk = new Set();
function addDiskFiles(dir, pattern) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return;
  for (const f of fs.readdirSync(full)) {
    if (f.startsWith('.')) continue;
    const fp = path.join(full, f);
    if (!fs.statSync(fp).isFile()) continue;
    if (pattern && !pattern.test(f)) continue;
    disk.add(path.join(dir, f).replace(/\\/g, '/'));
  }
}
addDiskFiles('agents', /\.md$/);
addDiskFiles('.codex-plugin/agents', /\.toml$/);
addDiskFiles('.commandcode-mod/profiles', /\.md$/);

// Differing paths
for (const p of planned) {
  if (!disk.has(p)) {
    console.error(`FAIL: [artifact] planned but missing on disk: ${p}`);
    failed++;
  }
}
for (const p of disk) {
  if (!planned.has(p)) {
    console.error(`FAIL: [artifact] on disk but not in plan: ${p}`);
    failed++;
  }
}

// Content comparison
for (const p of planned) {
  if (!disk.has(p)) continue;
  const fullPath = path.join(root, p);
  const onDisk = fs.readFileSync(fullPath, 'utf8');
  const expected = plan[p];
  if (onDisk !== expected) {
    console.error(`FAIL: [artifact] content differs: ${p}`);
    failed++;
  }
}

// agents/*.md: exactly one line matching ^# before ## Capabilities heading
const agentsDir = path.join(root, 'agents');
if (fs.existsSync(agentsDir)) {
  for (const f of fs.readdirSync(agentsDir).filter((x) => x.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(agentsDir, f), 'utf8');
    const lines = content.split(/\r?\n/);
    const capIdx = lines.findIndex((l) => /^## Capabilities/.test(l.trim()));
    const region = capIdx >= 0 ? lines.slice(0, capIdx) : lines;
    const hashCount = region.filter((l) => /^# /.test(l)).length;
    if (hashCount !== 1) {
      console.error(`FAIL: [agent] ${f} has ${hashCount} lines matching '^# ' before '## Capabilities' (expected 1)`);
      failed++;
    }
  }
}

// .codex-plugin/agents/*.toml format
const codexDir = path.join(root, '.codex-plugin', 'agents');
if (fs.existsSync(codexDir)) {
  for (const f of fs.readdirSync(codexDir).filter((x) => x.endsWith('.toml'))) {
    const content = fs.readFileSync(path.join(codexDir, f), 'utf8');
    if (!content.startsWith('name = ')) {
      console.error(`FAIL: [toml] ${f} does not start with 'name = '`);
      failed++;
    }
    if (!content.includes('description = ')) {
      console.error(`FAIL: [toml] ${f} missing 'description = '`);
      failed++;
    }
    if (!content.includes('developer_instructions = """')) {
      console.error(`FAIL: [toml] ${f} missing 'developer_instructions = """'`);
      failed++;
    }
    const trimmed = content.replace(/\r?\n$/, '');
    if (!trimmed.endsWith('"""')) {
      console.error(`FAIL: [toml] ${f} does not end the literal block properly (expected trailing \"\"\")`);
      failed++;
    }
  }
}

// .commandcode-mod/profiles/*.md byte-identical to profiles/*.md
const copiesDir = path.join(root, '.commandcode-mod', 'profiles');
const profilesDir = path.join(root, 'profiles');
if (fs.existsSync(copiesDir)) {
  for (const f of fs.readdirSync(copiesDir).filter((x) => x.endsWith('.md'))) {
    const copyPath = path.join(copiesDir, f);
    const srcPath = path.join(profilesDir, f);
    if (!fs.existsSync(srcPath)) {
      console.error(`FAIL: [profile-copy] source missing for ${f}`);
      failed++;
      continue;
    }
    const a = fs.readFileSync(copyPath);
    const b = fs.readFileSync(srcPath);
    if (Buffer.compare(a, b) !== 0) {
      console.error(`FAIL: [profile-copy] ${f} is not byte-identical to profiles/${f}`);
      failed++;
    }
  }
}

if (failed > 0) {
  console.error(`\nArtifact validation FAILED with ${failed} errors.`);
  process.exit(1);
}

console.log(`\nALL generated artifacts VALID! (${planned.size} planned files checked)`);