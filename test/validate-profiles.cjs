const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const profilesDir = path.join(root, 'profiles');
const skillsRoot = path.join(root, 'skills');
const files = fs.readdirSync(profilesDir).filter((f) => f.endsWith('.md'));

console.log(`Checking ${files.length} profile files in ${profilesDir}...`);

let failed = 0;
const expectedKeys = ['name', 'role', 'description', 'mode', 'skills', 'output'];
const roles = [];
const referencedSkills = new Set();

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
  // output must be subset of report/review (already enforced above) and writer must not declare review
  if (metadata.mode === 'writer' && outputVals.includes('review')) {
    console.error(`FAIL: [${file}] A persona with mode: writer must not declare 'review' in output`);
    failed++;
  }

  // Parse skills entries
  const skillsRaw = (metadata.skills || '').trim();
  const skillsStripped = skillsRaw.replace(/^\[/, '').replace(/\]$/, '').trim();
  const skillEntries = skillsStripped === '' ? [] : skillsStripped.split(',').map((s) => s.trim()).filter(Boolean);
  for (const entry of skillEntries) referencedSkills.add(entry);

  // Skills resolution: every entry must resolve to skills/<name>/SKILL.md
  for (const entry of skillEntries) {
    const skillPath = path.join(skillsRoot, entry, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      console.error(`FAIL: [${file}] references missing skill '${entry}': ${path.relative(root, skillPath)}`);
      failed++;
    }
  }

  // Code fence: reject fenced blocks whose info string is a shell language.
  // Blocks with no info string, or with markdown/json/text/etc., are allowed.
  const shellLangs = new Set(['bash', 'sh', 'shell', 'zsh', 'pwsh', 'powershell', 'console', 'cmd']);
  const bodyLines = (fmMatch[2] || '').split(/\r?\n/);
  for (const bl of bodyLines) {
    const m = bl.trim().match(/^```\s*(\S*)/);
    if (m) {
      const info = m[1].toLowerCase();
      if (shellLangs.has(info)) {
        console.error(`FAIL: [${file}] Shell fenced code block not allowed in persona body (info: ${info})`);
        failed++;
        break;
      }
    }
  }

  // Budget: persona body lines + bodies of referenced skills <= 400
  const personaBodyLines = (fmMatch[2] || '').trim().split(/\r?\n/).length;
  let skillBodyLines = 0;
  for (const entry of skillEntries) {
    const skillPath = path.join(skillsRoot, entry, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const skillContent = fs.readFileSync(skillPath, 'utf8');
    const skillFm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(skillContent);
    const skillBody = skillFm ? (skillFm[2] || '').trim() : skillContent.trim();
    skillBodyLines += skillBody === '' ? 0 : skillBody.split(/\r?\n/).length;
  }
  const totalLines = personaBodyLines + skillBodyLines;
  console.log(`Budget: [${file}] ${totalLines} lines (persona ${personaBodyLines} + skills ${skillBodyLines}, limit 400)`);
  if (totalLines > 400) {
    console.error(`FAIL: [${file}] Budget exceeded: ${totalLines} lines > 400`);
    failed++;
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

// Every directory under skills/ must be referenced by at least one profile or allowlisted.
const allowedSkillDirs = [];
if (fs.existsSync(skillsRoot)) {
  for (const dir of fs.readdirSync(skillsRoot)) {
    const dirPath = path.join(skillsRoot, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    if (allowedSkillDirs.includes(dir)) continue;
    if (!referencedSkills.has(dir)) {
      console.error(`FAIL: [skill] Directory '${dir}' under skills/ is not referenced by any profile`);
      failed++;
    }
  }
}

if (failed > 0) {
  console.error(`\nValidation FAILED with ${failed} errors.`);
  process.exit(1);
}

console.log(`\nALL ${files.length} PROFILES VALID!`);
console.table(roles);