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

console.log(`Checking cross-harness manifests and capability skills...`);

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

// Parse profile frontmatter and collect skills references.
const referencedSkills = new Set();
const profileSkills = new Map();
for (const profileFile of profileFiles) {
  const raw = fs.readFileSync(path.join(profilesDir, profileFile), 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) {
    console.error(`FAIL: [profile] Missing frontmatter: ${profileFile}`);
    failed++;
    continue;
  }
  const fmLines = m[1].split(/\r?\n/);
  const metadata = {};
  for (const line of fmLines) {
    const kv = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (kv) metadata[kv[1].toLowerCase()] = kv[2].trim().replace(/^['"](.*)['"]$/, '$1');
  }
  const skillsRaw = metadata.skills || '';
  const stripped = skillsRaw.replace(/^\[/, '').replace(/\]$/, '').trim();
  const entries = stripped === '' ? [] : stripped.split(',').map((s) => s.trim()).filter(Boolean);
  profileSkills.set(profileFile, entries);
  for (const entry of entries) referencedSkills.add(entry);
}

// Every skills entry in every profile must resolve to skills/<name>/SKILL.md, except dispatch.
const requiredSections = ['## When to use', '## Procedure', '## Checklist', '## Evidence'];
for (const profileFile of profileFiles) {
  const entries = profileSkills.get(profileFile) || [];
  for (const entry of entries) {
    const skillPath = path.join(skillsRoot, entry, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      console.error(`FAIL: [skill] ${profileFile} references missing skill '${entry}': ${path.relative(root, skillPath)}`);
      failed++;
      continue;
    }
    const raw = fs.readFileSync(skillPath, 'utf8');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
    if (!fm) {
      console.error(`FAIL: [skill] Missing YAML frontmatter: ${path.relative(root, skillPath)}`);
      failed++;
      continue;
    }
    const fmLines = fm[1].split(/\r?\n/);
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
    if (metadata.name && metadata.name !== entry) {
      console.error(`FAIL: [skill] name '${metadata.name}' does not match directory '${entry}' in ${path.relative(root, skillPath)}`);
      failed++;
    }
    const body = fm[2] || '';
    const bodyLines = body.split(/\r?\n/);
    for (const section of requiredSections) {
      if (!bodyLines.some((l) => l.trim() === section)) {
        console.error(`FAIL: [skill] Missing "${section}" in ${path.relative(root, skillPath)}`);
        failed++;
      }
    }
    console.log(`OK Skill: ${entry}`);
  }
}

// Every directory under skills/ must be referenced by at least one profile or be dispatch.
if (fs.existsSync(skillsRoot)) {
  for (const dir of fs.readdirSync(skillsRoot)) {
    const dirPath = path.join(skillsRoot, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    if (dir.startsWith('righthand-')) {
      console.error(`FAIL: [skill] Legacy persona envelope directory present: ${dir}`);
      failed++;
      continue;
    }
    if (!referencedSkills.has(dir)) {
      console.error(`FAIL: [skill] Directory '${dir}' under skills/ is not referenced by any profile`);
      failed++;
    }
  }
}

if (failed > 0) {
  console.error(`\nCross-harness validation FAILED with ${failed} errors.`);
  process.exit(1);
}

console.log(`\nALL capability skills and manifests VALID!`);