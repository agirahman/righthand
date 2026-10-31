const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const profilesDir = path.join(root, 'profiles');
const skillsRoot = path.join(root, 'skills');
const manifestDirs = [
  path.join(root, 'plugin.json'),
  path.join(root, '.claude-plugin', 'plugin.json'),
  path.join(root, '.claude-plugin', 'marketplace.json'),
  path.join(root, '.codex-plugin', 'plugin.json'),
  path.join(root, '.cursor-plugin', 'plugin.json'),
  path.join(root, '.cursor-plugin', 'marketplace.json'),
  path.join(root, '.kimi-plugin', 'plugin.json'),
  path.join(root, '.omp-plugin', 'marketplace.json'),
  path.join(root, '.agents', 'plugins', 'marketplace.json'),
];

console.log(`Checking cross-harness manifests and persona skills...`);

let failed = 0;
const profileFiles = fs.readdirSync(profilesDir).filter((f) => f.endsWith('.md'));

// Validate every manifest JSON exists and parses.
for (const manifestPath of manifestDirs) {
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.name) {
      console.error(`FAIL: [manifest] Missing "name" in ${path.basename(manifestPath)}`);
      failed++;
    }
    console.log(`OK Manifest: ${path.relative(root, manifestPath)}`);
  } catch (e) {
    console.error(`FAIL: [manifest] ${path.relative(root, manifestPath)}: ${e.message}`);
    failed++;
  }
}

// Validate skills parity + frontmatter.
for (const profileFile of profileFiles) {
  const profileName = profileFile.slice(0, -3);
  const skillPath = path.join(skillsRoot, `righthand-${profileName}`, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    console.error(`FAIL: [skill] Missing skill for profile ${profileFile}: ${path.relative(root, skillPath)}`);
    failed++;
    continue;
  }
  const raw = fs.readFileSync(skillPath, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) {
    console.error(`FAIL: [skill] Missing YAML frontmatter: ${path.relative(root, skillPath)}`);
    failed++;
    continue;
  }
  const fmLines = m[1].split(/\r?\n/);
  const metadata = {};
  for (const line of fmLines) {
    const kv = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (kv) metadata[kv[1].toLowerCase()] = kv[2].trim().replace(/^['"](.*)['"]$/, '$1');
  }
  if (!metadata.name) {
    console.error(`FAIL: [skill] Missing "name" in ${path.relative(root, skillPath)}`);
    failed++;
  }
  if (!metadata.description) {
    console.error(`FAIL: [skill] Missing "description" in ${path.relative(root, skillPath)}`);
    failed++;
  }
  if (!metadata.mode) {
    console.error(`FAIL: [skill] Missing "mode" in ${path.relative(root, skillPath)}`);
    failed++;
  }

  // Minimal drift sanity: ensure skill body retains "## Composition" heading marker.
  const body = m[2] || '';
  if (!body.includes('## Composition')) {
    console.error(`FAIL: [skill] Missing "## Composition" in ${path.relative(root, skillPath)}`);
    failed++;
  }

  console.log(`OK Skill: righthand-${profileName}`);
}

if (failed > 0) {
  console.error(`\nCross-harness validation FAILED with ${failed} errors.`);
  process.exit(1);
}

console.log(`\nALL ${profileFiles.length} CROSS-HARNESS PERSONA SKILLS VALID!`);
console.log(`ALL ${manifestDirs.length} CROSS-HARNESS MANIFESTS VALID!`);