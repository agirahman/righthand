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

  // Issue #38: the guard must decide from parsed commands and target paths, not from blocked words.
  check('readonly shell node -p allowed', evaluateToolGuard('readonly', ctx('shell_command', 'node -p "1+1"')).block === false);
  check('readonly shell node --print allowed', evaluateToolGuard('readonly', ctx('shell_command', 'node --print "Date.now()"')).block === false);
  check('readonly shell semicolon git reads allowed', evaluateToolGuard('readonly', ctx('shell_command', 'git status --porcelain; git log --oneline -2; git branch')).block === false);
  check('readonly shell git tag list allowed', evaluateToolGuard('readonly', ctx('shell_command', 'git status; git log; git tag --list "v1.3*"')).block === false);
  check('readonly shell git tag -l allowed', evaluateToolGuard('readonly', ctx('shell_command', 'git tag -l')).block === false);
  check('readonly shell git worktree list allowed', evaluateToolGuard('readonly', ctx('shell_command', 'git worktree list')).block === false);
  check('readonly shell git worktree list porcelain allowed', evaluateToolGuard('readonly', ctx('shell_command', 'git worktree list --porcelain')).block === false);
  check('readonly shell git branch list allowed', evaluateToolGuard('readonly', ctx('shell_command', 'git branch --list "fix/*"')).block === false);
  check('readonly shell git remote -v allowed', evaluateToolGuard('readonly', ctx('shell_command', 'git remote -v')).block === false);
  check('readonly shell git stash list allowed', evaluateToolGuard('readonly', ctx('shell_command', 'git stash list')).block === false);
  check('readonly shell git config read allowed', evaluateToolGuard('readonly', ctx('shell_command', 'git config user.name')).block === false);
  check('readonly shell git log path segment named rm allowed', evaluateToolGuard('readonly', ctx('shell_command', 'git log -- src/rm/mv/cp.ts')).block === false);
  check('readonly shell grep word rm allowed', evaluateToolGuard('readonly', ctx('shell_command', 'grep -rn "rm" docs')).block === false);
  check('readonly shell npm ls allowed', evaluateToolGuard('readonly', ctx('shell_command', 'npm ls --depth=0')).block === false);
  check('readonly shell gh pr view allowed', evaluateToolGuard('readonly', ctx('shell_command', 'gh pr view 38 --json title')).block === false);
  check('readonly shell Remove-Item scratch allowed', evaluateToolGuard('readonly', ctx('shell_command', `Remove-Item "${path.join(scratchDir, 'tmp.txt')}"`)).block === false);
  check('readonly shell Remove-Item recurse force scratch allowed', evaluateToolGuard('readonly', ctx('shell_command', `Remove-Item -Recurse -Force "${path.join(scratchDir, 'tmp')}"`)).block === false);
  check('readonly shell Out-File scratch allowed', evaluateToolGuard('readonly', ctx('shell_command', `Out-File "${path.join(scratchDir, 'out.txt')}"`)).block === false);
  check('readonly shell Set-Content scratch allowed', evaluateToolGuard('readonly', ctx('shell_command', `Set-Content -Path "${path.join(scratchDir, 'out.txt')}" -Value hi`)).block === false);
  check('readonly shell redirect scratch allowed', evaluateToolGuard('readonly', ctx('shell_command', `echo hi > "${path.join(scratchDir, 'out.txt')}"`)).block === false);
  check('readonly shell rm scratch allowed', evaluateToolGuard('readonly', ctx('shell_command', `rm -rf "${path.join(scratchDir, 'tmp')}"`)).block === false);
  check('readonly shell sed -i scratch allowed', evaluateToolGuard('readonly', ctx('shell_command', `sed -i "s/a/b/" "${path.join(scratchDir, 'x.txt')}"`)).block === false);
  check('readonly shell pwsh -File scratch allowed', evaluateToolGuard('readonly', ctx('shell_command', `pwsh -File "${path.join(scratchDir, 'x.ps1')}"`)).block === false);

  check('readonly shell git tag create blocked', evaluateToolGuard('readonly', ctx('shell_command', 'git tag v9.9.9')).block === true);
  check('readonly shell git tag annotate blocked', evaluateToolGuard('readonly', ctx('shell_command', 'git tag -a v9.9.9 -m x')).block === true);
  check('readonly shell git branch delete blocked', evaluateToolGuard('readonly', ctx('shell_command', 'git branch -d feature')).block === true);
  check('readonly shell git branch create blocked', evaluateToolGuard('readonly', ctx('shell_command', 'git branch feature')).block === true);
  check('readonly shell git stash blocked', evaluateToolGuard('readonly', ctx('shell_command', 'git stash')).block === true);
  check('readonly shell git config write blocked', evaluateToolGuard('readonly', ctx('shell_command', 'git config user.name Agi')).block === true);
  check('readonly shell git pull blocked', evaluateToolGuard('readonly', ctx('shell_command', 'git pull')).block === true);
  check('readonly shell git commit blocked', evaluateToolGuard('readonly', ctx('shell_command', 'git commit -m x')).block === true);
  check('readonly shell Remove-Item src blocked', evaluateToolGuard('readonly', ctx('shell_command', 'Remove-Item -Recurse src')).block === true);
  check('readonly shell Out-File src blocked', evaluateToolGuard('readonly', ctx('shell_command', 'Out-File src/x.txt')).block === true);
  check('readonly shell cp from scratch to src blocked', evaluateToolGuard('readonly', ctx('shell_command', `cp "${path.join(scratchDir, 'a')}" src/a`)).block === true);
  check('readonly shell sed -i outside blocked', evaluateToolGuard('readonly', ctx('shell_command', 'sed -i "s/a/b/" src/x.js')).block === true);
  check('readonly shell python -m blocked', evaluateToolGuard('readonly', ctx('shell_command', 'python -m http.server')).block === true);
  check('readonly shell npm ci blocked', evaluateToolGuard('readonly', ctx('shell_command', 'npm ci')).block === true);
  check('readonly shell gh pr merge blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh pr merge 38')).block === true);
  check('readonly shell gh api post blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh api -X POST repos/x/issues')).block === true);
  check('readonly shell chained mutation blocked', evaluateToolGuard('readonly', ctx('shell_command', 'npm test; rm -rf src')).block === true);
  check('readonly shell piped redirect outside blocked', evaluateToolGuard('readonly', ctx('shell_command', 'git log | Out-File src/log.txt')).block === true);
  check('readonly shell sudo rm blocked', evaluateToolGuard('readonly', ctx('shell_command', 'sudo rm -rf src')).block === true);
  check('readonly shell cmd /c rm blocked', evaluateToolGuard('readonly', ctx('shell_command', 'cmd /c rm -rf src')).block === true);
  check('readonly shell timeout rm blocked', evaluateToolGuard('readonly', ctx('shell_command', 'timeout 5 rm -rf src')).block === true);
  check('readonly shell env mutation blocked', evaluateToolGuard('readonly', ctx('shell_command', 'env FOO=1 rm -rf src')).block === true);
  check('readonly shell sudo git status allowed', evaluateToolGuard('readonly', ctx('shell_command', 'sudo git status')).block === false);
  check('readonly shell env npm test allowed', evaluateToolGuard('readonly', ctx('shell_command', 'env CI=1 npm test')).block === false);

  if (failed > 0) {
    console.error(`\nValidation FAILED with ${failed} errors.`);
    process.exit(1);
  }
  console.log('\nALL readonly checks passed!');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}