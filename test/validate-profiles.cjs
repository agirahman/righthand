const fs = require('node:fs');
const path = require('node:path');

const profilesDir = path.join(__dirname, '..', 'profiles');
const files = fs.readdirSync(profilesDir).filter((f) => f.endsWith('.md'));

console.log(`Checking ${files.length} profile files in ${profilesDir}...`);

let failed = 0;
const expectedKeys = ['name', 'role', 'description', 'mode', 'skills', 'output'];
const roles = [];

for (const file of files) {
  const filePath = path.join(profilesDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!fmMatch) {
    console.error(`FAIL: [${file}] Missing YAML frontmatter block.`);
    failed++;
    continue;
  }

  const fmLines = fmMatch[1].split(/\r?\n/);
  const metadata = {};
  for (const line of fmLines) {
    const m = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (m) {
      metadata[m[1].toLowerCase()] = m[2].trim().replace(/^['"](.*)['"]$/, '$1');
    }
  }

  // Collect key order
  const keyOrder = [];
  for (const line of fmLines) {
    const m = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (m) keyOrder.push(m[1].toLowerCase());
  }
  if (keyOrder.join(',') !== expectedKeys.join(',')) {
    console.error(`FAIL: [${file}] Frontmatter key order mismatch. Expected ${expectedKeys.join(', ')}, got ${keyOrder.join(', ')}`);
    failed++;
  }

  for (const key of expectedKeys) {
    if (!(key in metadata)) {
      console.error(`FAIL: [${file}] Missing frontmatter key: ${key}`);
      failed++;
    }
  }

  // Check mode
  if (metadata.mode !== 'writer' && metadata.mode !== 'readonly') {
    console.error(`FAIL: [${file}] Invalid mode '${metadata.mode}', must be 'writer' or 'readonly'`);
    failed++;
  }

  // Check output values
  const outputRaw = (metadata.output || '').trim();
  const outputStripped = outputRaw.replace(/^\[/, '').replace(/\]$/, '').trim();
  const outputVals = outputStripped === '' ? [] : outputStripped.split(',').map((s) => s.trim()).filter(Boolean);
  for (const v of outputVals) {
    if (v !== 'report' && v !== 'review') {
      console.error(`FAIL: [${file}] Invalid output value '${v}', must be 'report' or 'review'`);
      failed++;
    }
  }

  // Check no fenced code block in orchestrator body
  if (metadata.name === 'orchestrator') {
    const bodyLines = (fmMatch[2] || '').split(/\r?\n/);
    for (const bl of bodyLines) {
      if (/^```/.test(bl)) {
        console.error(`FAIL: [${file}] Fenced code block not allowed in persona body`);
        failed++;
        break;
      }
    }
  }

  roles.push({
    name: metadata.name,
    role: metadata.role,
    mode: metadata.mode,
    skills: metadata.skills,
    output: metadata.output,
  });
  console.log(`OK: [${file}] -> ${metadata.name} (${metadata.role}) [${metadata.mode}]`);
}

if (failed > 0) {
  console.error(`\nValidation FAILED with ${failed} errors.`);
  process.exit(1);
}

console.log(`\nALL ${files.length} PROFILES VALID!`);
console.table(roles);
