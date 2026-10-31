const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PROFILES_DIR = path.join(ROOT, 'profiles');
const SKILLS_DIR = path.join(ROOT, 'skills');
const AGENTS_DIR = path.join(ROOT, 'agents');
const CODEX_AGENTS_DIR = path.join(ROOT, '.codex-plugin', 'agents');
const PROFILE_COPIES_DIR = path.join(ROOT, '.commandcode-mod', 'profiles');

function detectEol(content) {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function splitFrontmatter(content) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!m) throw new Error('missing YAML frontmatter block');
  return { frontmatter: m[1], body: m[2] };
}

function parseArrayField(value) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const inner = trimmed.replace(/^\[/, '').replace(/\]$/, '');
  return inner.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseProfile(content) {
  const { frontmatter, body } = splitFrontmatter(content);
  const meta = {};
  let skills = [];
  for (const line of frontmatter.split(/\r?\n/)) {
    const m = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const raw = m[2].trim();
    if (key === 'skills') {
      skills = parseArrayField(raw);
    } else {
      meta[key] = raw.replace(/^['"](.*)['"]$/, '$1');
    }
  }
  return { meta, body: body.trim(), skills };
}

function parseSkill(content) {
  const { body } = splitFrontmatter(content);
  return body.trim();
}

function escapeTomlBasic(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeTomlMultiline(value) {
  return value.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
}

function writeFileIfChanged(filePath, buffer) {
  let existing = null;
  try {
    existing = fs.readFileSync(filePath);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (existing && Buffer.compare(existing, buffer) === 0) {
    return false;
  }
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}`);
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, filePath);
  return true;
}

function main() {
  const profileFiles = fs.readdirSync(PROFILES_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const profiles = profileFiles.map((file) => {
    const fullPath = path.join(PROFILES_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const parsed = parseProfile(content);
    return {
      file,
      name: parsed.meta.name || path.basename(file, '.md'),
      meta: parsed.meta,
      body: parsed.body,
      skills: parsed.skills,
      eol: detectEol(content),
      sourceBuffer: Buffer.from(content, 'utf8'),
    };
  });

  // sort personas alphabetically by name
  profiles.sort((a, b) => a.name.localeCompare(b.name));

  // load skills cache
  const skillCache = new Map();
  function getSkillBody(skillName) {
    if (skillCache.has(skillName)) return skillCache.get(skillName);
    const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      throw new Error(`Missing skill file for '${skillName}': ${skillPath}`);
    }
    const content = fs.readFileSync(skillPath, 'utf8');
    const body = parseSkill(content);
    skillCache.set(skillName, body);
    return body;
  }

  let written = 0;
  const counts = { md: 0, toml: 0, copy: 0 };

  for (const profile of profiles) {
    const { name, meta, body: personaBody, skills, eol, file } = profile;
    const role = meta.role;
    const description = meta.description;

    const sortedSkills = [...skills].sort((a, b) => a.localeCompare(b));

    // validate skills exist
    for (const s of sortedSkills) {
      getSkillBody(s);
    }

    const skillBodies = sortedSkills.map((s) => ({
      name: s,
      body: getSkillBody(s),
    }));

    // compose body
    const parts = [];
    if (!/^#\s/.test(personaBody)) {
      parts.push(`# ${role}`);
      parts.push('');
    }
    parts.push(personaBody);
    parts.push('');
    parts.push('## Capabilities');
    for (const sb of skillBodies) {
      parts.push('');
      parts.push(`### ${sb.name}`);
      parts.push('');
      parts.push(sb.body);
    }
    const composedBody = parts.join(eol);

    // agent md
    const mdContent = [
      '---',
      `name: ${name}`,
      `description: ${description}`,
      '---',
      '',
      composedBody,
      '',
    ].join(eol);
    // careful: join with eol then ensure trailing eol
    const mdBuffer = Buffer.from(mdContent, 'utf8');
    const mdPath = path.join(AGENTS_DIR, `${name}.md`);
    counts.md++;
    if (writeFileIfChanged(mdPath, mdBuffer)) {
      console.log(`wrote agents/${name}.md`);
      written++;
    }

    // toml
    const tomlBody = escapeTomlMultiline(composedBody);
    const tomlContent = [
      `name = "${escapeTomlBasic(name)}"`,
      `description = "${escapeTomlBasic(description)}"`,
      `developer_instructions = """`,
      tomlBody,
      `"""`,
      '',
    ].join(eol);
    const tomlBuffer = Buffer.from(tomlContent, 'utf8');
    const tomlPath = path.join(CODEX_AGENTS_DIR, `${name}.toml`);
    counts.toml++;
    if (writeFileIfChanged(tomlPath, tomlBuffer)) {
      console.log(`wrote .codex-plugin/agents/${name}.toml`);
      written++;
    }

    // profile copy
    const copyPath = path.join(PROFILE_COPIES_DIR, `${name}.md`);
    // note: profile filename may differ from name? use original file basename
    const originalCopyPath = path.join(PROFILE_COPIES_DIR, profile.file);
    counts.copy++;
    if (writeFileIfChanged(originalCopyPath, profile.sourceBuffer)) {
      console.log(`wrote .commandcode-mod/profiles/${file}`);
      written++;
    }
  }

  if (written === 0) {
    console.log('Nothing written.');
  }
  console.log(`Summary: ${counts.md} markdown agents, ${counts.toml} toml agents, ${counts.copy} profile copies (${written} files written).`);
}

try {
  main();
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
