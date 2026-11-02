const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mod = require(path.join(root, 'dist', '.commandcode-mod', 'mods', 'righthand.js'));
const { evaluateToolGuard } = mod;

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-readonly-'));
const rootDir = path.join(base, 'repo');
const scratchDir = path.join(base, 'scratch');
fs.mkdirSync(path.join(rootDir, '.git'), { recursive: true });
fs.writeFileSync(path.join(rootDir, 'package.json'), '{}');
fs.mkdirSync(path.join(rootDir, '.righthand', 'tickets', 'T18', 'reports'), { recursive: true });
fs.mkdirSync(path.join(rootDir, '.righthand', 'tickets', 'T18', 'reviews'), { recursive: true });
fs.mkdirSync(scratchDir, { recursive: true });

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`OK: ${name}`);
  else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

try {
  function ctx(toolName, payload) {
    const input = (toolName === 'shell_command' || toolName === 'powershell' || toolName === 'bash' || toolName === 'terminal')
      ? { command: payload }
      : (toolName === 'write_file' || toolName === 'edit_file')
        ? { file_path: payload }
        : payload;
    return {
      toolName,
      input,
      cwd: rootDir,
      scratchDirs: [scratchDir],
    };
  }

  check('readonly write_file to src/x.js blocked', evaluateToolGuard('readonly', ctx('write_file', path.join(rootDir, 'src', 'x.js'))).block === true);
  check('readonly write_file traversal blocked', evaluateToolGuard('readonly', ctx('write_file', rootDir + path.sep + '.righthand' + path.sep + 'tickets' + path.sep + 'T18' + path.sep + '..' + path.sep + '..' + path.sep + 'src' + path.sep + 'x.js')).block === true);
  check('readonly write_file home .commandcode blocked', evaluateToolGuard('readonly', ctx('write_file', path.join(os.homedir(), '.commandcode', 'mods', 'righthand.ts'))).block === true);
  check('readonly write_file nested .righthand blocked', evaluateToolGuard('readonly', ctx('write_file', path.join(rootDir, 'src', '.righthand', 'x.js'))).block === true);
  if (process.platform === 'win32') {
    check('readonly write_file trailing-space traversal blocked', evaluateToolGuard('readonly', ctx('write_file', rootDir + path.sep + '.righthand' + path.sep + '.. ' + path.sep + 'src' + path.sep + 'x.js')).block === true);
  }
  check('readonly shell echo redirect blocked', evaluateToolGuard('readonly', ctx('shell_command', 'echo hi > src/x.js')).block === true);
  check('readonly shell rm blocked', evaluateToolGuard('readonly', ctx('shell_command', 'rm -rf src')).block === true);
  check('readonly shell node src blocked', evaluateToolGuard('readonly', ctx('shell_command', 'node src/x.js')).block === true);
  check('readonly shell node -e blocked', evaluateToolGuard('readonly', ctx('shell_command', 'node -e "require(\'fs\').writeFileSync(\'src/x.js\',\'\')"')).block === true);
  check('readonly shell python -c blocked', evaluateToolGuard('readonly', ctx('shell_command', 'python -c "open(\'src/x.js\',\'w\')"')).block === true);
  check('readonly shell bash -c blocked', evaluateToolGuard('readonly', ctx('shell_command', 'bash -c "rm -rf src"')).block === true);
  check('readonly shell powershell -Command blocked', evaluateToolGuard('readonly', ctx('shell_command', 'powershell -Command "Set-Content src/x.js hi"')).block === true);
  check('readonly shell powershell inline blocked', evaluateToolGuard('readonly', ctx('shell_command', 'powershell "Remove-Item src"')).block === true);
  check('readonly powershell tool blocked', evaluateToolGuard('readonly', { toolName: 'powershell', input: { command: 'rm -rf src' }, cwd: rootDir, scratchDirs: [scratchDir] }).block === true);
  check('readonly shell empty input blocked', evaluateToolGuard('readonly', { toolName: 'shell_command', input: {}, cwd: rootDir, scratchDirs: [scratchDir] }).block === true);
  check('readonly shell non-string command blocked', evaluateToolGuard('readonly', { toolName: 'shell_command', input: { command: 42 }, cwd: rootDir, scratchDirs: [scratchDir] }).block === true);
  check('readonly shell git worktree blocked', evaluateToolGuard('readonly', ctx('shell_command', 'git worktree add ../wt')).block === true);
  check('readonly shell git apply blocked', evaluateToolGuard('readonly', ctx('shell_command', 'git apply p.diff')).block === true);
  check('readonly shell patch blocked', evaluateToolGuard('readonly', ctx('shell_command', 'patch -p1 < p.diff')).block === true);
  check('readonly shell git restore blocked', evaluateToolGuard('readonly', ctx('shell_command', 'git restore src/x.js')).block === true);
  check('readonly shell npm install blocked', evaluateToolGuard('readonly', ctx('shell_command', 'npm install')).block === true);
  check('readonly write_file src/.righthand blocked', evaluateToolGuard('readonly', ctx('write_file', path.join(rootDir, 'src', '.righthand', 'x.js'))).block === true);
  check('readonly throwing getter blocked', (() => {
    const input = {};
    Object.defineProperty(input, 'file_path', { get() { throw new Error('boom'); } });
    try {
      return evaluateToolGuard('readonly', { toolName: 'write_file', input, cwd: rootDir, scratchDirs: [scratchDir] }).block === true;
    } catch (e) {
      return false;
    }
  })());

  check('readonly write_file to .righthand reports allowed', evaluateToolGuard('readonly', ctx('write_file', path.join(rootDir, '.righthand', 'tickets', 'T18', 'reports', 'a.md'))).block === false);
  check('readonly edit_file to .righthand reviews allowed', evaluateToolGuard('readonly', ctx('edit_file', path.join(rootDir, '.righthand', 'tickets', 'T18', 'reviews', 'r.md'))).block === false);
  check('readonly write_file scratch allowed', evaluateToolGuard('readonly', ctx('write_file', path.join(scratchDir, 'probe.js'))).block === false);
  if (process.platform === 'win32') {
    check('readonly write_file scratch case-insensitive allowed', evaluateToolGuard('readonly', { toolName: 'write_file', input: { file_path: scratchDir.toLowerCase() + path.sep + 'a.md' }, cwd: rootDir, scratchDirs: [scratchDir] }).block === false);
  }
  check('readonly shell npm test allowed', evaluateToolGuard('readonly', ctx('shell_command', 'npm test')).block === false);
  check('readonly shell node scratch allowed', evaluateToolGuard('readonly', ctx('shell_command', `node ${path.join(scratchDir, 'probe.js')}`)).block === false);
  check('readonly shell node flags then path allowed', evaluateToolGuard('readonly', ctx('shell_command', `node --enable-source-maps ${path.join(scratchDir, 'probe.js')}`)).block === false);
  check('readonly shell git log format allowed', evaluateToolGuard('readonly', ctx('shell_command', 'git log --format=%s')).block === false);
  check('readonly shell 2>&1 allowed', evaluateToolGuard('readonly', ctx('shell_command', 'npm test 2>&1')).block === false);
  check('readonly shell >&2 allowed', evaluateToolGuard('readonly', ctx('shell_command', 'echo hi >&2')).block === false);
  check('readonly shell pm test redirect blocked', evaluateToolGuard('readonly', ctx('shell_command', 'npm test > out.log')).block === true);
  check('readonly read_file allowed', evaluateToolGuard('readonly', { toolName: 'read_file', input: { file_path: path.join(rootDir, 'src', 'x.js') }, cwd: rootDir, scratchDirs: [scratchDir] }).block === false);
  check('readonly grep allowed', evaluateToolGuard('readonly', { toolName: 'grep', input: { pattern: 'x' }, cwd: rootDir, scratchDirs: [scratchDir] }).block === false);
  check('readonly glob allowed', evaluateToolGuard('readonly', { toolName: 'glob', input: { pattern: '**/*.ts' }, cwd: rootDir, scratchDirs: [scratchDir] }).block === false);
  check('writer write_file allowed', evaluateToolGuard('writer', ctx('write_file', path.join(rootDir, 'src', 'x.js'))).block === false);
  check('null write_file allowed', evaluateToolGuard(null, ctx('write_file', path.join(rootDir, 'src', 'x.js'))).block === false);
  check('relative path resolution blocked', evaluateToolGuard('readonly', { toolName: 'write_file', input: { file_path: 'src/x.js' }, cwd: rootDir, scratchDirs: [scratchDir] }).block === true);

  if (failed > 0) {
    console.error(`\nValidation FAILED with ${failed} errors.`);
    process.exit(1);
  }
  console.log('\nALL readonly checks passed!');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}