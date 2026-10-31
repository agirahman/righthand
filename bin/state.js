const fs = require('fs');
const path = require('path');

function getStateDir(cwd = process.cwd()) {
  return path.join(cwd, '.righthand', 'state');
}

function getStateFile(cwd = process.cwd()) {
  return path.join(getStateDir(cwd), 'active-persona.json');
}

function getLegacyStateFile(cwd = process.cwd()) {
  return path.join(cwd, '.righthand', 'active-persona.json');
}

function readState(cwd = process.cwd()) {
  try {
    const p = getStateFile(cwd);
    if (!fs.existsSync(p)) {
      // Fallback to legacy path for projects created by older versions.
      const legacy = getLegacyStateFile(cwd);
      if (fs.existsSync(legacy)) {
        const raw = fs.readFileSync(legacy, 'utf8');
        return JSON.parse(raw);
      }
      return { active: null };
    }
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { active: null };
  }
}

function writeState(state, cwd = process.cwd()) {
  const dir = getStateDir(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const target = getStateFile(cwd);
  const tmp = path.join(dir, `.active-persona.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, target);
}

module.exports = { getStateDir, getStateFile, readState, writeState, getLegacyStateFile };