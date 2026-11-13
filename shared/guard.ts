import {existsSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join, resolve, dirname} from 'node:path';

export type ProfileMode = 'writer' | 'readonly';

export interface GuardContext {
  toolName: string;
  input: unknown;
  cwd: string;
  scratchDirs?: string[];
  persona?: string;
}

export interface GuardDecision {
  block: boolean;
  reason?: string;
}

export type ShellKind = 'powershell' | 'posix';

export type ShellVars = Map<string, string>;

export interface SubstitutionScan {
  inner: string[];
  masked: string;
}

export interface ShellRedirectScan {
  targets: string[];
  body: string;
}

function isInsideRoot(target: string, root: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  if (resolvedTarget === resolvedRoot) return false;
  const prefix = resolvedRoot.endsWith('/') || resolvedRoot.endsWith('\\') ? resolvedRoot : resolvedRoot + '\\';
  // handle both separators
  let normalizedTarget = resolvedTarget.replace(/\//g, '\\');
  let normalizedRoot = resolvedRoot.replace(/\//g, '\\');
  if (process.platform === 'win32') {
    normalizedTarget = normalizedTarget.toLowerCase();
    normalizedRoot = normalizedRoot.toLowerCase();
  }
  const rootWithSep = normalizedRoot.endsWith('\\') ? normalizedRoot : normalizedRoot + '\\';
  return normalizedTarget.startsWith(rootWithSep);
}

function hasUnsafeTraversal(rawPath: string): boolean {
  const segments = rawPath.split(/[/\\\\]/);
  for (const seg of segments) {
    if (seg.trim() === '..') return true;
  }
  return false;
}

function allowedRighthandRoot(target: string): string | null {
  let dir = dirname(target);
  while (true) {
    if (dir.split(/[/\\]/).pop() === '.righthand') {
      const root = dirname(dir);
      if (existsSync(join(root, '.git')) || existsSync(join(root, 'package.json'))) {
        return dir;
      }
      return null;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * A release edits the version in the manifests at the checkout root. A file with
 * the same name deeper in the tree is ordinary source and stays blocked, and so
 * does any path that walks out of the root.
 */
function isReleaseFile(target: string, cwd: string, rawPath: string): boolean {
  if (hasUnsafeTraversal(rawPath)) return false;
  const root = resolve(cwd);
  const resolvedTarget = resolve(target);
  if (dirname(resolvedTarget) !== root) return false;
  return RELEASE_FILES.has(resolvedTarget.split(/[/\\]/).pop()?.toLowerCase() ?? '');
}

/**
 * Writing `package.json` would otherwise be an execution primitive: add a
 * `scripts` entry, then run it with the already-allowed `npm run`. A bump only
 * needs the version fields, so every other field must survive untouched.
 */
function versionOnlyChange(previous: string, next: string): boolean {
  let before: unknown;
  let after: unknown;
  try {
    before = JSON.parse(previous);
    after = JSON.parse(next);
  } catch {
    return false;
  }
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return false;
  const strip = (value: Record<string, unknown>): Record<string, unknown> => {
    const copy: Record<string, unknown> = {...value};
    delete copy.version;
    return copy;
  };
  return JSON.stringify(strip(before as Record<string, unknown>)) === JSON.stringify(strip(after as Record<string, unknown>));
}

/**
 * Reads the current manifest through the same path the write targets, and allows
 * the write only when the change is a version bump.
 */
function releaseWriteAllowed(target: string, rawPath: string, input: Record<string, unknown>): boolean {
  const next = typeof input.content === 'string' ? input.content : typeof input.new_string === 'string' ? input.new_string : null;
  let previous: string;
  try {
    previous = readFileSync(target, 'utf8');
  } catch {
    return false;
  }
  if (next !== null) {
    return versionOnlyChange(previous, next);
  }
  return false;
}

function isAllowedWritePath(target: string, scratchDirs?: string[], rawPath?: string): boolean {
  if (rawPath && hasUnsafeTraversal(rawPath)) {
    return false;
  }
  const rhDir = allowedRighthandRoot(target);
  if (rhDir) {
    const normTarget = target.replace(/\//g, '\\').toLowerCase();
    const normRh = rhDir.replace(/\//g, '\\').toLowerCase();
    const sep = '\\';
    const rootWithSep = normRh.endsWith(sep) ? normRh : normRh + sep;
    if (normTarget.startsWith(rootWithSep)) {
      return true;
    }
  }
  if (scratchDirs) {
    for (const dir of scratchDirs) {
      if (isInsideRoot(target, dir)) return true;
    }
  }
  return false;
}

const SHELL_INTERPRETERS = new Set([
  'node', 'nodejs', 'deno', 'bun', 'python', 'python3', 'py',
  'pwsh', 'powershell', 'bash', 'sh', 'zsh', 'fish',
]);

const POWERSHELL_FILE_CMDLETS = new Set([
  'set-content', 'add-content', 'clear-content', 'set-item', 'new-item', 'remove-item',
  'move-item', 'copy-item', 'rename-item', 'set-itemproperty', 'new-itemproperty',
  'remove-itemproperty', 'export-csv', 'export-clixml', 'set-acl', 'out-file',
  'tee-object', 'start-transcript', 'stop-transcript', 'compress-archive',
  'expand-archive', 'clear-recyclebin',
]);

const POWERSHELL_PATH_FLAGS = new Set([
  '-path', '-filepath', '-literalpath', '-destination', '-outfile', '-target', '-name',
]);

const POWERSHELL_VALUE_FLAGS = new Set([
  '-value', '-encoding', '-itemtype', '-type', '-inputobject', '-filter', '-include',
  '-exclude', '-stream', '-separator', '-width', '-credential', '-delimiter', '-replace',
  '-namespace', '-property', '-propertytype',
]);

const POSIX_FILE_MUTATORS = new Set([
  'rm', 'rmdir', 'rd', 'del', 'erase', 'mv', 'move', 'cp', 'copy', 'touch', 'mkdir',
  'md', 'tee', 'truncate', 'ln', 'chmod', 'chown', 'sed', 'patch',
]);

const GIT_READ_SUBCOMMANDS = new Set([
  'status', 'log', 'diff', 'show', 'describe', 'rev-parse', 'rev-list', 'ls-files',
  'ls-tree', 'ls-remote', 'cat-file', 'shortlog', 'blame', 'grep', 'for-each-ref',
  'merge-base', 'name-rev', 'var', 'help', 'whatchanged', 'count-objects', 'fsck',
  'show-ref', 'show-branch', 'cherry', 'check-ignore', 'check-attr', 'check-ref-format',
  'verify-commit', 'difftool', 'mergetool', 'range-diff', 'version', 'annotate',
  'diff-tree', 'diff-index', 'diff-files',
]);

/**
 * Readonly personas with release and integration duties: fetch, rebase, push,
 * edit a pull request, and cut a version. Everyone else stays fully readonly,
 * and a session with no persona gets nothing.
 */
const PRIVILEGED_PERSONAS = new Set(['orchestrator']);

/**
 * The only repository files the release persona may write. Both live at the
 * checkout root; a copy under a subdirectory is not a release file.
 */
const RELEASE_FILES = new Set(['package.json', 'package-lock.json']);

/**
 * The only git subcommands the privileged persona may run beyond the read set.
 * Each one is still filtered so it cannot destroy work or run a command.
 */
const GIT_INTEGRATION_SUBCOMMANDS = new Set(['fetch', 'push', 'rebase']);

const GIT_INTEGRATION_BLOCKED_FLAGS = new Set([
  '-f', '--force', '-d', '--delete', '--mirror', '--all', '--tags',
  '--follow-tags', '--no-verify', '--exec', '-x', '--upload-pack', '--receive-pack',
  '-o', '--push-option',
]);

/**
 * A refspec can delete (`:branch`) or force (`+branch`) a ref without any flag,
 * and the privileged persona must never push to the default branch. A tag
 * refspec (`v1.2.3`, `refs/tags/v1.2.3`) stays allowed: releasing needs it.
 * `--force-with-lease` stays allowed because `integration-flow` requires it.
 */
function pushRefspecBlocked(positionals: string[]): boolean {
  const refspecs = positionals.slice(1);
  for (const refspec of refspecs) {
    if (refspec.startsWith(':') || refspec.startsWith('+')) return true;
    const destination = refspec.includes(':') ? refspec.slice(refspec.indexOf(':') + 1) : refspec;
    if (destination === 'main' || destination === 'refs/heads/main') return true;
  }
  return false;
}

/**
 * A release commit and an annotated tag both open an editor when no message is
 * supplied, which would hang a dispatched agent instead of failing, so the
 * message flag is required rather than merely recommended.
 */
function messageSupplied(flags: string[]): boolean {
  return flags.some((flag) => /^(-m|-F|-C)$|^--(message|file|reuse-message|fixup|squash)=/.test(flag))
    || flags.some((flag) => ['-m', '-F', '-C'].includes(flag));
}

function gitCommitBlocked(flags: string[]): boolean {
  if (flags.some((flag) => ['--amend', '--no-verify', '-n'].includes(flag))) return true;
  return !messageSupplied(flags);
}

function gitTagBlocked(flags: string[], positionals: string[]): boolean {
  if (flags.some((flag) => ['-d', '--delete', '-f', '--force'].includes(flag))) return true;
  // `-e`/`--edit` and an annotated tag without a message both wait on an editor.
  if (flags.some((flag) => ['-e', '--edit'].includes(flag))) return true;
  // Listing is read-only and needs no name or message.
  if (flags.some((flag) => ['-l', '--list'].includes(flag))) return false;
  if (positionals.length === 0) return true;
  const annotated = flags.some((flag) => ['-a', '--annotate', '-s', '--sign'].includes(flag));
  return annotated && !messageSupplied(flags);
}


/**
 * gh commands that change shared state other work depends on: merging, closing,
 * reviewing, retargeting a PR, deleting, publishing releases or gists,
 * credentials, secrets and repo configuration. These stay blocked for readonly
 * personas.
 *
 * Content-append verbs are deliberately absent: `issue create/comment/edit` and
 * `pr create/comment` publish text to the remote but change nothing on disk and
 * nothing another lane builds on. `pr edit` is NOT in that set because it can
 * retarget the base branch, and `gist create` is NOT either because it publishes
 * local file contents.
 */
const GH_MUTATING_PATTERNS: RegExp[] = [
  /^pr\s+(merge|close|reopen|ready|lock|unlock|checkout|review|edit)\b/,
  /^issue\s+(close|reopen|delete|lock|unlock|transfer|develop)\b/,
  /^release\s+(create|delete|edit|upload)\b/,
  /^repo\s+(create|delete|edit|rename|archive|unarchive|fork|clone|sync|set-default)\b/,
  /^workflow\s+(run|enable|disable)\b/,
  /^run\s+(cancel|rerun|delete)\b/,
  /^label\s+(create|edit|delete|clone)\b/,
  /^(secret|variable)\s+(set|delete)\b/,
  /^gist\s+(create|delete|edit)\b/,
  /^auth\s+(login|logout|setup-git|refresh|token)\b/,
  /^extension\s+(install|remove|upgrade)\b/,
  /^config\s+set\b/,
];

const PACKAGE_MUTATING_SUBCOMMANDS = new Set([
  'install', 'i', 'add', 'uninstall', 'un', 'remove', 'rm', 'r', 'update', 'up',
  'upgrade', 'publish', 'unpublish', 'version', 'link', 'ci', 'dedupe', 'prune',
  'rebuild', 'pack', 'init',
]);

function lookupShellVar(name: string, vars?: ShellVars): string | undefined {
  if (!vars) return undefined;
  if (vars.has(name)) return vars.get(name);
  const lower = name.toLowerCase();
  if (vars.has(lower)) return vars.get(lower);
  return undefined;
}

function expandShellToken(token: string, vars?: ShellVars): string {
  let value = token;
  value = value.replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (match, name: string) => process.env[name] ?? match);
  value = value.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (match, name: string) => process.env[name] ?? match);
  const substitute = (input: string): string => input.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced: string | undefined, plain: string | undefined) => {
    const name = braced ?? plain;
    if (!name) return match;
    const fromVars = lookupShellVar(name, vars);
    if (fromVars !== undefined) return fromVars;
    return process.env[name] ?? match;
  });
  value = substitute(value);
  // a variable whose value contains another variable or an $env: reference
  const second = substitute(value.replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (match, name: string) => process.env[name] ?? match));
  if (second !== value) value = second;
  if (value === '~' || value.startsWith('~/') || value.startsWith('~\\')) {
    value = join(homedir(), value.slice(1));
  }
  return value;
}

/**
 * Record simple variable assignments so a path built from a variable can still be
 * resolved when the assignment happens earlier in the same command.
 * Supports `NAME=value` (bash) and `$NAME = value` / `$NAME=value` (PowerShell).
 * Only literal values are recorded; anything unresolved stays unresolvable, which
 * keeps the guard fail-closed.
 */
function collectShellVars(segment: string, vars: ShellVars): void {
  const body = scanShellRedirects(segment).body;
  const tokens = tokenizeShellSegment(body);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const posix = /^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/.exec(token);
    if (posix) {
      vars.set(posix[1], expandShellToken(posix[2].replace(/^["']|["']$/g, ''), vars));
      continue;
    }
    const psInline = /^\$([A-Za-z_][A-Za-z0-9_]*)=(.+)$/.exec(token);
    if (psInline) {
      vars.set(psInline[1], expandShellToken(psInline[2].replace(/^["']|["']$/g, ''), vars));
      continue;
    }
    const psSpaced = /^\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(token);
    if (psSpaced && tokens[i + 1] === '=') {
      const rawValue = (tokens[i + 2] ?? '').replace(/^["']|["']$/g, '');
      if (rawValue) vars.set(psSpaced[1], expandShellToken(rawValue, vars));
      i += 2;
    }
  }
}

function looksLikePathToken(token: string): boolean {
  if (!token || token.startsWith('-')) return false;
  if (token.startsWith('$') || token.startsWith('%')) return false;
  if (/^[A-Za-z]:[\\/]/.test(token)) return true;
  if (token.startsWith('/') || token.startsWith('\\')) return true;
  if (token.startsWith('./') || token.startsWith('../') || token.startsWith('.\\') || token.startsWith('..\\')) return true;
  if (/[\\/]/.test(token)) return true;
  return /\.(?:js|mjs|cjs|ts|mts|cts|jsx|tsx|json|py|ps1|sh|bat|cmd|rb|pl)$/i.test(token);
}

function splitShellSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ';' || ch === '\n' || ch === '\r') {
      segments.push(current);
      current = '';
      continue;
    }
    if (ch === '|') {
      segments.push(current);
      current = '';
      if (command[i + 1] === '|') i++;
      continue;
    }
    if (ch === '&' && command[i + 1] === '&') {
      segments.push(current);
      current = '';
      i++;
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments.filter((segment) => segment.trim() !== '');
}

function tokenizeShellSegment(segment: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function scanShellRedirects(segment: string): ShellRedirectScan {
  const chars = segment.split('');
  const targets: string[] = [];
  let quote: string | null = null;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch !== '>') continue;
    const next = segment[i + 1];
    if (next === '&' || next === '=') continue;
    const start = i;
    let cursor = i + 1;
    if (next === '>') cursor += 1;
    while (cursor < segment.length && /\s/.test(segment[cursor])) cursor++;
    if (cursor >= segment.length) {
      for (let k = start; k < cursor; k++) chars[k] = ' ';
      continue;
    }
    let target = '';
    if (segment[cursor] === '"' || segment[cursor] === "'") {
      const quoteChar = segment[cursor];
      cursor += 1;
      while (cursor < segment.length && segment[cursor] !== quoteChar) {
        target += segment[cursor];
        cursor++;
      }
      cursor += 1;
    } else {
      while (cursor < segment.length && !/[\s;|&]/.test(segment[cursor])) {
        target += segment[cursor];
        cursor++;
      }
    }
    targets.push(target);
    for (let k = start; k < cursor; k++) chars[k] = ' ';
    i = cursor - 1;
  }
  return {targets, body: chars.join('')};
}

function targetAllowed(rawTarget: string, cwd: string, scratchDirs?: string[], vars?: ShellVars, privilegedRepoRoot = false): boolean {
  const expanded = expandShellToken(rawTarget.trim(), vars).replace(/^["']|["']$/g, '');
  if (!expanded) return false;
  const lower = expanded.toLowerCase();
  if (lower === 'nul' || lower === '/dev/null' || lower === '$null') return true;
  if (hasUnsafeTraversal(expanded)) return false;
  const target = resolve(cwd, expanded);
  if (privilegedRepoRoot && isInsideRoot(target, cwd)) return true;
  return isAllowedWritePath(target, scratchDirs, expanded);
}

function posixTargets(tokens: string[], command: string): string[] {
  const targets: string[] = [];
  let skipNextPositional = command === 'chmod' || command === 'chown' || command === 'sed';
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('-')) continue;
    if (skipNextPositional) {
      skipNextPositional = false;
      continue;
    }
    targets.push(token);
  }
  return targets;
}

function powershellTargets(tokens: string[]): string[] {
  const targets: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const isSlashFlag = /^\/[A-Za-z][A-Za-z0-9-]*$/.test(token);
    if (!token.startsWith('-') && !isSlashFlag) {
      targets.push(token);
      continue;
    }
    const lower = token.toLowerCase();
    if (POWERSHELL_PATH_FLAGS.has(lower)) {
      const next = tokens[i + 1];
      if (next && !next.startsWith('-')) {
        targets.push(next);
        i++;
      }
      continue;
    }
    if (POWERSHELL_VALUE_FLAGS.has(lower)) {
      i++;
    }
  }
  return targets;
}

function displayMutationTarget(target: string, cwd: string, vars?: ShellVars): string {
  const normalizedCwd = resolve(cwd).replace(/\\/g, '/');
  const normalizedTarget = resolve(cwd, expandShellToken(target.trim(), vars)).replace(/\\/g, '/');
  const compareCwd = process.platform === 'win32' ? normalizedCwd.toLowerCase() : normalizedCwd;
  const compareTarget = process.platform === 'win32' ? normalizedTarget.toLowerCase() : normalizedTarget;
  const rootPrefix = compareCwd.endsWith('/') ? compareCwd : compareCwd + '/';
  if (compareTarget === compareCwd) return '.';
  if (compareTarget.startsWith(rootPrefix)) return normalizedTarget.slice(rootPrefix.length);
  if (!/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(target)) return target;
  return normalizedTarget.split('/').pop() || target;
}

function mutationTargetsBlocked(targets: string[], cwd: string, scratchDirs?: string[], vars?: ShellVars): boolean {
  if (targets.length === 0) return true;
  for (const target of targets) {
    if (!targetAllowed(target, cwd, scratchDirs, vars)) return true;
  }
  return false;
}

function interpreterBlocked(command: string, args: string[], cwd: string, scratchDirs?: string[], vars?: ShellVars, privileged = false): boolean {
  const lower = args.map((arg) => arg.toLowerCase());

  if (command === 'node' || command === 'nodejs' || command === 'deno' || command === 'bun') {
    if (lower.some((arg) => arg === '-e' || arg === '--eval' || arg.startsWith('--eval='))) return true;
    if (command === 'deno' && lower[0] === 'eval') return true;
    const script = args.find((arg) => looksLikePathToken(arg));
    if (!script) return false;
    return !targetAllowed(script, cwd, scratchDirs, vars, privileged);
  }

  if (command === 'python' || command === 'python3' || command === 'py') {
    if (lower.some((arg) => arg === '-c' || arg === '-m' || arg === '-')) return true;
    const script = args.find((arg) => looksLikePathToken(arg));
    if (!script) return false;
    return !targetAllowed(script, cwd, scratchDirs, vars, privileged);
  }

  if (command === 'pwsh' || command === 'powershell') {
    if (lower.some((arg) => /^(-command|-c|-encodedcommand|-ec)$/.test(arg))) return true;
    const fileIndex = lower.findIndex((arg) => arg === '-file' || arg === '-f');
    if (fileIndex >= 0) {
      const target = args[fileIndex + 1];
      if (!target) return true;
      return !targetAllowed(target, cwd, scratchDirs, vars, privileged);
    }
    const script = args.find((arg) => looksLikePathToken(arg));
    if (script) return !targetAllowed(script, cwd, scratchDirs, vars, privileged);
    return true;
  }

  if (command === 'bash' || command === 'sh' || command === 'zsh' || command === 'fish') {
    if (lower.some((arg) => arg === '-c' || arg === '--command')) return true;
    const script = args.find((arg) => looksLikePathToken(arg));
    if (!script) return false;
    return !targetAllowed(script, cwd, scratchDirs, vars, privileged);
  }

  return true;
}

function gitSubcommandBlocked(subcommand: string, args: string[], privileged = false): boolean {
  const flags = args.filter((arg) => arg.startsWith('-'));
  const positionals = args.filter((arg) => !arg.startsWith('-'));
  const flagMatches = (pattern: RegExp): boolean => flags.some((flag) => pattern.test(flag));

  if (privileged && subcommand === 'add') {
    // Staging a bump only: no force, no interactive edit, no shell execution.
    if (flags.some((flag) => ['-f', '--force', '-p', '--patch', '-i', '--interactive', '-e', '--edit', '-N', '--intent-to-add'].includes(flag))) return true;
    return false;
  }

  if (privileged && GIT_INTEGRATION_SUBCOMMANDS.has(subcommand)) {
    if (flags.some((flag) => GIT_INTEGRATION_BLOCKED_FLAGS.has(flag))) return true;
    if (flags.some((flag) => /^-o.+/.test(flag))) return true;
    if (flags.some((flag) => /^--(exec|receive-pack|upload-pack|push-option)=/.test(flag))) return true;
    if (subcommand === 'push' && pushRefspecBlocked(positionals)) return true;
    return false;
  }

  if (privileged && subcommand === 'commit') {
    return gitCommitBlocked(flags);
  }

  if (privileged && subcommand === 'tag') {
    return gitTagBlocked(flags, positionals);
  }

  switch (subcommand) {
    case 'branch':
      if (flagMatches(/^(-d|-D|-m|-M|-c|-C|-u|-f|--delete|--move|--copy|--force|--set-upstream-to|--unset-upstream|--edit-description|--create-reflog)/)) return true;
      if (positionals.length > 0 && !flagMatches(/^(-l|--list|--contains|--no-contains|--merged|--no-merged|--points-at)/)) return true;
      return false;
    case 'tag':
      if (flagMatches(/^(-a|--annotate|-d|--delete|-m|--message|-F|--file|-s|--sign|-f|--force|-u|--local-user|-e|--edit|--cleanup)/)) return true;
      if (positionals.length > 0 && !flagMatches(/^(-l|--list)/)) return true;
      return false;
    case 'worktree':
      return !(positionals.length === 0 || positionals[0].toLowerCase() === 'list');
    case 'remote':
      if (positionals.length === 0) return false;
      return !['show', 'get-url'].includes(positionals[0].toLowerCase());
    case 'stash':
      return !(positionals.length > 0 && ['list', 'show'].includes(positionals[0].toLowerCase()));
    case 'reflog':
      return !(positionals.length === 0 || ['show', 'list'].includes(positionals[0].toLowerCase()));
    case 'config':
      if (flagMatches(/^(--unset|--unset-all|--add|--replace-all|--rename-section|--remove-section)/)) return true;
      return positionals.length > 1;
    case 'submodule':
      return !(positionals.length === 0 || ['status', 'summary'].includes(positionals[0].toLowerCase()));
    case 'notes':
      return !(positionals.length === 0 || ['list', 'show'].includes(positionals[0].toLowerCase()));
    default:
      return !GIT_READ_SUBCOMMANDS.has(subcommand);
  }
}

function gitBlocked(args: string[], privileged = false): boolean {
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    if (token === '-C' || token === '-c' || token === '--git-dir' || token === '--work-tree') {
      index += 2;
      continue;
    }
    if (token.startsWith('-')) {
      index += 1;
      continue;
    }
    break;
  }
  const subcommand = (args[index] || '').toLowerCase();
  if (!subcommand) return false;
  return gitSubcommandBlocked(subcommand, args.slice(index + 1), privileged);
}

function ghBlocked(args: string[], privileged = false): boolean {
  const positional = args.filter((arg) => !arg.startsWith('-')).map((arg) => arg.toLowerCase()).join(' ');
  // The privileged persona maintains an open pull request and cuts the release
  // that follows a merge. Merging, closing and repo surgery stay blocked.
  const privilegedAllowed = privileged && (/^pr\s+edit\b/.test(positional) || /^release\s+(create|edit|delete|upload)\b/.test(positional));
  if (!privilegedAllowed && GH_MUTATING_PATTERNS.some((pattern) => pattern.test(positional))) return true;

  if ((args[0] || '').toLowerCase() === 'api') {
    const methodIndex = args.findIndex((arg) => /^(-X|--method)$/i.test(arg));
    if (methodIndex >= 0) {
      const method = (args[methodIndex + 1] || '').toUpperCase();
      if (method !== 'GET') return true;
    }
    if (args.some((arg) => /^--method=(?!GET$)/i.test(arg))) return true;
    if (args.some((arg) => /^(-f|--field|--raw-field|--input)$/i.test(arg))) return true;
  }

  // Everything not listed above is either read-only (`gh pr view`, `gh issue
  // list`) or content-append (`gh issue create`, `gh pr comment`). Neither can
  // mutate the working tree, so a readonly persona may run it.
  return false;
}

function packageManagerBlocked(args: string[]): boolean {
  let index = 0;
  while (index < args.length && args[index].startsWith('-')) {
    if (['--prefix', '--dir', '-C', '-w', '--workspace'].includes(args[index])) index += 2;
    else index += 1;
  }
  const subcommand = (args[index] || '').toLowerCase();
  if (!subcommand) return false;
  return PACKAGE_MUTATING_SUBCOMMANDS.has(subcommand);
}

const SHELL_WRAPPERS = new Set([
  'sudo', 'doas', 'env', 'command', 'exec', 'nohup', 'nice', 'ionice', 'time',
  'timeout', 'xargs', 'start', 'cmd',
]);

function stripShellWrapper(command: string, args: string[]): string[] | null {
  if (!SHELL_WRAPPERS.has(command)) return null;

  let index = 0;
  if (command === 'cmd') {
    while (index < args.length && /^[/-][a-z]$/i.test(args[index])) index++;
    return args.slice(index);
  }
  if (command === 'timeout') {
    while (index < args.length && args[index].startsWith('-')) index++;
    if (index < args.length) index++;
    return args.slice(index);
  }
  while (index < args.length) {
    const token = args[index];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      index++;
      continue;
    }
    if (token.startsWith('-') || token.startsWith('/')) {
      const takesValue = ['-u', '-g', '-p', '-C', '-n', '-t', '-U', '-r', '-a', '--user', '--group'].includes(token);
      index += takesValue ? 2 : 1;
      continue;
    }
    break;
  }
  return args.slice(index);
}

function commandBlocked(command: string, rawCommand: string, args: string[], cwd: string, scratchDirs?: string[], vars?: ShellVars, privileged = false): boolean {
  if (SHELL_INTERPRETERS.has(command)) return interpreterBlocked(command, args, cwd, scratchDirs, vars, privileged);
  if (command === 'git') return gitBlocked(args, privileged);
  if (command === 'gh') return ghBlocked(args, privileged);
  if (command === 'npm' || command === 'pnpm' || command === 'yarn') return packageManagerBlocked(args);

  if (command === 'sed' && !args.some((arg) => /^-i/.test(arg) || /^--in-place/.test(arg))) return false;

  if (POWERSHELL_FILE_CMDLETS.has(command)) {
    return mutationTargetsBlocked(powershellTargets([rawCommand, ...args]), cwd, scratchDirs, vars);
  }

  if (POSIX_FILE_MUTATORS.has(command)) {
    if (command === 'patch') return true;
    return mutationTargetsBlocked(posixTargets([rawCommand, ...args], command), cwd, scratchDirs, vars);
  }

  return false;
}

function shellSegmentBlocked(segment: string, cwd: string, scratchDirs?: string[], vars?: ShellVars, privileged = false): boolean {
  const redirects = scanShellRedirects(segment);
  for (const target of redirects.targets) {
    if (!targetAllowed(target, cwd, scratchDirs, vars)) return true;
  }

  const tokens = tokenizeShellSegment(redirects.body);
  let start = 0;
  while (start < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[start])) start++;

  let commandTokens = tokens.slice(start);
  for (let depth = 0; commandTokens.length > 0 && depth < 8; depth++) {
    const rawCommand = commandTokens[0];
    const command = (rawCommand.split(/[\\/]/).pop() ?? rawCommand).replace(/\.exe$/i, '').toLowerCase();
    const args = commandTokens.slice(1);
    const stripped = stripShellWrapper(command, args);
    if (stripped) {
      commandTokens = stripped;
      continue;
    }
    return commandBlocked(command, rawCommand, args, cwd, scratchDirs, vars, privileged);
  }

  return false;
}

/**
 * Index of the character that closes a substitution opened at `openIndex`,
 * or -1 when it never closes.
 */
function findSubstitutionEnd(command: string, openIndex: number, kind: ShellKind): number {
  if (command[openIndex] === '`') {
    for (let i = openIndex + 1; i < command.length; i++) {
      if (kind === 'posix' && command[i] === '\\') { i += 1; continue; }
      if (command[i] === '`') return i;
    }
    return -1;
  }
  let depth = 1;
  let quote: string | null = null;
  for (let i = openIndex + 2; i < command.length; i++) {
    const ch = command[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (kind === 'powershell' ? ch === '`' : ch === '\\') { i += 1; continue; }
    if (quote === '"') {
      if (ch === '"') { quote = null; continue; }
    } else {
      if (ch === "'") { quote = "'"; continue; }
      if (ch === '"') { quote = '"'; continue; }
    }
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Split a command into the commands hidden in its substitutions and a masked
 * version of the outer text. Returns null when a substitution never closes.
 *
 * Forms handled: `$(...)`, a backtick pair and, on POSIX, `<(cmd)` / `>(cmd)`.
 *
 * Quoting differs per shell and both matter:
 * - single quotes make every form literal
 * - POSIX escapes with a backslash and still substitutes inside double quotes
 * - PowerShell escapes with a backtick, so `` `$( `` is literal text
 */
function scanCommandSubstitutions(command: string, kind: ShellKind): SubstitutionScan | null {
  const inner: string[] = [];
  let masked = '';
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote === "'") {
      masked += ch;
      if (ch === "'") quote = null;
      continue;
    }
    if (kind === 'powershell' ? ch === '`' : ch === '\\') {
      masked += ch;
      if (i + 1 < command.length) { masked += command[i + 1]; i += 1; }
      continue;
    }
    if (quote === '"') {
      if (ch === '"') { quote = null; masked += ch; continue; }
    } else {
      if (ch === "'") { quote = "'"; masked += ch; continue; }
      if (ch === '"') { quote = '"'; masked += ch; continue; }
    }
    const opensValue = ch === '$' && command[i + 1] === '(';
    const opensBacktick = ch === '`';
    const opensProcess = kind === 'posix' && (ch === '<' || ch === '>') && command[i + 1] === '(';
    if (!opensValue && !opensBacktick && !opensProcess) { masked += ch; continue; }
    const end = findSubstitutionEnd(command, i, kind);
    if (end < 0) return null;
    inner.push(command.slice(i + (opensBacktick ? 1 : 2), end));
    // the substitution's own text is not part of the outer command; a target
    // built from it stays unresolved and therefore blocked
    masked += ' __rh_subst__ ';
    i = end;
  }
  return { inner, masked };
}

function shellBlocked(command: string, cwd: string, scratchDirs?: string[], kind: ShellKind = 'posix', depth = 0, privileged = false): boolean {
  const trimmed = command.trim();
  if (!trimmed) return true;
  if (depth > 8) return true;
  const scan = scanCommandSubstitutions(trimmed, kind);
  if (!scan) return true;
  // A substitution runs its own command, so judge that command too instead of
  // refusing every use of one.
  for (const innerCommand of scan.inner) {
    if (shellBlocked(innerCommand, cwd, scratchDirs, kind, depth + 1, privileged)) return true;
  }
  const outer = scan.masked.trim();
  if (!outer) return true;
  const vars: ShellVars = new Map();
  for (const segment of splitShellSegments(outer)) {
    if (shellSegmentBlocked(segment, cwd, scratchDirs, vars, privileged)) return true;
    collectShellVars(segment, vars);
  }
  return false;
}

function shellBlockReason(command: string, cwd: string, scratchDirs: string[] | undefined, kind: ShellKind, privileged: boolean, persona?: string): string {
  const trimmed = command.trim();
  if (!trimmed) return 'shell input was unusable, so the call was refused rather than allowed';
  const scan = scanCommandSubstitutions(trimmed, kind);
  if (!scan) return 'shell command substitution was malformed and refused';
  for (const inner of scan.inner) {
    if (shellBlocked(inner, cwd, scratchDirs, kind, 0, privileged)) {
      const reason = shellBlockReason(inner, cwd, scratchDirs, kind, privileged, persona);
      return `shell command substitution was refused: ${reason}`;
    }
  }
  const segments = splitShellSegments(scan.masked);
  const vars: ShellVars = new Map();
  for (const segment of segments) {
    const redirects = scanShellRedirects(segment);
    if (redirects.targets.some((target) => !targetAllowed(target, cwd, scratchDirs, vars))) {
      return 'shell redirect target is outside the allowed write roots';
    }
    const tokens = tokenizeShellSegment(redirects.body);
    if (tokens.length === 0) {
      collectShellVars(segment, vars);
      continue;
    }
    let commandTokens = tokens;
    for (let depth = 0; depth < 8; depth++) {
      const wrappedCommand = commandTokens[0];
      const wrappedName = (wrappedCommand.split(/[\\/]/).pop() ?? wrappedCommand).replace(/\.exe$/i, '').toLowerCase();
      const unwrapped = stripShellWrapper(wrappedName, commandTokens.slice(1));
      if (!unwrapped) break;
      commandTokens = unwrapped;
    }
    const rawCommand = commandTokens[0];
    const executable = (rawCommand.split(/[\\/]/).pop() ?? rawCommand).replace(/\.exe$/i, '').toLowerCase();
    const args = commandTokens.slice(1);
    const lower = args.map((arg) => arg.toLowerCase());
    if (SHELL_INTERPRETERS.has(executable)) {
      if (lower.some((arg) => ['-e', '-c', '--eval', '--command', '-encodedcommand', '-ec'].includes(arg) || arg.startsWith('--eval='))) {
        return 'inline evaluation is always refused; write a script instead';
      }
      if (executable === 'deno' && lower[0] === 'eval') {
        return 'inline evaluation is always refused; write a script instead';
      }
      if ((executable === 'python' || executable === 'python3' || executable === 'py') && lower.some((arg) => arg === '-m' || arg === '-')) {
        return 'interpreter module or stdin execution is refused; run an allowed script file instead';
      }
      const script = args.find((arg) => looksLikePathToken(arg));
      if (script && !targetAllowed(script, cwd, scratchDirs, vars, privileged)) {
        return 'interpreter script must resolve inside .righthand/, the scratchpad, or (privileged only) the repo root';
      }
      return 'interpreter command was refused by the script execution rule';
    }
    if (executable === 'git' && gitBlocked(args, privileged)) {
      let index = 0;
      while (index < args.length) {
        if (['-C', '-c', '--git-dir', '--work-tree'].includes(args[index])) index += 2;
        else if (args[index].startsWith('-')) index += 1;
        else break;
      }
      const subcommand = (args[index] || 'unspecified').toLowerCase();
      const operationArgs = args.slice(index + 1);
      const flags = operationArgs.filter((arg) => arg.startsWith('-'));
      const positionals = operationArgs.filter((arg) => !arg.startsWith('-'));
      if (privileged && subcommand === 'push') {
        if (flags.some((flag) => ['-f', '--force', '-d', '--delete', '--mirror', '--all', '--tags', '--follow-tags'].includes(flag))
          || positionals.slice(1).some((refspec) => refspec.startsWith(':') || refspec.startsWith('+'))) {
          return 'force and delete pushes are refused; use --force-with-lease on your own ticket branch';
        }
        const protectedRef = positionals.slice(1).map((refspec) => refspec.includes(':') ? refspec.slice(refspec.indexOf(':') + 1) : refspec)
          .find((refspec) => refspec === 'main' || refspec === 'refs/heads/main');
        if (protectedRef) return `refusing to push to '${protectedRef}': the ticket branch is pushed, never the protected branch`;
        const blockedFlag = flags.find((flag) => GIT_INTEGRATION_BLOCKED_FLAGS.has(flag) || /^-o.+/.test(flag) || /^--(exec|receive-pack|upload-pack|push-option)=/.test(flag));
        if (blockedFlag) return `git push option '${blockedFlag}' is refused by the protected push options rule`;
      }
      if (privileged && subcommand === 'commit') {
        if (flags.includes('--amend')) return 'git commit --amend is refused; amend commits are not permitted';
        if (!messageSupplied(flags)) return 'git commit requires an explicit message with -m or -F';
        if (flags.some((flag) => ['--no-verify', '-n'].includes(flag))) return 'git commit --no-verify is refused by the commit verification rule';
      }
      if (privileged && subcommand === 'tag') {
        if (flags.some((flag) => ['-d', '--delete'].includes(flag))) return 'git tag delete is refused; deleting tags is not permitted';
        if (flags.some((flag) => ['-f', '--force'].includes(flag))) return 'git tag force is refused; replacing tags is not permitted';
        if (flags.some((flag) => ['-e', '--edit'].includes(flag))) return 'git tag edit is refused because it requires an interactive editor';
        if (!positionals.length) return 'git tag requires a tag name';
        if (flags.some((flag) => ['-a', '--annotate', '-s', '--sign'].includes(flag)) && !messageSupplied(flags)) return 'annotated git tag requires an explicit message';
      }
      if (privileged && GIT_INTEGRATION_SUBCOMMANDS.has(subcommand)) {
        const blockedFlag = flags.find((flag) => GIT_INTEGRATION_BLOCKED_FLAGS.has(flag) || /^-o.+/.test(flag) || /^--(exec|receive-pack|upload-pack|push-option)=/.test(flag));
        if (blockedFlag) return `git ${subcommand} option '${blockedFlag}' is refused by the integration safety rule`;
      }
      return `git allows read-only operations${privileged ? ' and privileged integration operations' : ''}; requested subcommand '${subcommand}' is not allowed`;
    }
    if (executable === 'gh' && ghBlocked(args, privileged)) {
      const positional = args.filter((arg) => !arg.startsWith('-')).map((arg) => arg.toLowerCase());
      const operation = positional.slice(0, 2).join(' ') || 'unspecified';
      if (GH_MUTATING_PATTERNS.some((pattern) => pattern.test(positional.join(' ')))) {
        const category = operation.startsWith('repo ') ? 'repo-surgery'
          : /\bmerge\b/.test(operation) ? 'merge'
            : /\bclose\b/.test(operation) ? 'close'
              : /\bdelete\b/.test(operation) ? 'delete'
                : 'mutation';
        return `gh operation '${operation}' is refused: ${category} is not permitted for ${persona || 'readonly persona'}`;
      }
      if ((args[0] || '').toLowerCase() === 'api') return `gh operation '${operation}' is refused: API mutation is not permitted for ${persona || 'readonly persona'}`;
    }
    if (['npm', 'pnpm', 'yarn'].includes(executable) && packageManagerBlocked(args)) {
      let index = 0;
      while (index < args.length && args[index].startsWith('-')) {
        if (['--prefix', '--dir', '-C', '-w', '--workspace'].includes(args[index])) index += 2;
        else index += 1;
      }
      return `package manager operation '${args[index] || 'unspecified'}' was refused; use npm run <script> or npm test`;
    }
    if (POWERSHELL_FILE_CMDLETS.has(executable)) {
      const targets = powershellTargets(commandTokens);
      const rejected = targets.find((target) => !targetAllowed(target, cwd, scratchDirs, vars));
      if (rejected) {
        const displayTarget = displayMutationTarget(rejected, cwd, vars);
        return `file mutation target '${displayTarget}' is outside .righthand/ and the scratchpad`;
      }
      if (targets.length === 0) return 'file mutation was refused because no target was supplied; writes are limited to .righthand/ and the scratchpad';
    }
    if (POSIX_FILE_MUTATORS.has(executable)) {
      if (executable === 'patch') return 'patch command is refused; use an allowed file mutator inside .righthand/ or the scratchpad';
      const targets = posixTargets(commandTokens, executable);
      const rejected = targets.find((target) => !targetAllowed(target, cwd, scratchDirs, vars));
      if (rejected) {
        const displayTarget = displayMutationTarget(rejected, cwd, vars);
        return `file mutation target '${displayTarget}' is outside .righthand/ and the scratchpad`;
      }
      if (targets.length === 0) return 'file mutation was refused because no target was supplied; writes are limited to .righthand/ and the scratchpad';
    }
    collectShellVars(segment, vars);
  }
  if (scan.inner.length > 0) return 'shell command substitution was refused';
  if (/[;|&]/.test(trimmed)) return 'shell metacharacter was refused';
  return 'shell command was refused by an unclassified shell rule';
}

export function evaluateToolGuard(mode: ProfileMode | null, ctx: GuardContext): GuardDecision {
  if (mode !== 'readonly') {
    return { block: false };
  }

  const toolAliases: Record<string, string> = {
    write: 'write_file',
    edit: 'edit_file',
    read: 'read_file',
    find: 'glob',
  };
  const toolName = toolAliases[ctx.toolName] ?? ctx.toolName;
  const writeReason = (ctx.persona || 'readonly persona').toLowerCase() + ' is readonly: writes are limited to .righthand/ and the scratchpad. Put reports under .righthand/tickets/<ID>/reports/.';
  // Only the privileged persona gets the narrowed git/gh allowance. Every other
  // readonly persona keeps the strict guard, and a missing persona means no
  // allowance at all.
  const privileged = PRIVILEGED_PERSONAS.has((ctx.persona || '').toLowerCase());

  if (toolName === 'write_file' || toolName === 'edit_file') {
    let rawPath = '';
    try {
      const input = (ctx.input && typeof ctx.input === 'object') ? (ctx.input as Record<string, unknown>) : {};
      rawPath = typeof input.file_path === 'string' ? input.file_path : (typeof input.path === 'string' ? input.path : '');
    } catch {
      return { block: true, reason: 'write input was unusable, so the call was refused rather than allowed' };
    }
    if (!rawPath) {
      return { block: true, reason: 'write input was unusable, so the call was refused rather than allowed' };
    }
    const target = resolve(ctx.cwd, rawPath);
    if (privileged && isReleaseFile(target, ctx.cwd, rawPath)) {
      let input: Record<string, unknown> = {};
      try {
        input = (ctx.input && typeof ctx.input === 'object') ? (ctx.input as Record<string, unknown>) : {};
      } catch {
        return { block: true, reason: 'release manifest input was unusable, so the call was refused rather than allowed' };
      }
      // `edit_file` carries fragments, so the resulting manifest cannot be
      // reconstructed here. A bump writes the whole file instead.
      if (toolName === 'write_file' && releaseWriteAllowed(target, rawPath, input)) {
        return { block: false };
      }
      return {
        block: true,
        reason: toolName === 'edit_file'
          ? 'release manifest can only be written whole, never patched, because the fragment cannot be verified'
          : 'release manifest writes may only change the version and must preserve every other field',
      };
    }
    if (!isAllowedWritePath(target, ctx.scratchDirs, rawPath)) {
      return { block: true, reason: writeReason };
    }
    return { block: false };
  }

  const shellTools = new Set(['shell_command', 'powershell', 'bash', 'terminal']);
  if (shellTools.has(toolName)) {
    if (!ctx.input || typeof ctx.input !== 'object') {
      return { block: true, reason: 'shell input was unusable, so the call was refused rather than allowed' };
    }
    const input = ctx.input as Record<string, unknown>;
    const rawCmd = input.command ?? input.script;
    if (typeof rawCmd !== 'string' || rawCmd.trim() === '') {
      return { block: true, reason: 'shell input was unusable, so the call was refused rather than allowed' };
    }
    const command = rawCmd;
    // `powershell` and the default Windows shell escape with a backtick, so a
    // backtick there is not substitution. `bash`/`sh` always substitute.
    const shellKind: ShellKind = toolName === 'powershell' || (process.platform === 'win32' && toolName !== 'bash')
      ? 'powershell'
      : 'posix';
    if (shellBlocked(command, ctx.cwd, ctx.scratchDirs, shellKind, 0, privileged)) {
      return { block: true, reason: shellBlockReason(command, ctx.cwd, ctx.scratchDirs, shellKind, privileged, ctx.persona) };
    }
    return { block: false };
  }

  const safeTools = new Set(['read_file', 'grep', 'glob', 'ls', 'cat']);
  if (safeTools.has(toolName)) {
    return { block: false };
  }

  // unknown tool: fail closed if mutating fields present
  if (ctx.input && typeof ctx.input === 'object') {
    const input = ctx.input as Record<string, unknown>;
    const mutating = ['command', 'script', 'file_path', 'path', 'patch', 'content'];
    if (mutating.some((k) => k in input)) {
      return { block: true, reason: 'unknown tool carried a mutating field, so it was refused' };
    }
  }

  // read-only tools untouched
  return { block: false };
}
