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

function buildPlan(rootDir) {
  const root = rootDir ? path.resolve(rootDir) : ROOT;
  const profilesDir = path.join(root, 'profiles');
  const skillsDir = path.join(root, 'skills');
  const agentsDir = path.join(root, 'agents');
  const codexAgentsDir = path.join(root, '.codex-plugin', 'agents');
  const profileCopiesDir = path.join(root, '.commandcode-mod', 'profiles');

  const profileFiles = fs.readdirSync(profilesDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const profiles = profileFiles.map((file) => {
    const fullPath = path.join(profilesDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const parsed = parseProfile(content);
    return {
      file,
      name: parsed.meta.name || path.basename(file, '.md'),
      meta: parsed.meta,
      body: parsed.body,
      skills: parsed.skills,
      eol: detectEol(content),
      sourceContent: content,
    };
  });

  profiles.sort((a, b) => a.name.localeCompare(b.name));

  const skillCache = new Map();
  function getSkillBody(skillName) {
    if (skillCache.has(skillName)) return skillCache.get(skillName);
    const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      throw new Error(`Missing skill file for '${skillName}': ${skillPath}`);
    }
    const content = fs.readFileSync(skillPath, 'utf8');
    const body = parseSkill(content);
    skillCache.set(skillName, body);
    return body;
  }

  const plan = {};

  for (const profile of profiles) {
    const { name, meta, body: personaBody, skills, eol, file, sourceContent } = profile;
    const role = meta.role;
    const description = meta.description;

    const sortedSkills = [...skills].sort((a, b) => a.localeCompare(b));

    for (const s of sortedSkills) {
      getSkillBody(s);
    }

    const skillBodies = sortedSkills.map((s) => ({
      name: s,
      body: getSkillBody(s),
    }));

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

    const mdContent = [
      '---',
      `name: ${name}`,
      `description: ${description}`,
      '---',
      '',
      composedBody,
      '',
    ].join(eol);

    plan[`agents/${name}.md`] = mdContent;

    const tomlBody = escapeTomlMultiline(composedBody);
    const tomlContent = [
      `name = "${escapeTomlBasic(name)}"`,
      `description = "${escapeTomlBasic(description)}"`,
      `developer_instructions = """`,
      tomlBody,
      `"""`,
      '',
    ].join(eol);

    plan[`.codex-plugin/agents/${name}.toml`] = tomlContent;

    plan[`.commandcode-mod/profiles/${file}`] = sourceContent;
  }

  // make plan iterable and indexable for compatibility
  const iterable = plan;
  Object.defineProperty(iterable, Symbol.iterator, {
    value: function* () { for (const k of Object.keys(this)) yield [k, this[k]]; },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(iterable, 'get', { value: function (k) { return this[k]; }, writable: true, configurable: true });
  Object.defineProperty(iterable, 'has', { value: function (k) { return Object.prototype.hasOwnProperty.call(this, k); }, writable: true, configurable: true });
  Object.defineProperty(iterable, 'size', { get: function () { return Object.keys(this).length; }, configurable: true });

  return iterable;
}

function main() {
  const root = ROOT;
  const plan = buildPlan(root);

  let written = 0;
  const counts = { md: 0, toml: 0, copy: 0 };
  for (const [relPath, content] of Object.entries(plan)) {
    if (relPath.startsWith('agents/')) counts.md++;
    else if (relPath.startsWith('.codex-plugin/agents/')) counts.toml++;
    else if (relPath.startsWith('.commandcode-mod/profiles/')) counts.copy++;

    const fullPath = path.join(root, relPath);
    const buffer = Buffer.from(content, 'utf8');
    if (writeFileIfChanged(fullPath, buffer)) {
      console.log(`wrote ${relPath}`);
      written++;
    }
  }

  if (written === 0) {
    console.log('Nothing written.');
  }
  console.log(`Summary: ${counts.md} markdown agents, ${counts.toml} toml agents, ${counts.copy} profile copies (${written} files written).`);
}

try {
  if (require.main === module) {
    main();
  }
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}

module.exports = { buildPlan };
